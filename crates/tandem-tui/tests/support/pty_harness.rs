use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

pub enum TestKey {
    Enter,
    Esc,
    Tab,
    BackTab,
    Up,
    Down,
    Left,
    Right,
    F1,
    Char(char),
    Ctrl(char),
    Alt(char),
}

pub struct TuiPtyHarness {
    child: Box<dyn portable_pty::Child + Send>,
    writer: Box<dyn Write + Send>,
    reader_rx: Receiver<Vec<u8>>,
    parser: vt100::Parser,
    frame_log: Vec<String>,
}

#[derive(Clone)]
pub struct MockHttpResponse {
    status: String,
    body: String,
    content_type: String,
}

pub struct MockEngineServer {
    addr: SocketAddr,
    running: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
}

impl TuiPtyHarness {
    pub fn spawn_tandem_tui() -> anyhow::Result<Self> {
        let bin = resolve_tui_binary()?;
        Self::spawn_command(&bin, &[])
    }

    pub fn spawn_tandem_tui_with_env(envs: &[(&str, &str)]) -> anyhow::Result<Self> {
        let bin = resolve_tui_binary()?;
        Self::spawn_command_with_env(&bin, &[], envs)
    }

    pub fn spawn_command(bin: &str, args: &[&str]) -> anyhow::Result<Self> {
        Self::spawn_command_with_env(bin, args, &[])
    }

