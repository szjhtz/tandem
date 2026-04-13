use super::*;
use async_trait::async_trait;
use futures::{stream, Stream};
use std::collections::VecDeque;
use std::pin::Pin;
use std::sync::Arc;
use tandem_providers::{ChatMessage, Provider, StreamChunk, TokenUsage};
use tandem_tools::Tool;
use tandem_types::{
    Message, MessagePart, MessageRole, ModelInfo, ProviderInfo, Session, ToolMode, ToolResult,
    ToolSchema,
};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

#[derive(Clone, Debug)]
struct PromptRecord {
    prompt: String,
    tool_names: Vec<String>,
    tool_mode: String,
    model_override: Option<String>,
}

#[derive(Clone)]
struct ScriptedProvider {
    records: Arc<Mutex<Vec<PromptRecord>>>,
    scripts: Arc<Mutex<VecDeque<Vec<StreamChunk>>>>,
}

impl ScriptedProvider {
    fn new() -> Self {
        Self {
            records: Arc::new(Mutex::new(Vec::new())),
            scripts: Arc::new(Mutex::new(VecDeque::new())),
        }
    }

    async fn push_script(&self, script: Vec<StreamChunk>) {
        self.scripts.lock().await.push_back(script);
    }

    async fn records(&self) -> Vec<PromptRecord> {
        self.records.lock().await.clone()
    }
}

#[async_trait]
impl Provider for ScriptedProvider {
    fn info(&self) -> ProviderInfo {
        ProviderInfo {
            id: "scripted".to_string(),
            name: "Scripted".to_string(),
            models: vec![ModelInfo {
                id: "scripted-model".to_string(),
                provider_id: "scripted".to_string(),
                display_name: "Scripted Model".to_string(),
                context_window: 8192,
            }],
        }
    }

    async fn complete(
        &self,
        _prompt: &str,
        _model_override: Option<&str>,
    ) -> anyhow::Result<String> {
        anyhow::bail!("scripted provider only supports streaming");
    }

    async fn stream(
        &self,
        messages: Vec<ChatMessage>,
        model_override: Option<&str>,
        tool_mode: ToolMode,
        tools: Option<Vec<ToolSchema>>,
        _cancel: CancellationToken,
    ) -> anyhow::Result<Pin<Box<dyn Stream<Item = anyhow::Result<StreamChunk>> + Send>>> {
        let prompt = messages
            .iter()
            .map(|message| format!("{}: {}", message.role, message.content))
            .collect::<Vec<_>>()
            .join("\n");
        let mut tool_names = tools
            .unwrap_or_default()
            .into_iter()
            .map(|schema| schema.name)
            .collect::<Vec<_>>();
        tool_names.sort();
        tool_names.dedup();
        self.records.lock().await.push(PromptRecord {
            prompt,
            tool_names,
            tool_mode: format!("{tool_mode:?}"),
            model_override: model_override.map(str::to_string),
        });

        let script = self
            .scripts
            .lock()
            .await
            .pop_front()
            .expect("scripted provider exhausted");

        Ok(Box::pin(stream::iter(script.into_iter().map(Ok))))
    }
}

#[derive(Clone)]
struct RecordingTool {
    schema: ToolSchema,
    output: String,
    metadata: serde_json::Value,
    calls: Arc<Mutex<Vec<serde_json::Value>>>,
}

impl RecordingTool {
    fn new(
        name: &str,
        description: &str,
        input_schema: serde_json::Value,
        output: impl Into<String>,
        metadata: serde_json::Value,
    ) -> Self {
        Self {
            schema: ToolSchema::new(name, description, input_schema),
            output: output.into(),
            metadata,
            calls: Arc::new(Mutex::new(Vec::new())),
        }
    }

    async fn calls(&self) -> Vec<serde_json::Value> {
        self.calls.lock().await.clone()
    }
}

#[async_trait]
impl Tool for RecordingTool {
    fn schema(&self) -> ToolSchema {
        self.schema.clone()
    }

    async fn execute(&self, args: serde_json::Value) -> anyhow::Result<ToolResult> {
        self.calls.lock().await.push(args);
        Ok(ToolResult {
            output: self.output.clone(),
            metadata: self.metadata.clone(),
        })
    }
}

fn tool_turn(calls: Vec<(&str, &str, serde_json::Value)>) -> Vec<StreamChunk> {
    let mut chunks = Vec::new();
    for (index, (id, name, args)) in calls.into_iter().enumerate() {
        let call_id = if id.is_empty() {
            format!("call_{}", index + 1)
        } else {
            id.to_string()
        };
        chunks.push(StreamChunk::ToolCallStart {
            id: call_id.clone(),
            name: name.to_string(),
        });
        chunks.push(StreamChunk::ToolCallDelta {
            id: call_id.clone(),
            args_delta: args.to_string(),
        });
        chunks.push(StreamChunk::ToolCallEnd { id: call_id });
    }
    chunks.push(StreamChunk::Done {
        finish_reason: "tool_calls".to_string(),
        usage: None,
    });
    chunks
}

fn json_tool_turn(tool: &str, args: serde_json::Value) -> Vec<StreamChunk> {
    vec![
        StreamChunk::TextDelta(
            serde_json::to_string(&json!({
                "tool": tool,
                "args": args
            }))
            .expect("tool call json"),
        ),
        StreamChunk::Done {
            finish_reason: "tool_calls".to_string(),
            usage: None,
        },
    ]
}

