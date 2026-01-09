// agent/src/terminal/pty/mod.rs
// PTY 平台抽象层

#[cfg(unix)]
pub mod unix;

#[cfg(windows)]
pub mod windows;

#[cfg(unix)]
pub use unix::UnixPty;

#[cfg(windows)]
pub use windows::WindowsPty;
