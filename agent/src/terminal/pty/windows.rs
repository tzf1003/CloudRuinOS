// agent/src/terminal/pty/windows.rs
// Windows ConPTY 实现

#[cfg(windows)]
use std::collections::HashMap;
use std::io;
use std::ptr;
use winapi::shared::minwindef::{DWORD, FALSE};
use winapi::shared::ntdef::HANDLE;
use winapi::um::consoleapi::{ClosePseudoConsole, CreatePseudoConsole, ResizePseudoConsole};
use winapi::um::handleapi::{CloseHandle, INVALID_HANDLE_VALUE};
use winapi::um::namedpipeapi::{CreatePipe, SetNamedPipeHandleState};
use winapi::um::processthreadsapi::{
    CreateProcessW, GetExitCodeProcess, TerminateProcess, PROCESS_INFORMATION,
    InitializeProcThreadAttributeList, UpdateProcThreadAttribute, DeleteProcThreadAttributeList,
};
use winapi::um::winbase::{EXTENDED_STARTUPINFO_PRESENT, STARTUPINFOEXW};
use winapi::um::wincon::COORD;
use winapi::um::heapapi::{HeapAlloc, HeapFree, GetProcessHeap};
use winapi::um::fileapi::{ReadFile, WriteFile};

pub struct WindowsPty {
    pseudo_console: HANDLE,
    process_info: Option<PROCESS_INFORMATION>,
    pipe_in: HANDLE,
    pipe_out: HANDLE,
    cols: u16,
    rows: u16,
}

impl WindowsPty {
    /// 创建新的 ConPTY
    pub fn new(cols: u16, rows: u16) -> io::Result<Self> {
        unsafe {
            // 创建管道
            let mut pipe_in_read = INVALID_HANDLE_VALUE;
            let mut pipe_in_write = INVALID_HANDLE_VALUE;
            let mut pipe_out_read = INVALID_HANDLE_VALUE;
            let mut pipe_out_write = INVALID_HANDLE_VALUE;

            if CreatePipe(&mut pipe_in_read, &mut pipe_in_write, ptr::null_mut(), 0) == 0 {
                return Err(io::Error::last_os_error());
            }
            if CreatePipe(&mut pipe_out_read, &mut pipe_out_write, ptr::null_mut(), 0) == 0 {
                CloseHandle(pipe_in_read);
                CloseHandle(pipe_in_write);
                return Err(io::Error::last_os_error());
            }

            // 创建 ConPTY
            let coord = COORD {
                X: cols as i16,
                Y: rows as i16,
            };
            let mut pseudo_console = INVALID_HANDLE_VALUE;
            
            // PSEUDOCONSOLE_INHERIT_CURSOR = 1
            let hr = CreatePseudoConsole(
                coord,
                pipe_in_read,
                pipe_out_write,
                1, // 继承光标位置，启用 UTF-8 模式
                &mut pseudo_console,
            );

            if hr != 0 {
                CloseHandle(pipe_in_read);
                CloseHandle(pipe_in_write);
                CloseHandle(pipe_out_read);
                CloseHandle(pipe_out_write);
                return Err(io::Error::from_raw_os_error(hr as i32));
            }

            // 关闭不需要的管道端
            CloseHandle(pipe_in_read);
            CloseHandle(pipe_out_write);

            // 设置管道为非阻塞模式
            let mut mode: DWORD = 0x00000001; // PIPE_NOWAIT
            SetNamedPipeHandleState(
                pipe_out_read,
                &mut mode,
                ptr::null_mut(),
                ptr::null_mut(),
            );

            Ok(Self {
                pseudo_console,
                process_info: None,
                pipe_in: pipe_in_write,
                pipe_out: pipe_out_read,
                cols,
                rows,
            })
        }
    }