fn final_turn(text: &str) -> Vec<StreamChunk> {
    vec![
        StreamChunk::TextDelta(text.to_string()),
        StreamChunk::Done {
            finish_reason: "stop".to_string(),
            usage: Some(TokenUsage {
                prompt_tokens: 1,
                completion_tokens: 1,
                total_tokens: 2,
            }),
        },
    ]
}

fn brief_research_node(
    node_id: &str,
    output_path: &str,
    web_research_expected: bool,
) -> AutomationFlowNode {
    AutomationFlowNode {
        knowledge: tandem_orchestrator::KnowledgeBinding::default(),
        node_id: node_id.to_string(),
        agent_id: "researcher".to_string(),
        objective: "Write a research brief grounded in the workspace".to_string(),
        depends_on: Vec::new(),
        input_refs: Vec::new(),
        output_contract: Some(AutomationFlowOutputContract {
            kind: "brief".to_string(),
            validator: Some(crate::AutomationOutputValidatorKind::ResearchBrief),
            enforcement: None,
            schema: None,
            summary_guidance: None,
        }),
        retry_policy: None,
        timeout_ms: None,
        max_tool_calls: None,
        stage_kind: Some(AutomationNodeStageKind::Workstream),
        gate: None,
        metadata: Some(json!({
            "builder": {
                "output_path": output_path,
                "web_research_expected": web_research_expected,
                "source_coverage_required": true
            }
        })),
    }
}

fn citations_research_node(node_id: &str, output_path: &str) -> AutomationFlowNode {
    AutomationFlowNode {
        knowledge: tandem_orchestrator::KnowledgeBinding::default(),
        node_id: node_id.to_string(),
        agent_id: "researcher".to_string(),
        objective: "Write a grounded citation handoff".to_string(),
        depends_on: Vec::new(),
        input_refs: Vec::new(),
        output_contract: Some(AutomationFlowOutputContract {
            kind: "citations".to_string(),
            validator: Some(crate::AutomationOutputValidatorKind::ResearchBrief),
            enforcement: None,
            schema: None,
            summary_guidance: Some("Return a citation handoff.".to_string()),
        }),
        retry_policy: None,
        timeout_ms: None,
        max_tool_calls: None,
        stage_kind: Some(AutomationNodeStageKind::Workstream),
        gate: None,
        metadata: Some(json!({
            "builder": {
                "output_path": output_path,
                "source_coverage_required": true,
                "preferred_mcp_servers": ["tandem-mcp"]
            }
        })),
    }
}

fn automation_with_single_node(
    automation_id: &str,
    node: AutomationFlowNode,
    workspace_root: &std::path::Path,
    allowlist: Vec<String>,
) -> AutomationV2Spec {
    let mut automation = AutomationSpecBuilder::new(automation_id)
        .name(format!("{automation_id} test"))
        .nodes(vec![node])
        .workspace_root(workspace_root.to_string_lossy().to_string())
        .build();
    let agent = automation.agents.first_mut().expect("test agent");
    agent.agent_id = "researcher".to_string();
    agent.template_id = None;
    agent.display_name = "Researcher".to_string();
    agent.tool_policy.allowlist = allowlist;
    agent.tool_policy.denylist.clear();
    agent.mcp_policy.allowed_servers = Vec::new();
    agent.mcp_policy.allowed_tools = None;
    automation
}

async fn install_provider_and_tools(
    state: &AppState,
    provider: &ScriptedProvider,
    tools: Vec<(&str, Arc<RecordingTool>)>,
) {
    state
        .providers
        .replace_for_test(
            vec![Arc::new(provider.clone())],
            Some("scripted".to_string()),
        )
        .await;
    for (name, tool) in tools {
        state.tools.register_tool(name.to_string(), tool).await;
    }
}

fn prompt_contains_only_run_scoped_path(record: &PromptRecord, output_path: &str) {
    assert!(
        record.prompt.contains(output_path),
        "prompt did not include the run-scoped output path {output_path:?}"
    );
    assert!(
        !record.prompt.contains(".tandem/artifacts/"),
        "prompt still mentioned the legacy workspace-scoped artifact path"
    );
}

fn assistant_session_with_tool_invocations(
    title: &str,
    workspace_root: &std::path::Path,
    invocations: Vec<(&str, serde_json::Value, serde_json::Value, Option<&str>)>,
) -> Session {
    let mut session = Session::new(
        Some(title.to_string()),
        Some(workspace_root.to_string_lossy().to_string()),
    );
    session.messages.push(Message::new(
        MessageRole::Assistant,
        invocations
            .into_iter()
            .map(|(tool, args, result, error)| MessagePart::ToolInvocation {
                tool: tool.to_string(),
                args,
                result: Some(result),
                error: error.map(str::to_string),
            })
            .collect(),
    ));
    session
}

async fn persist_validated_output(
    state: &AppState,
    run_id: &str,
    node_id: &str,
    output: serde_json::Value,
    status: AutomationRunStatus,
    attempt: u32,
) {
    state
        .update_automation_v2_run(run_id, |row| {
            row.status = status;
            row.checkpoint
                .node_outputs
                .insert(node_id.to_string(), output.clone());
            row.checkpoint
                .node_attempts
                .insert(node_id.to_string(), attempt);
        })
        .await
        .expect("persist validated output");
}

