use super::*;

const BUILTIN_GITHUB_MCP_SERVER_NAME: &str = "github";
const BUILTIN_GITHUB_MCP_TRANSPORT_URL: &str = "https://api.githubcopilot.com/mcp/";

pub(super) async fn bootstrap_mcp_servers_when_ready(state: AppState) {
    if state.wait_until_ready_or_failed(120, 250).await {
        bootstrap_mcp_servers(&state).await;
    } else {
        tracing::warn!("mcp bootstrap: skipped because runtime startup failed or timed out");
    }
}

pub(super) async fn bootstrap_mcp_servers(state: &AppState) {
    let _ = ensure_builtin_github_mcp_server(state).await;

    let mut enabled_servers = state
        .mcp
        .list()
        .await
        .into_iter()
        .filter_map(|(name, server)| if server.enabled { Some(name) } else { None })
        .collect::<Vec<_>>();
    enabled_servers.sort();

    for name in enabled_servers {
        let connected = state.mcp.connect(&name).await;
        if !connected {
            tracing::warn!("mcp bootstrap: failed to connect server '{}'", name);
            continue;
        }
        let count = sync_mcp_tools_for_server(state, &name).await;
        state.event_bus.publish(EngineEvent::new(
            "mcp.server.connected",
            json!({
                "name": name,
                "status": "connected",
                "source": "startup_bootstrap"
            }),
        ));
        state.event_bus.publish(EngineEvent::new(
            "mcp.tools.updated",
            json!({
                "name": name,
                "count": count,
                "source": "startup_bootstrap"
            }),
        ));
        tracing::info!(
            "mcp bootstrap: connected '{}' with {} tools registered",
            name,
            count
        );
    }
}

fn github_mcp_headers_from_auth() -> Option<HashMap<String, String>> {
    let token = std::env::var("GITHUB_PERSONAL_ACCESS_TOKEN")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| {
            std::env::var("GITHUB_TOKEN")
                .ok()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
        })
        .or_else(|| {
            tandem_core::load_provider_auth()
                .get("github")
                .cloned()
                .filter(|value| !value.trim().is_empty())
        })
        .or_else(|| {
            tandem_core::load_provider_auth()
                .get("copilot")
                .cloned()
                .filter(|value| !value.trim().is_empty())
        })?;

    let mut headers = HashMap::new();
    headers.insert("Authorization".to_string(), format!("Bearer {token}"));
    Some(headers)
}

pub(super) async fn ensure_remote_mcp_server(
    state: &AppState,
    name: &str,
    transport_url: &str,
    headers: HashMap<String, String>,
) -> bool {
    let existing = state.mcp.list().await.get(name).cloned();
    if let Some(server) = existing {
        if !server.enabled {
            return false;
        }
        if server.transport.trim() == transport_url.trim() && !headers.is_empty() {
            let mut effective_headers = server.headers.clone();
            for (key, value) in server.secret_header_values {
                effective_headers.insert(key, value);
            }
            if effective_headers != headers {
                state
                    .mcp
                    .add_or_update(
                        name.to_string(),
                        transport_url.to_string(),
                        headers,
                        server.enabled,
                    )
                    .await;
            }
        }
        let connected = state.mcp.connect(name).await;
        if connected {
            let _ = sync_mcp_tools_for_server(state, name).await;
        }
        return connected;
    }

    state
        .mcp
        .add_or_update(name.to_string(), transport_url.to_string(), headers, true)
        .await;
    let connected = state.mcp.connect(name).await;
    if connected {
        let _ = sync_mcp_tools_for_server(state, name).await;
    }
    connected
}

pub(super) async fn ensure_builtin_github_mcp_server(state: &AppState) -> bool {
    let Some(headers) = github_mcp_headers_from_auth() else {
        let existing = state
            .mcp
            .list()
            .await
            .get(BUILTIN_GITHUB_MCP_SERVER_NAME)
            .cloned();
        if let Some(server) = existing {
            if !server.enabled {
                return false;
            }
            let connected = state.mcp.connect(BUILTIN_GITHUB_MCP_SERVER_NAME).await;
            if connected {
                let _ = sync_mcp_tools_for_server(state, BUILTIN_GITHUB_MCP_SERVER_NAME).await;
            }
            return connected;
        }
        tracing::info!(
            "mcp bootstrap: GitHub PAT not available, skipping builtin GitHub MCP server"
        );
        return false;
    };

    ensure_remote_mcp_server(
        state,
        BUILTIN_GITHUB_MCP_SERVER_NAME,
        BUILTIN_GITHUB_MCP_TRANSPORT_URL,
        headers,
    )
    .await
}

