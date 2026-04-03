use tandem_core::engine_api_token_file_path;
use tokio::time::sleep;

use crate::app::{App, AppState, EngineConnectionSource, EngineStalePolicy, SetupStep, TandemMode};
use crate::command_catalog::HELP_TEXT;

pub(super) async fn try_execute_basic_command(
    app: &mut App,
    cmd_name: &str,
    args: &[&str],
) -> Option<String> {
    match cmd_name {
        "help" => Some(HELP_TEXT.to_string()),
        "diff" => Some(app.open_diff_overlay().await),
        "files" => {
            let query = if args.is_empty() {
                None
            } else {
                Some(args.join(" "))
            };
            app.open_file_search_modal(query.as_deref());
            Some(if let Some(q) = query {
                format!("Opened file search for query: {}", q)
            } else {
                "Opened file search overlay.".to_string()
            })
        }
        "edit" => Some(app.open_external_editor_for_active_input().await),
        "workspace" => Some(match args.first().copied() {
            Some("show") | None => {
                let cwd = std::env::current_dir()
                    .map(|p| p.display().to_string())
                    .unwrap_or_else(|_| "<unknown>".to_string());
                format!("Current workspace directory:\n  {}", cwd)
            }
            Some("use") => {
                let raw_path = args
                    .get(1..)
                    .map(|items| items.join(" "))
                    .unwrap_or_default();
                if raw_path.trim().is_empty() {
                    return Some("Usage: /workspace use <path>".to_string());
                }
                let target = match App::resolve_workspace_path(raw_path.trim()) {
                    Ok(path) => path,
                    Err(err) => return Some(err),
                };
                let previous = std::env::current_dir()
                    .map(|p| p.display().to_string())
                    .unwrap_or_else(|_| "<unknown>".to_string());
                if let Err(err) = std::env::set_current_dir(&target) {
                    return Some(format!(
                        "Failed to switch workspace to {}: {}",
                        target.display(),
                        err
                    ));
                }
                let current = std::env::current_dir()
                    .map(|p| p.display().to_string())
                    .unwrap_or_else(|_| target.display().to_string());
                format!(
                    "Workspace switched.\n  From: {}\n  To:   {}",
                    previous, current
                )
            }
            _ => "Usage: /workspace [show|use <path>]".to_string(),
        }),
        "engine" => Some(match args.first().copied() {
            Some("status") => {
                if let Some(client) = &app.client {
                    match client.get_engine_status().await {
                        Ok(status) => {
                            let required = App::desired_engine_version()
                                .map(App::format_semver_triplet)
                                .unwrap_or_else(|| "unknown".to_string());
                            let stale_policy = EngineStalePolicy::from_env();
                            format!(
                                "Engine Status:\n  Healthy: {}\n  Version: {}\n  Required: {}\n  Mode: {}\n  Endpoint: {}\n  Source: {}\n  Stale policy: {}",
                                if status.healthy { "Yes" } else { "No" },
                                status.version,
                                required,
                                status.mode,
                                client.base_url(),
                                app.engine_connection_source.as_str(),
                                stale_policy.as_str()
                            )
                        }
                        Err(e) => format!("Failed to get engine status: {}", e),
                    }
                } else {
                    "Engine: Not connected".to_string()
                }
            }
            Some("restart") => {
                app.connection_status = "Restarting engine...".to_string();
                app.release_engine_lease().await;
                app.stop_engine_process().await;
                app.client = None;
                app.engine_base_url_override = None;
                app.engine_connection_source = EngineConnectionSource::Unknown;
                app.engine_spawned_at = None;
                app.provider_catalog = None;
                sleep(std::time::Duration::from_millis(300)).await;
                app.state = AppState::Connecting;
                "Engine restart requested.".to_string()
            }
            Some("token") => {
                let show_full = args.get(1).map(|s| s.eq_ignore_ascii_case("show")) == Some(true);
                let Some(token) = app.engine_api_token.as_deref().map(str::trim) else {
                    return Some("Engine token is not configured.".to_string());
                };
                if token.is_empty() {
                    return Some("Engine token is not configured.".to_string());
                }
                let value = if show_full {
                    token.to_string()
                } else {
                    App::masked_engine_api_token(token)
                };
                let path = engine_api_token_file_path().to_string_lossy().to_string();
                let backend = app
                    .engine_api_token_backend
                    .clone()
                    .unwrap_or_else(|| "unknown".to_string());
                if show_full {
                    format!(
                        "Engine API token:\n  {}\nStorage: {}\nPath:\n  {}",
                        value, backend, path
                    )
                } else {
                    format!(
                        "Engine API token (masked):\n  {}\nStorage: {}\nUse `/engine token show` to reveal.\nPath:\n  {}",
                        value, backend, path
                    )
                }
            }
            _ => "Usage: /engine status | restart | token [show]".to_string(),
        }),
        "browser" => Some(match args.first().copied() {
            Some("status") | Some("doctor") => {
                if let Some(client) = &app.client {
                    match client.get_browser_status().await {
                        Ok(status) => {
                            let mut lines = vec![
                                "Browser Status:".to_string(),
                                format!("  Enabled: {}", if status.enabled { "Yes" } else { "No" }),
                                format!(
                                    "  Runnable: {}",
                                    if status.runnable { "Yes" } else { "No" }
                                ),
                                format!(
                                    "  Sidecar: {}",
                                    status
                                        .sidecar
                                        .path
                                        .clone()
                                        .unwrap_or_else(|| "<not found>".to_string())
                                ),
                                format!(
                                    "  Browser: {}",
                                    status
                                        .browser
                                        .path
                                        .clone()
                                        .unwrap_or_else(|| "<not found>".to_string())
                                ),
                            ];
                            if let Some(version) = status.browser.version.as_deref() {
                                lines.push(format!("  Browser version: {}", version));
                            }
                            if !status.blocking_issues.is_empty() {
                                lines.push("Blocking issues:".to_string());
                                for issue in status.blocking_issues {
                                    lines.push(format!("  - {}: {}", issue.code, issue.message));
                                }
                            }
                            if !status.recommendations.is_empty() {
                                lines.push("Recommendations:".to_string());
                                for row in status.recommendations {
                                    lines.push(format!("  - {}", row));
                                }
                            }
                            if !status.install_hints.is_empty() {
                                lines.push("Install hints:".to_string());
                                for row in status.install_hints {
                                    lines.push(format!("  - {}", row));
                                }
                            }
                            lines.join("\n")
                        }
                        Err(e) => format!("Failed to get browser status: {}", e),
                    }
                } else {
                    "Engine: Not connected".to_string()
                }
            }
            _ => "Usage: /browser status | doctor".to_string(),
        }),
        "recent" => Some(match args.first().copied() {
            Some("run") => {
                let Some(raw_index) = args.get(1) else {
                    return Some("Usage: /recent run <index>".to_string());
                };
                let Ok(index) = raw_index.parse::<usize>() else {
                    return Some(format!("Invalid recent-command index: {}", raw_index));
                };
                if index == 0 {
                    return Some("Recent-command index is 1-based.".to_string());
                }
                let commands = app.recent_commands_snapshot();
                let Some(command) = commands.get(index - 1).cloned() else {
                    return Some(format!(
                        "Recent-command index {} is out of range ({} stored).",
                        index,
                        commands.len()
                    ));
                };
                let result = Box::pin(app.execute_command(&command)).await;
                format!(
                    "Replayed recent command #{}: {}\n\n{}",
                    index, command, result
                )
            }
            Some("clear") => {
                let cleared = app.clear_recent_commands();
                format!("Cleared {} recent command(s).", cleared)
            }
            Some("list") | None => {
                let commands = app.recent_commands_snapshot();
                if commands.is_empty() {
                    "No recent slash commands yet.".to_string()
                } else {
                    format!(
                        "Recent commands:\n{}\n\nNext\n  /recent run <index>\n  /recent clear",
                        commands
                            .iter()
                            .enumerate()
                            .map(|(idx, command)| format!("  {}. {}", idx + 1, command))
                            .collect::<Vec<_>>()
                            .join("\n")
                    )
                }
            }
            _ => "Usage: /recent [list|run <index>|clear]".to_string(),
        }),
        "mode" => Some(if args.is_empty() {
            let agent = app.current_mode.as_agent();
            format!("Current mode: {:?} (agent: {})", app.current_mode, agent)
        } else {
            let mode_name = args[0];
            if let Some(mode) = TandemMode::from_str(mode_name) {
                app.current_mode = mode;
                format!("Mode set to: {:?}", mode)
            } else {
                format!(
                    "Unknown mode: {}. Use /modes to see available modes.",
                    mode_name
                )
            }
        }),
        "modes" => Some({
            let lines: Vec<String> = TandemMode::all_modes()
                .iter()
                .map(|(name, desc)| format!("  {} - {}", name, desc))
                .collect();
            format!("Available modes:\n{}", lines.join("\n"))
        }),
        "providers" => Some(if let Some(catalog) = &app.provider_catalog {
            let lines: Vec<String> = catalog
                .all
                .iter()
                .map(|p| {
                    let status = if catalog.connected.contains(&p.id) {
                        "connected"
                    } else {
                        "not configured"
                    };
                    format!("  {} - {}", p.id, status)
                })
                .collect();
            if lines.is_empty() {
                "No providers available.".to_string()
            } else {
                format!("Available providers:\n{}", lines.join("\n"))
            }
        } else {
            "Loading providers... (use /providers to refresh)".to_string()
        }),
        "provider" => Some({
            let mut step = SetupStep::SelectProvider;
            let mut selected_provider_index = 0;
            let filter_model = String::new();

            if !args.is_empty() {
                let provider_id = args[0];
                if let Some(catalog) = &app.provider_catalog {
                    if let Some(idx) = catalog.all.iter().position(|p| p.id == provider_id) {
                        selected_provider_index = idx;
                        step = if catalog.connected.contains(&provider_id.to_string()) {
                            SetupStep::SelectModel
                        } else {
                            SetupStep::EnterApiKey
                        };
                    }
                }
            } else if let Some(current) = &app.current_provider {
                if let Some(catalog) = &app.provider_catalog {
                    if let Some(idx) = catalog.all.iter().position(|p| &p.id == current) {
                        selected_provider_index = idx;
                        step = if catalog.connected.contains(current) {
                            SetupStep::SelectModel
                        } else {
                            SetupStep::EnterApiKey
                        };
                    }
                }
            }

            app.state = AppState::SetupWizard {
                step,
                provider_catalog: app.provider_catalog.clone(),
                selected_provider_index,
                selected_model_index: 0,
                api_key_input: String::new(),
                model_input: filter_model,
            };
            "Opening provider selection...".to_string()
        }),
        "models" => Some({
            let provider_id = args
                .first()
                .map(|s| s.to_string())
                .or_else(|| app.current_provider.clone());
            if let Some(catalog) = &app.provider_catalog {
                if let Some(pid) = &provider_id {
                    if let Some(provider) = catalog.all.iter().find(|p| p.id == *pid) {
                        let model_ids: Vec<String> = provider.models.keys().cloned().collect();
                        if model_ids.is_empty() {
                            format!("No models available for provider: {}", pid)
                        } else {
                            format!(
                                "Models for {}:\n{}",
                                pid,
                                model_ids
                                    .iter()
                                    .map(|m| format!("  {}", m))
                                    .collect::<Vec<_>>()
                                    .join("\n")
                            )
                        }
                    } else {
                        format!("Provider not found: {}", pid)
                    }
                } else {
                    "No provider selected. Use /provider <id> first.".to_string()
                }
            } else {
                "Loading providers... (use /providers to refresh)".to_string()
            }
        }),
        "model" => Some(if args.is_empty() {
            let mut selected_provider_index = 0;
            if let Some(current) = &app.current_provider {
                if let Some(catalog) = &app.provider_catalog {
                    if let Some(idx) = catalog.all.iter().position(|p| &p.id == current) {
                        selected_provider_index = idx;
                    }
                }
            }
            app.state = AppState::SetupWizard {
                step: SetupStep::SelectModel,
                provider_catalog: app.provider_catalog.clone(),
                selected_provider_index,
                selected_model_index: 0,
                api_key_input: String::new(),
                model_input: String::new(),
            };
            "Opening model selection...".to_string()
        } else {
            let model_id = args.join(" ");
            app.current_model = Some(model_id.clone());
            app.pending_model_provider = None;
            if let Some(provider_id) = app.current_provider.clone() {
                app.persist_provider_defaults(&provider_id, Some(&model_id), None)
                    .await;
            }
            format!("Model set to: {}", model_id)
        }),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::net::client::EngineClient;
    use std::collections::HashMap;
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::thread::JoinHandle;
    use std::time::Duration;

    #[tokio::test]
    async fn rollback_commands_render_engine_responses() {
        let server = MockServer::start(HashMap::from([
            (
                "/context/runs/run-1/checkpoints/mutations/rollback-preview".to_string(),
                json_response(
                    r#"{"steps":[{"seq":3,"event_id":"evt-1","tool":"edit_file","executable":true,"operation_count":2},{"seq":4,"event_id":"evt-2","tool":"read_file","executable":false,"operation_count":1}],"step_count":2,"executable_step_count":1,"advisory_step_count":1,"executable":false}"#,
                ),
            ),
            (
                "/context/runs/run-1/checkpoints/mutations/rollback-history".to_string(),
                json_response(
                    r#"{"entries":[{"seq":7,"ts_ms":200,"event_id":"evt-rollback-2","outcome":"blocked","selected_event_ids":["evt-1"],"applied_step_count":0,"applied_operation_count":0,"reason":"approval required"},{"seq":6,"ts_ms":100,"event_id":"evt-rollback-1","outcome":"applied","selected_event_ids":["evt-1"],"applied_step_count":1,"applied_operation_count":2,"applied_by_action":{"rewrite_file":2}}],"summary":{"entry_count":2,"by_outcome":{"applied":1,"blocked":1}}}"#,
                ),
            ),
            (
                "/context/runs/run-1/checkpoints/mutations/rollback-execute".to_string(),
                json_response(
                    r#"{"applied":true,"selected_event_ids":["evt-1"],"applied_step_count":1,"applied_operation_count":2,"missing_event_ids":[],"reason":null}"#,
                ),
            ),
        ]))
        .expect("mock server");

        let mut app = App::new();
        app.client = Some(EngineClient::new(server.base_url()));

        let preview = app
            .execute_command("/context_run_rollback_preview run-1")
            .await;
        assert!(preview.contains("Rollback preview (run-1)"));
        assert!(preview.contains("evt-1"));

        let history = app
            .execute_command("/context_run_rollback_history run-1")
            .await;
        assert!(history.contains("Rollback receipts (run-1)"));
        assert!(history.contains("outcome=applied"));
        assert!(history.contains("outcome=blocked"));

        let execute = app
            .execute_command("/context_run_rollback_execute run-1 --ack evt-1")
            .await;
        assert!(execute.contains("Rollback execute (run-1)"));
        assert!(execute.contains("selected: evt-1"));
    }

    #[tokio::test]
    async fn recent_command_helper_lists_replays_and_clears() {
        let mut app = App::new();

        let mode = app.execute_command("/mode coder").await;
        assert!(mode.contains("Mode set to: Coder"));

        let workspace = app.execute_command("/workspace show").await;
        assert!(workspace.contains("Current workspace directory:"));

        let recent = app.execute_command("/recent").await;
        assert!(recent.contains("1. /workspace show"));
        assert!(recent.contains("2. /mode coder"));

        let replay = app.execute_command("/recent run 2").await;
        assert!(replay.contains("Replayed recent command #2: /mode coder"));
        assert!(replay.contains("Mode set to: Coder"));

        let cleared = app.execute_command("/recent clear").await;
        assert_eq!(cleared, "Cleared 2 recent command(s).");
        assert_eq!(
            app.execute_command("/recent").await,
            "No recent slash commands yet."
        );
    }

    struct MockServer {
        addr: std::net::SocketAddr,
        running: Arc<AtomicBool>,
        worker: Option<JoinHandle<()>>,
    }

    impl MockServer {
        fn start(routes: HashMap<String, String>) -> anyhow::Result<Self> {
            let listener = TcpListener::bind("127.0.0.1:0")?;
            listener.set_nonblocking(true)?;
            let addr = listener.local_addr()?;
            let running = Arc::new(AtomicBool::new(true));
            let worker_running = Arc::clone(&running);
            let worker = std::thread::spawn(move || {
                while worker_running.load(Ordering::SeqCst) {
                    match listener.accept() {
                        Ok((stream, _)) => {
                            let _ = handle_request(stream, &routes);
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

        fn base_url(&self) -> String {
            format!("http://{}", self.addr)
        }
    }

    impl Drop for MockServer {
        fn drop(&mut self) {
            self.running.store(false, Ordering::SeqCst);
            let _ = TcpStream::connect(self.addr);
            if let Some(worker) = self.worker.take() {
                let _ = worker.join();
            }
        }
    }

    fn json_response(body: &str) -> String {
        format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        )
    }

    fn handle_request(
        mut stream: TcpStream,
        routes: &HashMap<String, String>,
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
        let response = routes.get(path).cloned().unwrap_or_else(|| {
            json_response(r#"{"error":"not found"}"#).replacen("200 OK", "404 Not Found", 1)
        });
        stream.write_all(response.as_bytes())?;
        stream.flush()?;
        Ok(())
    }
}