#[tokio::test]
async fn local_research_flow_completes_with_read_and_write_artifact() {
    let workspace_root = std::env::temp_dir().join(format!(
        "tandem-local-research-integration-{}",
        uuid::Uuid::new_v4()
    ));
    std::fs::create_dir_all(workspace_root.join("docs")).expect("create workspace");
    std::fs::write(
        workspace_root.join("docs/source.md"),
        "# Source\n\nWorkspace evidence for the local brief.\n",
    )
    .expect("seed source file");

    let state = ready_test_state().await;
    let node = brief_research_node("research_local", ".tandem/artifacts/local-brief.md", false);
    let automation = automation_with_single_node(
        "automation-local-research",
        node.clone(),
        &workspace_root,
        vec!["read".to_string()],
    );
    let run = state
        .create_automation_v2_run(&automation, "manual")
        .await
        .expect("create run");
    let output_path = automation_node_required_output_path_for_run(&node, Some(&run.run_id))
        .expect("required output path");
    let workspace_snapshot_before = automation_workspace_root_file_snapshot(
        workspace_root.to_str().expect("workspace root string"),
    );
    let artifact_text = "# Marketing Brief\n\n## Workspace source audit\nPrepared from workspace sources.\n\n## Campaign goal\nClarify positioning.\n\n## Target audience\n- Operators.\n\n## Core pain points\n- Coordination overhead.\n\n## Positioning angle\nTandem centralizes orchestration.\n\n## Competitor context\nLocal-only comparison for this run.\n\n## Proof points with citations\n1. Supported from docs/source.md. Source note: https://example.com/reference\n\n## Likely objections\n- Proof depth.\n\n## Channel considerations\n- Landing page.\n\n## Recommended message hierarchy\n1. Problem\n2. Promise\n\n## Files reviewed\n- docs/source.md\n\n## Files not reviewed\n- docs/extra.md: not needed for this first pass.\n"
        .to_string();

    let artifact_dir = workspace_root
        .join(".tandem/runs")
        .join(&run.run_id)
        .join("artifacts");
    std::fs::create_dir_all(&artifact_dir).expect("create artifact dir");
    std::fs::write(artifact_dir.join("local-brief.md"), &artifact_text).expect("write artifact");

    let session = assistant_session_with_tool_invocations(
        "local-research-validation",
        &workspace_root,
        vec![
            (
                "glob",
                json!({"pattern":"docs/**/*.md"}),
                json!({
                    "output": workspace_root
                        .join("docs/source.md")
                        .display()
                        .to_string()
                }),
                None,
            ),
            (
                "read",
                json!({"path":"docs/source.md"}),
                json!({"output":"Workspace evidence for the local brief."}),
                None,
            ),
            (
                "write",
                json!({"path":output_path,"content":artifact_text}),
                json!({"ok": true}),
                None,
            ),
        ],
    );
    let requested_tools = vec!["glob".to_string(), "read".to_string(), "write".to_string()];
    let tool_telemetry = summarize_automation_tool_activity(&node, &session, &requested_tools);
    assert_eq!(
        tool_telemetry
            .get("executed_tools")
            .and_then(Value::as_array)
            .map(|values| values.iter().filter_map(Value::as_str).collect::<Vec<_>>()),
        Some(vec!["glob", "read", "write"])
    );
    assert_eq!(
        tool_telemetry
            .get("workspace_inspection_used")
            .and_then(Value::as_bool),
        Some(true)
    );

    let session_text = "Done\n\n{\"status\":\"completed\"}";
    let (accepted_output, artifact_validation, rejected) = validate_automation_artifact_output(
        &node,
        &session,
        workspace_root.to_str().expect("workspace root string"),
        session_text,
        &tool_telemetry,
        None,
        Some((output_path.clone(), artifact_text.clone())),
        &workspace_snapshot_before,
    );
    assert!(rejected.is_none());
    assert_eq!(
        artifact_validation
            .get("validation_outcome")
            .and_then(Value::as_str),
        Some("passed")
    );
    assert_eq!(
        artifact_validation
            .get("semantic_block_reason")
            .and_then(Value::as_str),
        None
    );

    let status = detect_automation_node_status(
        &node,
        session_text,
        accepted_output.as_ref(),
        &tool_telemetry,
        Some(&artifact_validation),
    );
    assert_eq!(status.0, "completed");

    let output = wrap_automation_node_output(
        &node,
        &session,
        &requested_tools,
        &session.id,
        Some(&run.run_id),
        session_text,
        accepted_output.clone(),
        Some(artifact_validation.clone()),
    );
    persist_validated_output(
        &state,
        &run.run_id,
        &node.node_id,
        output.clone(),
        AutomationRunStatus::Completed,
        1,
    )
    .await;

    let persisted = state
        .get_automation_v2_run(&run.run_id)
        .await
        .expect("persisted run");
    assert_eq!(persisted.status, AutomationRunStatus::Completed);
    assert_eq!(
        persisted.checkpoint.node_attempts.get("research_local"),
        Some(&1)
    );

    let output = persisted
        .checkpoint
        .node_outputs
        .get("research_local")
        .expect("node output");
    assert_eq!(
        output.get("status").and_then(Value::as_str),
        Some("completed")
    );
    assert_eq!(
        output
            .pointer("/artifact_validation/validation_outcome")
            .and_then(Value::as_str),
        Some("passed")
    );
    assert_eq!(
        output
            .pointer("/tool_telemetry/executed_tools")
            .and_then(Value::as_array)
            .map(|values| values.iter().filter_map(Value::as_str).collect::<Vec<_>>()),
        Some(vec!["glob", "read", "write"])
    );
    assert_eq!(
        output
            .pointer("/tool_telemetry/workspace_inspection_used")
            .and_then(Value::as_bool),
        Some(true)
    );

    let written = std::fs::read_to_string(
        workspace_root
            .join(".tandem/runs")
            .join(&run.run_id)
            .join("artifacts")
            .join("local-brief.md"),
    )
    .expect("written artifact");
    assert_eq!(written, artifact_text);

    let _ = std::fs::remove_dir_all(&workspace_root);
}