#[derive(Debug, Deserialize, Default)]
pub(super) struct McpAddInput {
    pub name: Option<String>,
    pub transport: Option<String>,
    pub headers: Option<HashMap<String, String>>,
    pub secret_headers: Option<HashMap<String, tandem_runtime::McpSecretRef>>,
    pub enabled: Option<bool>,
}

#[derive(Debug, Deserialize, Default)]
pub(super) struct McpPatchInput {
    pub enabled: Option<bool>,
}

#[derive(Clone)]
pub(super) struct McpBridgeTool {
    pub schema: ToolSchema,
    pub mcp: tandem_runtime::McpRegistry,
    pub server_name: String,
    pub tool_name: String,
}

#[async_trait]
impl Tool for McpBridgeTool {
    fn schema(&self) -> ToolSchema {
        self.schema.clone()
    }

    async fn execute(&self, args: Value) -> anyhow::Result<ToolResult> {
        self.mcp
            .call_tool(&self.server_name, &self.tool_name, args)
            .await
            .map_err(anyhow::Error::msg)
    }
}

pub(super) async fn list_mcp(State(state): State<AppState>) -> Json<Value> {
    Json(json!(state.mcp.list_public().await))
}

pub(super) async fn add_mcp(
    State(state): State<AppState>,
    Json(input): Json<McpAddInput>,
) -> Json<Value> {
    let name = input.name.unwrap_or_else(|| "default".to_string());
    let transport = input.transport.unwrap_or_else(|| "stdio".to_string());
    state
        .mcp
        .add_or_update_with_secret_refs(
            name.clone(),
            transport,
            input.headers.unwrap_or_default(),
            input.secret_headers.unwrap_or_default(),
            input.enabled.unwrap_or(true),
        )
        .await;
    state.event_bus.publish(EngineEvent::new(
        "mcp.server.updated",
        json!({
            "name": name,
        }),
    ));
    Json(json!({"ok": true}))
}

pub(super) fn mcp_namespace_segment(raw: &str) -> String {
    let mut out = String::new();
    let mut previous_underscore = false;
    for ch in raw.trim().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            previous_underscore = false;
        } else if !previous_underscore {
            out.push('_');
            previous_underscore = true;
        }
    }
    let cleaned = out.trim_matches('_');
    if cleaned.is_empty() {
        "server".to_string()
    } else {
        cleaned.to_string()
    }
}

pub(super) async fn sync_mcp_tools_for_server(state: &AppState, name: &str) -> usize {
    let prefix = format!("mcp.{}.", mcp_namespace_segment(name));
    state.tools.unregister_by_prefix(&prefix).await;
    let tools = state.mcp.server_tools(name).await;
    for tool in &tools {
        let schema = ToolSchema {
            name: tool.namespaced_name.clone(),
            description: if tool.description.trim().is_empty() {
                format!("MCP tool {} from {}", tool.tool_name, tool.server_name)
            } else {
                tool.description.clone()
            },
            input_schema: tool.input_schema.clone(),
        };
        state
            .tools
            .register_tool(
                schema.name.clone(),
                Arc::new(McpBridgeTool {
                    schema,
                    mcp: state.mcp.clone(),
                    server_name: tool.server_name.clone(),
                    tool_name: tool.tool_name.clone(),
                }),
            )
            .await;
    }
    tools.len()
}