    pub fn spawn_command_with_env(
        bin: &str,
        args: &[&str],
        envs: &[(&str, &str)],
    ) -> anyhow::Result<Self> {
        let pty_system = native_pty_system();
        let pair = pty_system.openpty(PtySize {
            rows: 40,
            cols: 120,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        let mut cmd = CommandBuilder::new(bin);
        for arg in args {
            cmd.arg(*arg);
        }
        cmd.env("TANDEM_TUI_TEST_MODE", "1");
        cmd.env("TANDEM_TUI_SYNC_RENDER", "off");
        for (key, value) in envs {
            cmd.env(*key, *value);
        }
        let child = pair.slave.spawn_command(cmd)?;
        drop(pair.slave);

        let mut reader = pair.master.try_clone_reader()?;
        let writer = pair.master.take_writer()?;

        let (tx, rx) = mpsc::channel::<Vec<u8>>();
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        if tx.send(buf[..n].to_vec()).is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        Ok(Self {
            child,
            writer,
            reader_rx: rx,
            parser: vt100::Parser::new(40, 120, 0),
            frame_log: Vec::new(),
        })
    }

    pub fn send_key(&mut self, key: TestKey) -> anyhow::Result<()> {
        let sequence = match key {
            TestKey::Enter => "\r".to_string(),
            TestKey::Esc => "\x1b".to_string(),
            TestKey::Tab => "\t".to_string(),
            TestKey::BackTab => "\x1b[Z".to_string(),
            TestKey::Up => "\x1b[A".to_string(),
            TestKey::Down => "\x1b[B".to_string(),
            TestKey::Right => "\x1b[C".to_string(),
            TestKey::Left => "\x1b[D".to_string(),
            TestKey::F1 => "\x1bOP".to_string(),
            TestKey::Char(c) => c.to_string(),
            TestKey::Ctrl(c) => {
                let upper = c.to_ascii_uppercase();
                let code = (upper as u8) & 0x1f;
                (code as char).to_string()
            }
            TestKey::Alt(c) => format!("\x1b{}", c),
        };
        self.writer.write_all(sequence.as_bytes())?;
        self.writer.flush()?;
        Ok(())
    }

    pub fn send_text(&mut self, text: &str) -> anyhow::Result<()> {
        self.writer.write_all(text.as_bytes())?;
        self.writer.flush()?;
        Ok(())
    }

    pub fn send_text_slow(&mut self, text: &str, delay: Duration) -> anyhow::Result<()> {
        for ch in text.chars() {
            self.send_text(&ch.to_string())?;
            std::thread::sleep(delay);
        }
        Ok(())
    }

    pub fn submit_command(&mut self, command: &str) -> anyhow::Result<()> {
        let mut composed = command.to_string();
        if composed.starts_with('/') && !composed.ends_with(' ') {
            composed.push(' ');
        }
        self.send_text_slow(&composed, Duration::from_millis(10))?;
        self.wait_for_text(&composed, Duration::from_secs(3))?;
        self.send_key(TestKey::Enter)?;
        Ok(())
    }

    pub fn wait_for_text(&mut self, needle: &str, timeout: Duration) -> anyhow::Result<()> {
        let deadline = Instant::now() + timeout;
        while Instant::now() < deadline {
            self.drain_output();
            let frame = self.screen_text();
            if frame.contains(needle) {
                return Ok(());
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        self.drain_output();
        anyhow::bail!(
            "timed out waiting for text: {}\nlast frame:\n{}",
            needle,
            self.screen_text()
        );
    }

    pub fn screen_text(&self) -> String {
        self.parser.screen().contents()
    }

    pub fn drain_output(&mut self) {
        while let Ok(chunk) = self.reader_rx.try_recv() {
            self.parser.process(&chunk);
            self.frame_log.push(self.parser.screen().contents());
            if self.frame_log.len() > 60 {
                let drain = self.frame_log.len() - 60;
                self.frame_log.drain(0..drain);
            }
        }
    }

    pub fn dump_artifacts(&self, dir: &Path) -> anyhow::Result<()> {
        std::fs::create_dir_all(dir)?;
        std::fs::write(dir.join("last_frame.txt"), self.screen_text())?;
        let history_dir = dir.join("frame_history");
        std::fs::create_dir_all(&history_dir)?;
        for (idx, frame) in self.frame_log.iter().enumerate() {
            let name = format!("{:03}.txt", idx);
            std::fs::write(history_dir.join(name), frame)?;
        }
        Ok(())
    }

    pub fn terminate(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl MockHttpResponse {
    pub fn json(status: &str, body: &str) -> Self {
        Self {
            status: status.to_string(),
            body: body.to_string(),
            content_type: "application/json".to_string(),
        }
    }
}

impl MockEngineServer {
    pub fn start(routes: HashMap<String, MockHttpResponse>) -> anyhow::Result<Self> {
        let listener = TcpListener::bind("127.0.0.1:0")?;
        listener.set_nonblocking(true)?;
        let addr = listener.local_addr()?;
        let running = Arc::new(AtomicBool::new(true));
        let worker_running = Arc::clone(&running);
        let worker = std::thread::spawn(move || {
            while worker_running.load(Ordering::SeqCst) {
                match listener.accept() {
                    Ok((stream, _)) => {
                        let _ = handle_mock_request(stream, &routes);
                    }
                    Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(10));
                    }
                    Err(_) => break,
                }
            }
        });
        Ok(Self {
            addr,
            running,
            worker: Some(worker),
        })
    }

    pub fn base_url(&self) -> String {
        format!("http://{}", self.addr)
    }
}

impl Drop for MockEngineServer {
    fn drop(&mut self) {
        self.running.store(false, Ordering::SeqCst);
        let _ = TcpStream::connect(self.addr);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

fn handle_mock_request(
    mut stream: TcpStream,
    routes: &HashMap<String, MockHttpResponse>,
) -> anyhow::Result<()> {
    stream.set_read_timeout(Some(Duration::from_millis(250)))?;
    let mut buf = [0u8; 8192];
    let n = stream.read(&mut buf)?;
    if n == 0 {
        return Ok(());
    }
    let request = String::from_utf8_lossy(&buf[..n]);
    let first_line = request.lines().next().unwrap_or_default();
    let raw_path = first_line.split_whitespace().nth(1).unwrap_or("/");
    let path = raw_path.split('?').next().unwrap_or(raw_path);
    let response = routes
        .get(path)
        .cloned()
        .unwrap_or_else(|| MockHttpResponse::json("404 Not Found", r#"{"error":"not found"}"#));
    let wire = format!(
        "HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        response.status,
        response.content_type,
        response.body.len(),
        response.body
    );
    stream.write_all(wire.as_bytes())?;
    stream.flush()?;
    Ok(())
}

fn resolve_tui_binary() -> anyhow::Result<String> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(raw) = std::env::var("TANDEM_TUI_BIN") {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            candidates.push(PathBuf::from(trimmed));
        }
    }
    if let Ok(raw) = std::env::var("CARGO_BIN_EXE_tandem-tui") {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            candidates.push(PathBuf::from(trimmed));
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("tandem-tui"));
        }
    }
    if let Ok(path_var) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path_var) {
            candidates.push(dir.join("tandem-tui"));
        }
    }

    for candidate in candidates {
        if candidate.is_file() {
            return Ok(candidate.to_string_lossy().to_string());
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        let output = Command::new("cargo")
            .args([
                "build",
                "-p",
                "tandem-tui",
                "--bin",
                "tandem-tui",
                "--message-format=json",
            ])
            .current_dir(&cwd)
            .output()?;
        if output.status.success() {
            for line in String::from_utf8_lossy(&output.stdout).lines() {
                let Ok(message) = serde_json::from_str::<serde_json::Value>(line) else {
                    continue;
                };
                let executable = message
                    .get("executable")
                    .and_then(|value| value.as_str())
                    .filter(|value| !value.is_empty());
                let target_name = message
                    .get("target")
                    .and_then(|value| value.get("name"))
                    .and_then(|value| value.as_str());
                if target_name == Some("tandem-tui") {
                    if let Some(executable) = executable {
                        let candidate = PathBuf::from(executable);
                        if candidate.is_file() {
                            return Ok(candidate.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }

    anyhow::bail!("Unable to locate tandem-tui binary")
}

impl Drop for TuiPtyHarness {
    fn drop(&mut self) {
        self.terminate();
    }
}