#[tokio::test]
async fn mcp_grounded_research_flow_completes_with_mcp_tool_usage() {
    let workspace_root = std::env::temp_dir().join(format!(
        "tandem-mcp-research-integration-{}",
        uuid::Uuid::new_v4()
    ));
    std::fs::create_dir_all(&workspace_root).expect("create workspace");

    let state = ready_test_state().await;
    let node = citations_research_node("research_mcp", ".tandem/artifacts/research-sources.json");
    let automation = automation_with_single_node(
        "automation-mcp-research",
        node.clone(),
        &workspace_root,
        vec!["mcp.tandem_mcp.search_docs".to_string()],
    );
    let run = state
        .create_automation_v2_run(&automation, "manual")
        .await
        .expect("create run");
    let output_path = automation_node_required_output_path_for_run(&node, Some(&run.run_id))
        .expect("required output path");
    let workspace_snapshot_before = automation_workspace_root_file_snapshot(
        workspace_root.to_str().expect("workspace root string"),
    );
    let artifact_text = "# Research Sources\n\n## Summary\nCollected current Tandem MCP documentation references.\n\n## Citations\n1. Tandem MCP Guide. Source note: tandem-mcp://docs/guide\n2. Tandem MCP API Reference. Source note: tandem-mcp://docs/api-reference\n"
        .to_string();

    let artifact_dir = workspace_root
        .join(".tandem/runs")
        .join(&run.run_id)
        .join("artifacts");
    std::fs::create_dir_all(&artifact_dir).expect("create artifact dir");
    std::fs::write(artifact_dir.join("research-sources.json"), &artifact_text)
        .expect("write artifact");

    let session = assistant_session_with_tool_invocations(
        "mcp-research-validation",
        &workspace_root,
        vec![
            (
                "mcp.tandem_mcp.search_docs",
                json!({
                    "query": "research sources artifact contract"
                }),
                json!({
                    "output": "Matched Tandem MCP docs",
                    "metadata": {"count": 2}
                }),
                None,
            ),
            (
                "write",
                json!({"path":output_path,"content":artifact_text}),
                json!({"ok": true}),
                None,
            ),
        ],
    );
    let requested_tools = vec![
        "mcp.tandem_mcp.search_docs".to_string(),
        "write".to_string(),
    ];
    let tool_telemetry = summarize_automation_tool_activity(&node, &session, &requested_tools);
    assert_eq!(
        tool_telemetry
            .get("executed_tools")
            .and_then(Value::as_array)
            .map(|values| values.iter().filter_map(Value::as_str).collect::<Vec<_>>()),
        Some(vec!["mcp.tandem_mcp.search_docs", "write"])
    );
    assert_eq!(
        tool_telemetry
            .get("web_research_used")
            .and_then(Value::as_bool),
        Some(false)
    );

    let session_text = "Done\n\n{\"status\":\"completed\"}";
    let (accepted_output, artifact_validation, rejected) = validate_automation_artifact_output(
        &node,
        &session,
        workspace_root.to_str().expect("workspace root string"),
        session_text,
        &tool_telemetry,
        None,
        Some((output_path.clone(), artifact_text.clone())),
        &workspace_snapshot_before,
    );
    assert!(rejected.is_none());
    assert_eq!(
        artifact_validation
            .get("validation_outcome")
            .and_then(Value::as_str),
        Some("passed")
    );

    let status = detect_automation_node_status(
        &node,
        session_text,
        accepted_output.as_ref(),
        &tool_telemetry,
        Some(&artifact_validation),
    );
    assert_eq!(status.0, "completed");

    let output = wrap_automation_node_output(
        &node,
        &session,
        &requested_tools,
        &session.id,
        Some(&run.run_id),
        session_text,
        accepted_output.clone(),
        Some(artifact_validation.clone()),
    );
    persist_validated_output(
        &state,
        &run.run_id,
        &node.node_id,
        output.clone(),
        AutomationRunStatus::Completed,
        1,
    )
    .await;

    let persisted = state
        .get_automation_v2_run(&run.run_id)
        .await
        .expect("persisted run");
    assert_eq!(persisted.status, AutomationRunStatus::Completed);
    assert_eq!(
        persisted.checkpoint.node_attempts.get("research_mcp"),
        Some(&1)
    );

    let output = persisted
        .checkpoint
        .node_outputs
        .get("research_mcp")
        .expect("node output");
    assert_eq!(
        output.get("status").and_then(Value::as_str),
        Some("completed")
    );
    assert_eq!(
        output
            .pointer("/artifact_validation/validation_outcome")
            .and_then(Value::as_str),
        Some("passed")
    );
    assert_eq!(
        output
            .pointer("/tool_telemetry/executed_tools")
            .and_then(Value::as_array)
            .map(|values| values.iter().filter_map(Value::as_str).collect::<Vec<_>>()),
        Some(vec!["mcp.tandem_mcp.search_docs", "write"])
    );

    let written = std::fs::read_to_string(
        workspace_root
            .join(".tandem/runs")
            .join(&run.run_id)
            .join("artifacts")
            .join("research-sources.json"),
    )
    .expect("written artifact");
    assert_eq!(written, artifact_text);

    let _ = std::fs::remove_dir_all(&workspace_root);
}