pub(super) async fn connect_mcp(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Json<Value> {
    let ok = state.mcp.connect(&name).await;
    if ok {
        let count = sync_mcp_tools_for_server(&state, &name).await;
        state.event_bus.publish(EngineEvent::new(
            "mcp.server.connected",
            json!({
                "name": name,
                "status": "connected",
            }),
        ));
        state.event_bus.publish(EngineEvent::new(
            "mcp.tools.updated",
            json!({
                "name": name,
                "count": count,
            }),
        ));
    } else {
        let prefix = format!("mcp.{}.", mcp_namespace_segment(&name));
        let removed = state.tools.unregister_by_prefix(&prefix).await;
        state.event_bus.publish(EngineEvent::new(
            "mcp.server.disconnected",
            json!({
                "name": name,
                "removedToolCount": removed,
                "reason": "connect_failed"
            }),
        ));
    }
    Json(json!({"ok": ok}))
}

pub(super) async fn disconnect_mcp(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Json<Value> {
    let ok = state.mcp.disconnect(&name).await;
    if ok {
        let prefix = format!("mcp.{}.", mcp_namespace_segment(&name));
        let removed = state.tools.unregister_by_prefix(&prefix).await;
        state.event_bus.publish(EngineEvent::new(
            "mcp.server.disconnected",
            json!({
                "name": name,
                "removedToolCount": removed,
            }),
        ));
    }
    Json(json!({"ok": ok}))
}

pub(super) async fn delete_mcp(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Json<Value> {
    let prefix = format!("mcp.{}.", mcp_namespace_segment(&name));
    let removed_tool_count = state.tools.unregister_by_prefix(&prefix).await;
    let ok = state.mcp.remove(&name).await;
    if ok {
        state.event_bus.publish(EngineEvent::new(
            "mcp.server.deleted",
            json!({
                "name": name,
                "removedToolCount": removed_tool_count,
            }),
        ));
    }
    Json(json!({ "ok": ok, "removedToolCount": removed_tool_count }))
}

pub(super) async fn patch_mcp(
    State(state): State<AppState>,
    Path(name): Path<String>,
    Json(input): Json<McpPatchInput>,
) -> Json<Value> {
    let mut changed = false;
    if let Some(enabled) = input.enabled {
        changed = state.mcp.set_enabled(&name, enabled).await;
        if changed {
            if enabled {
                let _ = state.mcp.connect(&name).await;
                let count = sync_mcp_tools_for_server(&state, &name).await;
                state.event_bus.publish(EngineEvent::new(
                    "mcp.tools.updated",
                    json!({
                        "name": name,
                        "count": count,
                    }),
                ));
            } else {
                let prefix = format!("mcp.{}.", mcp_namespace_segment(&name));
                let _ = state.tools.unregister_by_prefix(&prefix).await;
            }
            state.event_bus.publish(EngineEvent::new(
                "mcp.server.updated",
                json!({
                    "name": name,
                    "enabled": enabled,
                }),
            ));
        }
    }
    Json(json!({"ok": changed}))
}

pub(super) async fn refresh_mcp(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Json<Value> {
    let result = state.mcp.refresh(&name).await;
    match result {
        Ok(tools) => {
            let count = sync_mcp_tools_for_server(&state, &name).await;
            state.event_bus.publish(EngineEvent::new(
                "mcp.tools.updated",
                json!({
                    "name": name,
                    "count": count,
                }),
            ));
            Json(json!({
                "ok": true,
                "count": tools.len(),
            }))
        }
        Err(error) => {
            let prefix = format!("mcp.{}.", mcp_namespace_segment(&name));
            let removed = state.tools.unregister_by_prefix(&prefix).await;
            state.event_bus.publish(EngineEvent::new(
                "mcp.server.disconnected",
                json!({
                    "name": name,
                    "removedToolCount": removed,
                    "reason": "refresh_failed"
                }),
            ));
            Json(json!({
                "ok": false,
                "error": error,
                "removedToolCount": removed
            }))
        }
    }
}

pub(super) async fn auth_mcp(Path(name): Path<String>) -> Json<Value> {
    Json(json!({"authorizationUrl": format!("https://example.invalid/mcp/{name}/authorize")}))
}

pub(super) async fn callback_mcp(Path(name): Path<String>) -> Json<Value> {
    Json(json!({"ok": true, "name": name}))
}

pub(super) async fn authenticate_mcp(Path(name): Path<String>) -> Json<Value> {
    Json(json!({"ok": true, "name": name, "authenticated": true}))
}

pub(super) async fn delete_auth_mcp(Path(name): Path<String>) -> Json<Value> {
    Json(json!({"ok": true, "name": name}))
}

pub(super) async fn mcp_catalog_index() -> Result<Json<Value>, StatusCode> {
    if let Some(index) = mcp_catalog::index() {
        return Ok(Json(index.clone()));
    }
    Err(StatusCode::SERVICE_UNAVAILABLE)
}

pub(super) async fn mcp_catalog_toml(Path(slug): Path<String>) -> Result<Response, StatusCode> {
    if let Some(toml) = mcp_catalog::toml_for_slug(&slug) {
        return Ok((
            [(header::CONTENT_TYPE, "application/toml; charset=utf-8")],
            toml,
        )
            .into_response());
    }
    Err(StatusCode::NOT_FOUND)
}

pub(super) async fn mcp_tools(State(state): State<AppState>) -> Json<Value> {
    Json(json!(state.mcp.list_tools().await))
}

pub(super) async fn mcp_resources(State(state): State<AppState>) -> Json<Value> {
    let resources = state
        .mcp
        .list()
        .await
        .into_values()
        .filter(|server| server.connected)
        .map(|server| {
            json!({
                "server": server.name,
                "resources": [
                    {"uri": format!("mcp://{}/tools", server.name), "name":"tools"},
                    {"uri": format!("mcp://{}/prompts", server.name), "name":"prompts"}
                ]
            })
        })
        .collect::<Vec<_>>();
    Json(json!(resources))
}
