// agent/src/terminal/pty/unix.rs
// Unix PTY 实现（Linux/macOS）

#[cfg(unix)]
use std::collections::HashMap;
use std::ffi::CString;
use std::io::{self, Read, Write};
use std::os::unix::io::{AsRawFd, RawFd};
use std::process::{Child, Command, Stdio};

extern crate libc;

pub struct UnixPty {
    master_fd: RawFd,
    child: Option<Child>,
    cols: u16,
    rows: u16,
}

impl UnixPty {
    /// 创建新的 PTY
    pub fn new(cols: u16, rows: u16) -> io::Result<Self> {
        let master_fd = unsafe {
            let fd = libc::posix_openpt(libc::O_RDWR | libc::O_NOCTTY);
            if fd < 0 {
                return Err(io::Error::last_os_error());
            }
            if libc::grantpt(fd) < 0 {
                libc::close(fd);
                return Err(io::Error::last_os_error());
            }
            if libc::unlockpt(fd) < 0 {
                libc::close(fd);
                return Err(io::Error::last_os_error());
            }
            fd
        };

        // 设置非阻塞
        unsafe {
            let flags = libc::fcntl(master_fd, libc::F_GETFL, 0);
            libc::fcntl(master_fd, libc::F_SETFL, flags | libc::O_NONBLOCK);
        }

        Ok(Self {
            master_fd,
            child: None,
            cols,
            rows,
        })
    }

    /// 获取 slave PTY 路径
    fn get_slave_name(&self) -> io::Result<String> {
        unsafe {
            let mut buf = [0i8; 512];
            if libc::ptsname_r(self.master_fd, buf.as_mut_ptr(), buf.len()) != 0 {
                return Err(io::Error::last_os_error());
            }
            let cstr = CString::from_raw(buf.as_ptr() as *mut i8);
            Ok(cstr.to_string_lossy().into_owned())
        }
    }

    /// 启动 shell 进程
    pub fn spawn(
        &mut self,
        shell_path: &str,
        cwd: Option<&str>,
        env: Option<&HashMap<String, String>>,
    ) -> io::Result<u32> {
        let slave_name = self.get_slave_name()?;
        
        // 打开 slave PTY（需要 3 个独立的 fd）
        let stdin_fd = unsafe {
            let fd = libc::open(
                CString::new(slave_name.as_str()).unwrap().as_ptr(),
                libc::O_RDWR,
            );
            if fd < 0 {
                return Err(io::Error::last_os_error());
            }
            fd
        };

        let stdout_fd = unsafe {
            let fd = libc::open(
                CString::new(slave_name.as_str()).unwrap().as_ptr(),
                libc::O_RDWR,
            );
            if fd < 0 {
                libc::close(stdin_fd);
                return Err(io::Error::last_os_error());
            }
            fd
        };

        let stderr_fd = unsafe {
            let fd = libc::open(
                CString::new(slave_name.as_str()).unwrap().as_ptr(),
                libc::O_RDWR,
            );
            if fd < 0 {
                libc::close(stdin_fd);
                libc::close(stdout_fd);
                return Err(io::Error::last_os_error());
            }
            fd
        };

        // 设置窗口大小
        if let Err(e) = self.set_winsize(stdin_fd) {
            unsafe {
                libc::close(stdin_fd);
                libc::close(stdout_fd);
                libc::close(stderr_fd);
            }
            return Err(e);
        }

        let mut cmd = Command::new(shell_path);
        
        if let Some(dir) = cwd {
            cmd.current_dir(dir);
        }

        if let Some(env_vars) = env {
            cmd.envs(env_vars);
        }

        // 设置 TERM 环境变量
        cmd.env("TERM", "xterm-256color");

        // 重定向 stdio 到 slave PTY
        unsafe {
            cmd.stdin(Stdio::from_raw_fd(stdin_fd));
            cmd.stdout(Stdio::from_raw_fd(stdout_fd));
            cmd.stderr(Stdio::from_raw_fd(stderr_fd));
        }

        // 创建新会话
        unsafe {
            cmd.pre_exec(|| {
                // 创建新会话并成为会话领导者
                if libc::setsid() < 0 {
                    return Err(io::Error::last_os_error());
                }
                // 设置控制终端
                if libc::ioctl(0, libc::TIOCSCTTY, 0) < 0 {
                    return Err(io::Error::last_os_error());
                }
                Ok(())
            });
        }

        let child = cmd.spawn()?;
        let pid = child.id();
        self.child = Some(child);

        // slave_fd 已经被 Command 接管，会在子进程中自动关闭

        Ok(pid)
    }

    /// 设置窗口大小
    fn set_winsize(&self, fd: RawFd) -> io::Result<()> {
        let winsize = libc::winsize {
            ws_row: self.rows,
            ws_col: self.cols,
            ws_xpixel: 0,
            ws_ypixel: 0,
        };

        unsafe {
            if libc::ioctl(fd, libc::TIOCSWINSZ, &winsize) < 0 {
                return Err(io::Error::last_os_error());
            }
        }

        Ok(())
    }

    /// 读取输出
    pub fn read(&self, buf: &mut [u8]) -> io::Result<usize> {
        unsafe {
            let n = libc::read(self.master_fd, buf.as_mut_ptr() as *mut libc::c_void, buf.len());
            if n < 0 {
                Err(io::Error::last_os_error())
            } else {
                Ok(n as usize)
            }
        }
    }

    /// 写入输入
    pub fn write(&self, data: &[u8]) -> io::Result<usize> {
        unsafe {
            let n = libc::write(self.master_fd, data.as_ptr() as *const libc::c_void, data.len());
            if n < 0 {
                Err(io::Error::last_os_error())
            } else {
                Ok(n as usize)
            }
        }
    }

    /// 调整窗口大小
    pub fn resize(&self, cols: u16, rows: u16) -> io::Result<()> {
        let winsize = libc::winsize {
            ws_row: rows,
            ws_col: cols,
            ws_xpixel: 0,
            ws_ypixel: 0,
        };

        unsafe {
            if libc::ioctl(self.master_fd, libc::TIOCSWINSZ, &winsize) < 0 {
                return Err(io::Error::last_os_error());
            }
        }

        Ok(())
    }

    /// 关闭 PTY
    pub fn close(&self, force: bool) -> io::Result<()> {
        if let Some(ref child) = self.child {
            let pid = child.id() as i32;
            unsafe {
                if force {
                    libc::kill(pid, libc::SIGKILL);
                } else {
                    libc::kill(pid, libc::SIGTERM);
                }
            }
        }
        Ok(())
    }

    /// 获取退出码
    pub fn get_exit_code(&self) -> Option<i32> {
        self.child.as_ref()?.try_wait().ok()?.and_then(|status| status.code())
    }

    /// 等待进程退出并获取退出码
    pub fn wait_exit_code(&mut self) -> Option<i32> {
        if let Some(mut child) = self.child.take() {
            child.wait().ok()?.code()
        } else {
            None
        }
    }
}

impl Drop for UnixPty {
    fn drop(&mut self) {
        unsafe {
            libc::close(self.master_fd);
        }
    }
}

impl AsRawFd for UnixPty {
    fn as_raw_fd(&self) -> RawFd {
        self.master_fd
    }
}