#[tokio::test]
async fn external_web_research_flow_completes_with_websearch_and_write() {
    let workspace_root = std::env::temp_dir().join(format!(
        "tandem-web-research-integration-{}",
        uuid::Uuid::new_v4()
    ));
    std::fs::create_dir_all(workspace_root.join("docs")).expect("create workspace");
    std::fs::write(
        workspace_root.join("docs/source.md"),
        "# Source\n\nWorkspace evidence for the web-backed brief.\n",
    )
    .expect("seed source file");

    let state = ready_test_state().await;

    let node = brief_research_node("research_web", ".tandem/artifacts/web-brief.md", true);
    let automation = automation_with_single_node(
        "automation-web-research",
        node.clone(),
        &workspace_root,
        vec!["read".to_string()],
    );
    let run = state
        .create_automation_v2_run(&automation, "manual")
        .await
        .expect("create run");
    let output_path = automation_node_required_output_path_for_run(&node, Some(&run.run_id))
        .expect("required output path");
    let workspace_snapshot_before = automation_workspace_root_file_snapshot(
        workspace_root.to_str().expect("workspace root string"),
    );
    let artifact_text = "# Marketing Brief\n\n## Workspace source audit\nPrepared from workspace sources.\n\n### Files Reviewed\n| Local Path | Evidence Summary |\n|---|---|\n| `docs/source.md` | Core source reviewed |\n\n### Files Not Reviewed\n| Local Path | Reason |\n|---|---|\n| `docs/extra.md` | Out of scope for this run |\n\n### Web Sources Reviewed\n| URL | Status | Notes |\n|---|---|---|\n| https://example.com | Fetched | Confirmed live |\n\n## Campaign goal\nClarify positioning.\n\n## Target audience\n- Operators.\n\n## Core pain points\n- Coordination overhead.\n\n## Positioning angle\nTandem centralizes orchestration.\n\n## Competitor context\nExternal web comparison for this run.\n\n## Proof points with citations\n1. Supported from docs/source.md. Source note: https://example.com/reference\n\n## Likely objections\n- Proof depth.\n\n## Channel considerations\n- Landing page.\n\n## Recommended message hierarchy\n1. Problem\n2. Promise\n"
        .to_string();

    let artifact_dir = workspace_root
        .join(".tandem/runs")
        .join(&run.run_id)
        .join("artifacts");
    std::fs::create_dir_all(&artifact_dir).expect("create artifact dir");
    std::fs::write(artifact_dir.join("web-brief.md"), &artifact_text).expect("write artifact");

    let session = assistant_session_with_tool_invocations(
        "web-research-validation",
        &workspace_root,
        vec![
            (
                "glob",
                json!({"pattern":"docs/**/*.md"}),
                json!({
                    "output": workspace_root
                        .join("docs/source.md")
                        .display()
                        .to_string()
                }),
                None,
            ),
            (
                "read",
                json!({"path":"docs/source.md"}),
                json!({"output":"Workspace evidence for the web-backed brief."}),
                None,
            ),
            (
                "websearch",
                json!({"query":"tandem competitor landscape"}),
                json!({
                    "output": "Matched Tandem web research",
                    "metadata": {"count": 2}
                }),
                None,
            ),
            (
                "write",
                json!({"path":output_path,"content":artifact_text}),
                json!({"ok": true}),
                None,
            ),
        ],
    );
    let requested_tools = vec![
        "glob".to_string(),
        "read".to_string(),
        "websearch".to_string(),
        "write".to_string(),
    ];
    let tool_telemetry = summarize_automation_tool_activity(&node, &session, &requested_tools);
    assert_eq!(
        tool_telemetry
            .get("executed_tools")
            .and_then(Value::as_array)
            .map(|values| values.iter().filter_map(Value::as_str).collect::<Vec<_>>()),
        Some(vec!["glob", "read", "websearch", "write"])
    );
    assert_eq!(
        tool_telemetry
            .get("web_research_used")
            .and_then(Value::as_bool),
        Some(true)
    );
    assert_eq!(
        tool_telemetry
            .get("web_research_succeeded")
            .and_then(Value::as_bool),
        Some(true)
    );

    let persisted = state
        .get_automation_v2_run(&run.run_id)
        .await
        .expect("persisted run");
    assert_eq!(persisted.status, AutomationRunStatus::Queued);
    assert_eq!(persisted.checkpoint.node_attempts.get("research_web"), None);

    let session_text = "Done\n\n{\"status\":\"completed\"}";
    let (accepted_output, artifact_validation, rejected) = validate_automation_artifact_output(
        &node,
        &session,
        workspace_root.to_str().expect("workspace root string"),
        session_text,
        &tool_telemetry,
        None,
        Some((output_path.clone(), artifact_text.clone())),
        &workspace_snapshot_before,
    );
    assert!(rejected.is_none());
    assert_eq!(
        artifact_validation
            .get("validation_outcome")
            .and_then(Value::as_str),
        Some("passed")
    );
    assert_eq!(
        artifact_validation
            .get("web_sources_reviewed_present")
            .and_then(Value::as_bool),
        Some(true)
    );

    let status = detect_automation_node_status(
        &node,
        session_text,
        accepted_output.as_ref(),
        &tool_telemetry,
        Some(&artifact_validation),
    );
    assert_eq!(status.0, "completed");

    let output = wrap_automation_node_output(
        &node,
        &session,
        &requested_tools,
        &session.id,
        Some(&run.run_id),
        session_text,
        accepted_output.clone(),
        Some(artifact_validation.clone()),
    );
    persist_validated_output(
        &state,
        &run.run_id,
        &node.node_id,
        output.clone(),
        AutomationRunStatus::Completed,
        1,
    )
    .await;

    let persisted = state
        .get_automation_v2_run(&run.run_id)
        .await
        .expect("persisted run");
    assert_eq!(persisted.status, AutomationRunStatus::Completed);
    assert_eq!(
        persisted.checkpoint.node_attempts.get("research_web"),
        Some(&1)
    );

    let output = persisted
        .checkpoint
        .node_outputs
        .get("research_web")
        .expect("node output");
    assert_eq!(
        output.get("status").and_then(Value::as_str),
        Some("completed")
    );
    assert_eq!(
        output
            .pointer("/artifact_validation/validation_outcome")
            .and_then(Value::as_str),
        Some("passed")
    );
    assert_eq!(
        output
            .pointer("/tool_telemetry/web_research_used")
            .and_then(Value::as_bool),
        Some(true)
    );
    assert_eq!(
        output
            .pointer("/tool_telemetry/web_research_succeeded")
            .and_then(Value::as_bool),
        Some(true)
    );
    let output_tools = output
        .pointer("/tool_telemetry/executed_tools")
        .and_then(Value::as_array)
        .map(|values| values.iter().filter_map(Value::as_str).collect::<Vec<_>>())
        .expect("output tools");
    assert!(output_tools.iter().any(|tool| *tool == "glob"));
    assert!(output_tools.iter().any(|tool| *tool == "read"));
    assert!(output_tools.iter().any(|tool| *tool == "websearch"));
    assert!(output_tools.iter().any(|tool| *tool == "write"));
    assert_eq!(
        output
            .pointer("/artifact_validation/web_sources_reviewed_present")
            .and_then(Value::as_bool),
        Some(true)
    );

    let written = std::fs::read_to_string(
        workspace_root
            .join(".tandem/runs")
            .join(&run.run_id)
            .join("artifacts")
            .join("web-brief.md"),
    )
    .expect("written artifact");
    assert_eq!(written, artifact_text);

    let _ = std::fs::remove_dir_all(&workspace_root);
}