    /// 启动 shell 进程
    pub fn spawn(
        &mut self,
        shell_path: &str,
        cwd: Option<&str>,
        env: Option<&HashMap<String, String>>,
    ) -> io::Result<u32> {
        unsafe {
            let mut startup_info: STARTUPINFOEXW = std::mem::zeroed();
            startup_info.StartupInfo.cb = std::mem::size_of::<STARTUPINFOEXW>() as DWORD;

            let mut process_info: PROCESS_INFORMATION = std::mem::zeroed();

            // 构建命令行（需要 UTF-16）
            let cmd_line = if shell_path.to_lowercase().contains("powershell") {
                // PowerShell 需要特殊参数以启用 UTF-8
                format!("{} -NoLogo -NoProfile -ExecutionPolicy Bypass -Command \"[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [Console]::InputEncoding = [System.Text.Encoding]::UTF8; $Host.UI.RawUI.WindowTitle = 'Terminal'; while($true){{$cmd = Read-Host; if($cmd -eq 'exit'){{break}}; Invoke-Expression $cmd}}\"\0", shell_path)
            } else if shell_path.to_lowercase().contains("cmd") {
                // CMD 使用 chcp 65001 切换到 UTF-8
                format!("{} /K chcp 65001 >nul\0", shell_path)
            } else {
                format!("{}\0", shell_path)
            };
            
            let mut cmd_line_wide: Vec<u16> = cmd_line.encode_utf16().collect();

            // 工作目录
            let cwd_wide = cwd.map(|s| {
                let mut v: Vec<u16> = s.encode_utf16().collect();
                v.push(0);
                v
            });

            // 环境变量块（UTF-16，每个变量以 \0 结尾，整个块以 \0\0 结尾）
            let env_block = if let Some(env_map) = env {
                let mut block = String::new();
                for (key, value) in env_map {
                    block.push_str(&format!("{}={}\0", key, value));
                }
                block.push('\0');
                let mut wide: Vec<u16> = block.encode_utf16().collect();
                wide.push(0);
                Some(wide)
            } else {
                None
            };

            // 分配扩展启动信息
            let mut attr_list_size: usize = 0;
            InitializeProcThreadAttributeList(
                ptr::null_mut(),
                1,
                0,
                &mut attr_list_size,
            );

            let attr_list = HeapAlloc(
                GetProcessHeap(),
                0,
                attr_list_size,
            ) as *mut winapi::ctypes::c_void;

            if attr_list.is_null() {
                return Err(io::Error::last_os_error());
            }

            if InitializeProcThreadAttributeList(
                attr_list as *mut _,
                1,
                0,
                &mut attr_list_size,
            ) == 0
            {
                HeapFree(
                    GetProcessHeap(),
                    0,
                    attr_list,
                );
                return Err(io::Error::last_os_error());
            }

            // 附加 ConPTY 句柄
            if UpdateProcThreadAttribute(
                attr_list as *mut _,
                0,
                22, // PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE
                self.pseudo_console as *mut _,
                std::mem::size_of::<HANDLE>(),
                ptr::null_mut(),
                ptr::null_mut(),
            ) == 0
            {
                DeleteProcThreadAttributeList(attr_list as *mut _);
                HeapFree(
                    GetProcessHeap(),
                    0,
                    attr_list,
                );
                return Err(io::Error::last_os_error());
            }

            startup_info.lpAttributeList = attr_list as *mut _;

            let result = CreateProcessW(
                ptr::null(),
                cmd_line_wide.as_mut_ptr(),
                ptr::null_mut(),
                ptr::null_mut(),
                FALSE,
                EXTENDED_STARTUPINFO_PRESENT | 0x08000000, // CREATE_NO_WINDOW
                env_block
                    .as_ref()
                    .map_or(ptr::null_mut(), |v| v.as_ptr() as *mut _),
                cwd_wide.as_ref().map_or(ptr::null(), |v| v.as_ptr()),
                &mut startup_info.StartupInfo as *mut _ as *mut _,
                &mut process_info,
            );

            // 清理属性列表
            DeleteProcThreadAttributeList(attr_list as *mut _);
            HeapFree(
                GetProcessHeap(),
                0,
                attr_list,
            );

            if result == 0 {
                return Err(io::Error::last_os_error());
            }

            let pid = process_info.dwProcessId;
            self.process_info = Some(process_info);

            Ok(pid)
        }
    }

    /// 读取输出
    pub fn read(&self, buf: &mut [u8]) -> io::Result<usize> {
        unsafe {
            let mut bytes_read: DWORD = 0;
            let result = ReadFile(
                self.pipe_out,
                buf.as_mut_ptr() as *mut _,
                buf.len() as DWORD,
                &mut bytes_read,
                ptr::null_mut(),
            );

            if result == 0 {
                let err = io::Error::last_os_error();
                // ERROR_NO_DATA (232) 表示管道为空（非阻塞模式）
                if err.raw_os_error() == Some(232) {
                    return Err(io::Error::new(io::ErrorKind::WouldBlock, "No data available"));
                }
                Err(err)
            } else {
                Ok(bytes_read as usize)
            }
        }
    }

    /// 写入输入
    pub fn write(&self, data: &[u8]) -> io::Result<usize> {
        unsafe {
            let mut bytes_written: DWORD = 0;
            let result = WriteFile(
                self.pipe_in,
                data.as_ptr() as *const _,
                data.len() as DWORD,
                &mut bytes_written,
                ptr::null_mut(),
            );

            if result == 0 {
                Err(io::Error::last_os_error())
            } else {
                Ok(bytes_written as usize)
            }
        }
    }

    /// 调整窗口大小
    pub fn resize(&self, cols: u16, rows: u16) -> io::Result<()> {
        unsafe {
            let coord = COORD {
                X: cols as i16,
                Y: rows as i16,
            };
            let hr = ResizePseudoConsole(self.pseudo_console, coord);
            if hr != 0 {
                Err(io::Error::from_raw_os_error(hr as i32))
            } else {
                Ok(())
            }
        }
    }

    /// 关闭 PTY
    pub fn close(&self, force: bool) -> io::Result<()> {
        if let Some(ref info) = self.process_info {
            unsafe {
                if force {
                    TerminateProcess(info.hProcess, 1);
                } else {
                    // 发送 Ctrl+C（需要额外实现）
                    TerminateProcess(info.hProcess, 0);
                }
            }
        }
        Ok(())
    }

    /// 获取退出码
    pub fn get_exit_code(&self) -> Option<i32> {
        if let Some(ref info) = self.process_info {
            unsafe {
                let mut exit_code: DWORD = 0;
                if GetExitCodeProcess(info.hProcess, &mut exit_code) != 0 {
                    if exit_code == 259 {
                        // STILL_ACTIVE
                        None
                    } else {
                        Some(exit_code as i32)
                    }
                } else {
                    None
                }
            }
        } else {
            None
        }
    }
}

impl Drop for WindowsPty {
    fn drop(&mut self) {
        unsafe {
            if self.pseudo_console != INVALID_HANDLE_VALUE {
                ClosePseudoConsole(self.pseudo_console);
            }
            if self.pipe_in != INVALID_HANDLE_VALUE {
                CloseHandle(self.pipe_in);
            }
            if self.pipe_out != INVALID_HANDLE_VALUE {
                CloseHandle(self.pipe_out);
            }
            if let Some(ref info) = self.process_info {
                CloseHandle(info.hProcess);
                CloseHandle(info.hThread);
            }
        }
    }
}

// WindowsPty 包含原始句柄，但这些句柄在 Windows 上是线程安全的
// 我们需要手动实现 Send 和 Sync
unsafe impl Send for WindowsPty {}
unsafe impl Sync for WindowsPty {}