#[tokio::test]
async fn repair_retry_after_needs_repair_completes_on_second_attempt() {
    let workspace_root = std::env::temp_dir().join(format!(
        "tandem-repair-retry-integration-{}",
        uuid::Uuid::new_v4()
    ));
    std::fs::create_dir_all(workspace_root.join("docs")).expect("create workspace");
    std::fs::write(
        workspace_root.join("docs/source.md"),
        "# Source\n\nWorkspace evidence for the retry brief.\n",
    )
    .expect("seed source file");

    let state = ready_test_state().await;

    let mut node = brief_research_node("research_retry", ".tandem/artifacts/retry-brief.md", true);
    node.retry_policy = Some(json!({
        "max_attempts": 2
    }));
    let automation = automation_with_single_node(
        "automation-retry-research",
        node.clone(),
        &workspace_root,
        vec!["read".to_string()],
    );
    let run = state
        .create_automation_v2_run(&automation, "manual")
        .await
        .expect("create run");
    let output_path = automation_node_required_output_path_for_run(&node, Some(&run.run_id))
        .expect("required output path");
    let workspace_snapshot_before = automation_workspace_root_file_snapshot(
        workspace_root.to_str().expect("workspace root string"),
    );
    let local_brief_text = "# Marketing Brief\n\n## Workspace source audit\nPrepared from workspace sources.\n\n## Campaign goal\nClarify positioning.\n\n## Target audience\n- Operators.\n\n## Core pain points\n- Coordination overhead.\n\n## Positioning angle\nTandem centralizes orchestration.\n\n## Competitor context\nLocal-only comparison for this first pass.\n\n## Proof points with citations\n1. Supported from docs/source.md. Source note: https://example.com/reference\n\n## Likely objections\n- Proof depth.\n\n## Channel considerations\n- Landing page.\n\n## Recommended message hierarchy\n1. Problem\n2. Promise\n\n## Files reviewed\n- docs/source.md\n\n## Files not reviewed\n- docs/extra.md: not needed for this first pass.\n"
        .to_string();
    let web_brief_text = "# Marketing Brief\n\n## Workspace source audit\nPrepared from workspace sources.\n\n### Files Reviewed\n| Local Path | Evidence Summary |\n|---|---|\n| `docs/source.md` | Core source reviewed |\n\n### Files Not Reviewed\n| Local Path | Reason |\n|---|---|\n| `docs/extra.md` | Out of scope for this run |\n\n### Web Sources Reviewed\n| URL | Status | Notes |\n|---|---|---|\n| https://example.com | Fetched | Confirmed live |\n\n## Campaign goal\nClarify positioning.\n\n## Target audience\n- Operators.\n\n## Core pain points\n- Coordination overhead.\n\n## Positioning angle\nTandem centralizes orchestration.\n\n## Competitor context\nExternal web comparison for the retry run.\n\n## Proof points with citations\n1. Supported from docs/source.md. Source note: https://example.com/reference\n\n## Likely objections\n- Proof depth.\n\n## Channel considerations\n- Landing page.\n\n## Recommended message hierarchy\n1. Problem\n2. Promise\n"
        .to_string();

    let artifact_dir = workspace_root
        .join(".tandem/runs")
        .join(&run.run_id)
        .join("artifacts");
    std::fs::create_dir_all(&artifact_dir).expect("create artifact dir");
    std::fs::write(artifact_dir.join("retry-brief.md"), &local_brief_text)
        .expect("write first artifact");

    let first_session = assistant_session_with_tool_invocations(
        "repair-retry-attempt-1",
        &workspace_root,
        vec![
            (
                "glob",
                json!({"pattern":"docs/**/*.md"}),
                json!({
                    "output": workspace_root
                        .join("docs/source.md")
                        .display()
                        .to_string()
                }),
                None,
            ),
            (
                "read",
                json!({"path":"docs/source.md"}),
                json!({"output":"Workspace evidence for the retry brief."}),
                None,
            ),
            (
                "write",
                json!({"path":output_path,"content":local_brief_text}),
                json!({"ok": true}),
                None,
            ),
        ],
    );
    let requested_tools = vec![
        "glob".to_string(),
        "read".to_string(),
        "websearch".to_string(),
        "write".to_string(),
    ];
    let first_telemetry =
        summarize_automation_tool_activity(&node, &first_session, &requested_tools);
    assert_eq!(
        first_telemetry
            .get("executed_tools")
            .and_then(Value::as_array)
            .map(|values| values.iter().filter_map(Value::as_str).collect::<Vec<_>>()),
        Some(vec!["glob", "read", "write"])
    );
    assert_eq!(
        first_telemetry
            .get("web_research_used")
            .and_then(Value::as_bool),
        Some(false)
    );

    let first_session_text = "Done\n\n{\"status\":\"completed\"}";
    let (first_accepted_output, first_artifact_validation, first_rejected) =
        validate_automation_artifact_output(
            &node,
            &first_session,
            workspace_root.to_str().expect("workspace root string"),
            first_session_text,
            &first_telemetry,
            None,
            Some((output_path.clone(), local_brief_text.clone())),
            &workspace_snapshot_before,
        );
    assert_eq!(
        first_artifact_validation
            .get("validation_outcome")
            .and_then(Value::as_str),
        Some("needs_repair")
    );
    let first_status = detect_automation_node_status(
        &node,
        first_session_text,
        first_accepted_output.as_ref(),
        &first_telemetry,
        Some(&first_artifact_validation),
    );
    assert_eq!(first_status.0, "needs_repair");
    assert!(first_rejected.is_some());
    assert!(first_artifact_validation
        .get("semantic_block_reason")
        .and_then(Value::as_str)
        .is_some());

    std::fs::write(artifact_dir.join("retry-brief.md"), &web_brief_text)
        .expect("write repaired artifact");

    let second_session = assistant_session_with_tool_invocations(
        "repair-retry-attempt-2",
        &workspace_root,
        vec![
            (
                "glob",
                json!({"pattern":"docs/**/*.md"}),
                json!({
                    "output": workspace_root
                        .join("docs/source.md")
                        .display()
                        .to_string()
                }),
                None,
            ),
            (
                "read",
                json!({"path":"docs/source.md"}),
                json!({"output":"Workspace evidence for the retry brief."}),
                None,
            ),
            (
                "write",
                json!({"path":output_path,"content":local_brief_text}),
                json!({"ok": true}),
                None,
            ),
            (
                "websearch",
                json!({"query":"tandem competitor landscape"}),
                json!({
                    "output": "Matched Tandem web research",
                    "metadata": {"count": 2}
                }),
                None,
            ),
            (
                "write",
                json!({"path":output_path,"content":web_brief_text}),
                json!({"ok": true}),
                None,
            ),
        ],
    );
    let second_telemetry =
        summarize_automation_tool_activity(&node, &second_session, &requested_tools);
    let second_executed_tools = second_telemetry
        .get("executed_tools")
        .and_then(Value::as_array)
        .map(|values| values.iter().filter_map(Value::as_str).collect::<Vec<_>>())
        .expect("executed tools");
    assert!(second_executed_tools.iter().any(|tool| *tool == "glob"));
    assert!(second_executed_tools.iter().any(|tool| *tool == "read"));
    assert!(second_executed_tools
        .iter()
        .any(|tool| *tool == "websearch"));
    assert!(second_executed_tools.iter().any(|tool| *tool == "write"));
    assert_eq!(
        second_telemetry
            .pointer("/tool_call_counts/write")
            .and_then(Value::as_u64),
        Some(2)
    );
    assert_eq!(
        second_telemetry
            .get("web_research_used")
            .and_then(Value::as_bool),
        Some(true)
    );
    assert_eq!(
        second_telemetry
            .get("web_research_succeeded")
            .and_then(Value::as_bool),
        Some(true)
    );

    let second_session_text = "Done\n\n{\"status\":\"completed\"}";
    let (accepted_output, artifact_validation, rejected) = validate_automation_artifact_output(
        &node,
        &second_session,
        workspace_root.to_str().expect("workspace root string"),
        second_session_text,
        &second_telemetry,
        Some(&local_brief_text),
        Some((output_path.clone(), web_brief_text.clone())),
        &workspace_snapshot_before,
    );
    assert!(rejected.is_none());
    assert_eq!(
        artifact_validation
            .get("validation_outcome")
            .and_then(Value::as_str),
        Some("passed")
    );
    assert_eq!(
        artifact_validation
            .get("repair_succeeded")
            .and_then(Value::as_bool),
        Some(true)
    );

    let status = detect_automation_node_status(
        &node,
        second_session_text,
        accepted_output.as_ref(),
        &second_telemetry,
        Some(&artifact_validation),
    );
    assert_eq!(status.0, "completed");

    let output = wrap_automation_node_output(
        &node,
        &second_session,
        &requested_tools,
        &second_session.id,
        Some(&run.run_id),
        second_session_text,
        accepted_output.clone(),
        Some(artifact_validation.clone()),
    );
    persist_validated_output(
        &state,
        &run.run_id,
        &node.node_id,
        output.clone(),
        AutomationRunStatus::Completed,
        2,
    )
    .await;

    let persisted = state
        .get_automation_v2_run(&run.run_id)
        .await
        .expect("persisted run");
    assert_eq!(persisted.status, AutomationRunStatus::Completed);
    assert_eq!(
        persisted.checkpoint.node_attempts.get("research_retry"),
        Some(&2)
    );

    let output = persisted
        .checkpoint
        .node_outputs
        .get("research_retry")
        .expect("node output");
    assert_eq!(
        output.get("status").and_then(Value::as_str),
        Some("completed")
    );
    assert_eq!(
        output
            .pointer("/artifact_validation/validation_outcome")
            .and_then(Value::as_str),
        Some("passed")
    );
    assert_eq!(
        output
            .pointer("/tool_telemetry/web_research_used")
            .and_then(Value::as_bool),
        Some(true)
    );
    assert_eq!(
        output
            .pointer("/tool_telemetry/web_research_succeeded")
            .and_then(Value::as_bool),
        Some(true)
    );
    let output_tools = output
        .pointer("/tool_telemetry/executed_tools")
        .and_then(Value::as_array)
        .map(|values| values.iter().filter_map(Value::as_str).collect::<Vec<_>>())
        .expect("output tools");
    assert!(output_tools.iter().any(|tool| *tool == "glob"));
    assert!(output_tools.iter().any(|tool| *tool == "read"));
    assert!(output_tools.iter().any(|tool| *tool == "websearch"));
    assert!(output_tools.iter().any(|tool| *tool == "write"));

    let written = std::fs::read_to_string(
        workspace_root
            .join(".tandem/runs")
            .join(&run.run_id)
            .join("artifacts")
            .join("retry-brief.md"),
    )
    .expect("written artifact");
    assert_eq!(written, web_brief_text);

    let _ = std::fs::remove_dir_all(&workspace_root);
}

#[tokio::test]
async fn restart_recovery_preserves_queued_and_paused_runs() {
    let paused_workspace =
        std::env::temp_dir().join(format!("tandem-recovery-paused-{}", uuid::Uuid::new_v4()));
    let queued_workspace =
        std::env::temp_dir().join(format!("tandem-recovery-queued-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&paused_workspace).expect("create paused workspace");
    std::fs::create_dir_all(&queued_workspace).expect("create queued workspace");

    let state = ready_test_state().await;
    let paused_automation = automation_with_single_node(
        "automation-paused-recovery",
        brief_research_node("paused_node", ".tandem/artifacts/paused.md", false),
        &paused_workspace,
        vec!["read".to_string()],
    );
    let queued_automation = automation_with_single_node(
        "automation-queued-recovery",
        brief_research_node("queued_node", ".tandem/artifacts/queued.md", false),
        &queued_workspace,
        vec!["read".to_string()],
    );

    let paused_run = state
        .create_automation_v2_run(&paused_automation, "manual")
        .await
        .expect("create paused run");
    let queued_run = state
        .create_automation_v2_run(&queued_automation, "manual")
        .await
        .expect("create queued run");

    state
        .update_automation_v2_run(&paused_run.run_id, |row| {
            row.status = AutomationRunStatus::Paused;
            row.pause_reason = Some("paused for recovery test".to_string());
            row.detail = Some("paused for recovery test".to_string());
            row.active_session_ids.clear();
            row.active_instance_ids.clear();
        })
        .await
        .expect("mark paused");

    let recovered = state.recover_in_flight_runs().await;
    assert_eq!(recovered, 0);

    let scheduler = state.automation_scheduler.read().await;
    assert!(!scheduler
        .locked_workspaces
        .contains_key(&paused_workspace.to_string_lossy().to_string()));
    assert!(!scheduler
        .locked_workspaces
        .contains_key(&queued_workspace.to_string_lossy().to_string()));
    drop(scheduler);

    let paused_persisted = state
        .get_automation_v2_run(&paused_run.run_id)
        .await
        .expect("paused run");
    let queued_persisted = state
        .get_automation_v2_run(&queued_run.run_id)
        .await
        .expect("queued run");
    assert_eq!(paused_persisted.status, AutomationRunStatus::Paused);
    assert_eq!(queued_persisted.status, AutomationRunStatus::Queued);

    let _ = std::fs::remove_dir_all(&paused_workspace);
    let _ = std::fs::remove_dir_all(&queued_workspace);
}
