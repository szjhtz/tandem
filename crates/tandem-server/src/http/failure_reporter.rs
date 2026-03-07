use crate::capability_resolver::canonicalize_tool_name;
use crate::http::AppState;
use crate::{FailureReporterConfig, FailureReporterSubmission};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use super::context_runs::{
    context_run_tasks_create, ensure_context_run_dir, load_context_run_state,
    save_context_run_state,
};
use super::context_types::{
    ContextBlackboardTaskStatus, ContextRunCreateInput, ContextRunState, ContextRunStatus,
    ContextTaskCreateBatchInput, ContextTaskCreateInput, ContextWorkspaceLease,
};

#[derive(Debug, Deserialize, Default)]
pub(super) struct FailureReporterConfigInput {
    #[serde(default)]
    pub failure_reporter: Option<FailureReporterConfig>,
}

#[derive(Debug, Deserialize, Default)]
pub(super) struct FailureReporterDraftsQuery {
    pub limit: Option<usize>,
}

#[derive(Debug, Deserialize, Default)]
pub(super) struct FailureReporterSubmissionInput {
    #[serde(default)]
    pub report: Option<FailureReporterSubmission>,
}

#[derive(Debug, Deserialize, Default)]
pub(super) struct FailureReporterDecisionInput {
    #[serde(default)]
    pub reason: Option<String>,
}

pub(super) async fn get_failure_reporter_config(
    State(state): State<AppState>,
) -> Json<serde_json::Value> {
    let config = state.failure_reporter_config().await;
    Json(json!({
        "failure_reporter": config
    }))
}

pub(super) async fn patch_failure_reporter_config(
    State(state): State<AppState>,
    Json(input): Json<FailureReporterConfigInput>,
) -> Response {
    let Some(config) = input.failure_reporter else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": "failure_reporter object is required",
                "code": "FAILURE_REPORTER_CONFIG_REQUIRED",
            })),
        )
            .into_response();
    };
    match state.put_failure_reporter_config(config).await {
        Ok(saved) => Json(json!({ "failure_reporter": saved })).into_response(),
        Err(error) => (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": "Invalid failure reporter config",
                "code": "FAILURE_REPORTER_CONFIG_INVALID",
                "detail": error.to_string(),
            })),
        )
            .into_response(),
    }
}

pub(super) async fn get_failure_reporter_status(
    State(state): State<AppState>,
) -> Json<serde_json::Value> {
    let status = state.failure_reporter_status().await;
    Json(json!({
        "status": status
    }))
}

pub(super) async fn recompute_failure_reporter_status(
    State(state): State<AppState>,
) -> Json<serde_json::Value> {
    let status = state.failure_reporter_status().await;
    Json(json!({
        "status": status
    }))
}

pub(super) async fn get_failure_reporter_debug(
    State(state): State<AppState>,
) -> Json<serde_json::Value> {
    let status = state.failure_reporter_status().await;
    let selected_server_tools = if let Some(server_name) = status.config.mcp_server.as_deref() {
        state.mcp.server_tools(server_name).await
    } else {
        Vec::new()
    };
    let canonicalized_discovered_tools = selected_server_tools
        .iter()
        .map(|tool| {
            json!({
                "server_name": tool.server_name,
                "tool_name": tool.tool_name,
                "namespaced_name": tool.namespaced_name,
                "canonical_name": canonicalize_tool_name(&tool.namespaced_name),
            })
        })
        .collect::<Vec<_>>();
    Json(json!({
        "status": status,
        "selected_server_tools": selected_server_tools,
        "canonicalized_discovered_tools": canonicalized_discovered_tools,
    }))
}

pub(super) async fn list_failure_reporter_drafts(
    State(state): State<AppState>,
    Query(query): Query<FailureReporterDraftsQuery>,
) -> Json<serde_json::Value> {
    let drafts = state
        .list_failure_reporter_drafts(query.limit.unwrap_or(50))
        .await;
    Json(json!({
        "drafts": drafts,
        "count": drafts.len(),
    }))
}

pub(super) async fn get_failure_reporter_draft(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Response {
    let draft = state.get_failure_reporter_draft(&id).await;
    match draft {
        Some(draft) => Json(json!({ "draft": draft })).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(json!({
                "error": "Failure reporter draft not found",
                "code": "FAILURE_REPORTER_DRAFT_NOT_FOUND",
            })),
        )
            .into_response(),
    }
}

fn map_failure_reporter_draft_update_error(
    draft_id: String,
    error: anyhow::Error,
) -> (StatusCode, Json<serde_json::Value>) {
    let detail = error.to_string();
    if detail.contains("not found") {
        (
            StatusCode::NOT_FOUND,
            Json(json!({
                "error": "Failure Reporter draft not found",
                "code": "FAILURE_REPORTER_DRAFT_NOT_FOUND",
                "draft_id": draft_id,
            })),
        )
    } else if detail.contains("not waiting for approval") {
        (
            StatusCode::CONFLICT,
            Json(json!({
                "error": "Failure Reporter draft is not waiting for approval",
                "code": "FAILURE_REPORTER_DRAFT_NOT_PENDING_APPROVAL",
                "draft_id": draft_id,
                "detail": detail,
            })),
        )
    } else {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": "Failed to update Failure Reporter draft",
                "code": "FAILURE_REPORTER_DRAFT_UPDATE_FAILED",
                "draft_id": draft_id,
                "detail": detail,
            })),
        )
    }
}

pub(super) async fn report_failure_reporter_issue(
    State(state): State<AppState>,
    Json(input): Json<FailureReporterSubmissionInput>,
) -> Response {
    let Some(report) = input.report else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": "report object is required",
                "code": "FAILURE_REPORTER_REPORT_REQUIRED",
            })),
        )
            .into_response();
    };
    match state.submit_failure_reporter_draft(report).await {
        Ok(draft) => Json(json!({ "draft": draft })).into_response(),
        Err(error) => (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": "Failed to create Failure Reporter draft",
                "code": "FAILURE_REPORTER_REPORT_INVALID",
                "detail": error.to_string(),
            })),
        )
            .into_response(),
    }
}

pub(super) async fn approve_failure_reporter_draft(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<FailureReporterDecisionInput>,
) -> Response {
    match state
        .update_failure_reporter_draft_status(&id, "draft_ready", input.reason.as_deref())
        .await
    {
        Ok(draft) => Json(json!({ "ok": true, "draft": draft })).into_response(),
        Err(error) => map_failure_reporter_draft_update_error(id, error).into_response(),
    }
}

pub(super) async fn deny_failure_reporter_draft(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<FailureReporterDecisionInput>,
) -> Response {
    match state
        .update_failure_reporter_draft_status(&id, "denied", input.reason.as_deref())
        .await
    {
        Ok(draft) => Json(json!({ "ok": true, "draft": draft })).into_response(),
        Err(error) => map_failure_reporter_draft_update_error(id, error).into_response(),
    }
}

pub(super) async fn create_failure_reporter_triage_run(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Response {
    let config = state.failure_reporter_config().await;
    let draft = match state.get_failure_reporter_draft(&id).await {
        Some(row) => row,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({
                    "error": "Failure Reporter draft not found",
                    "code": "FAILURE_REPORTER_DRAFT_NOT_FOUND",
                    "draft_id": id,
                })),
            )
                .into_response();
        }
    };

    if draft.status.eq_ignore_ascii_case("denied") {
        return (
            StatusCode::CONFLICT,
            Json(json!({
                "error": "Denied Failure Reporter drafts cannot create triage runs",
                "code": "FAILURE_REPORTER_DRAFT_DENIED",
                "draft_id": id,
            })),
        )
            .into_response();
    }
    if config.require_approval_for_new_issues
        && draft.status.eq_ignore_ascii_case("approval_required")
    {
        return (
            StatusCode::CONFLICT,
            Json(json!({
                "error": "Failure Reporter draft must be approved before triage run creation",
                "code": "FAILURE_REPORTER_DRAFT_NOT_APPROVED",
                "draft_id": id,
            })),
        )
            .into_response();
    }

    if let Some(existing_run_id) = draft.triage_run_id.as_deref() {
        match load_context_run_state(&state, existing_run_id).await {
            Ok(run) => {
                return Json(json!({
                    "ok": true,
                    "deduped": true,
                    "draft": draft,
                    "run": run,
                }))
                .into_response();
            }
            Err(_) => {}
        }
    }

    let run_id = format!("failure-triage-{}", Uuid::new_v4().simple());
    let objective = format!(
        "Triage failure reporter draft {} for {}: {}",
        draft.draft_id,
        draft.repo,
        draft
            .title
            .clone()
            .unwrap_or_else(|| "Untitled failure".to_string())
    );
    let workspace = config
        .workspace_root
        .as_ref()
        .map(|root| ContextWorkspaceLease {
            workspace_id: root.clone(),
            canonical_path: root.clone(),
            lease_epoch: crate::now_ms(),
        });
    let model_provider = config
        .model_policy
        .as_ref()
        .and_then(|policy| policy.get("default_model"))
        .and_then(|row| row.get("provider_id"))
        .and_then(|row| row.as_str())
        .map(|row| row.trim().to_string())
        .filter(|row| !row.is_empty());
    let model_id = config
        .model_policy
        .as_ref()
        .and_then(|policy| policy.get("default_model"))
        .and_then(|row| row.get("model_id"))
        .and_then(|row| row.as_str())
        .map(|row| row.trim().to_string())
        .filter(|row| !row.is_empty());
    let mcp_servers = config
        .mcp_server
        .as_ref()
        .map(|row| vec![row.clone()])
        .filter(|row| !row.is_empty());

    let create_input = ContextRunCreateInput {
        run_id: Some(run_id.clone()),
        objective,
        run_type: Some("failure_reporter_triage".to_string()),
        workspace,
        source_client: Some("failure_reporter".to_string()),
        model_provider,
        model_id,
        mcp_servers,
    };
    let created_run =
        match super::context_runs::context_run_create(State(state.clone()), Json(create_input))
            .await
        {
            Ok(Json(payload)) => match serde_json::from_value::<ContextRunState>(
                payload.get("run").cloned().unwrap_or_default(),
            ) {
                Ok(run) => run,
                Err(_) => {
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({
                            "error": "Failed to deserialize triage context run",
                            "code": "FAILURE_REPORTER_TRIAGE_RUN_DECODE_FAILED",
                            "draft_id": id,
                        })),
                    )
                        .into_response();
                }
            },
            Err(status) => {
                return (
                    status,
                    Json(json!({
                        "error": "Failed to create triage context run",
                        "code": "FAILURE_REPORTER_TRIAGE_RUN_CREATE_FAILED",
                        "draft_id": id,
                    })),
                )
                    .into_response();
            }
        };

    let inspect_task_id = format!("triage-inspect-{}", Uuid::new_v4().simple());
    let validate_task_id = format!("triage-validate-{}", Uuid::new_v4().simple());
    let tasks_input = ContextTaskCreateBatchInput {
        tasks: vec![
            ContextTaskCreateInput {
                command_id: Some(format!("failure-triage:{run_id}:inspect")),
                id: Some(inspect_task_id.clone()),
                task_type: "inspection".to_string(),
                payload: json!({
                    "task_kind": "inspection",
                    "title": "Inspect failure report and affected area",
                    "draft_id": draft.draft_id,
                    "repo": draft.repo,
                    "summary": draft.title,
                    "detail": draft.detail,
                }),
                status: Some(ContextBlackboardTaskStatus::Runnable),
                workflow_id: Some("failure_reporter_triage".to_string()),
                workflow_node_id: Some("inspect_failure_report".to_string()),
                parent_task_id: None,
                depends_on_task_ids: Vec::new(),
                decision_ids: Vec::new(),
                artifact_ids: Vec::new(),
                priority: Some(10),
                max_attempts: Some(2),
            },
            ContextTaskCreateInput {
                command_id: Some(format!("failure-triage:{run_id}:validate")),
                id: Some(validate_task_id.clone()),
                task_type: "validation".to_string(),
                payload: json!({
                    "task_kind": "validation",
                    "title": "Reproduce or validate failure scope",
                    "draft_id": draft.draft_id,
                    "repo": draft.repo,
                    "depends_on": inspect_task_id,
                }),
                status: Some(ContextBlackboardTaskStatus::Pending),
                workflow_id: Some("failure_reporter_triage".to_string()),
                workflow_node_id: Some("validate_failure_scope".to_string()),
                parent_task_id: None,
                depends_on_task_ids: vec![inspect_task_id.clone()],
                decision_ids: Vec::new(),
                artifact_ids: Vec::new(),
                priority: Some(5),
                max_attempts: Some(2),
            },
        ],
    };
    let tasks_response = context_run_tasks_create(
        State(state.clone()),
        Path(run_id.clone()),
        Json(tasks_input),
    )
    .await;
    if tasks_response.is_err() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "error": "Failed to seed triage tasks",
                "code": "FAILURE_REPORTER_TRIAGE_TASK_CREATE_FAILED",
                "draft_id": id,
                "run_id": run_id,
            })),
        )
            .into_response();
    }

    let mut updated_draft = draft.clone();
    updated_draft.triage_run_id = Some(run_id.clone());
    updated_draft.status = "triage_queued".to_string();
    {
        let mut drafts = state.failure_reporter_drafts.write().await;
        drafts.insert(updated_draft.draft_id.clone(), updated_draft.clone());
    }
    if let Err(error) = state.persist_failure_reporter_drafts().await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "error": "Failed to persist Failure Reporter draft triage state",
                "code": "FAILURE_REPORTER_TRIAGE_PERSIST_FAILED",
                "detail": error.to_string(),
                "draft_id": id,
                "run_id": run_id,
            })),
        )
            .into_response();
    }

    let mut run = match load_context_run_state(&state, &run_id).await {
        Ok(row) => row,
        Err(_) => created_run,
    };
    run.status = ContextRunStatus::Planning;
    run.why_next_step =
        Some("Inspect the failure report, then validate the failure scope.".to_string());
    if let Err(status) = ensure_context_run_dir(&state, &run_id).await {
        return (
            status,
            Json(json!({
                "error": "Failed to finalize triage run workspace",
                "code": "FAILURE_REPORTER_TRIAGE_RUN_DIR_FAILED",
                "draft_id": id,
                "run_id": run_id,
            })),
        )
            .into_response();
    }
    if let Err(status) = save_context_run_state(&state, &run).await {
        return (
            status,
            Json(json!({
                "error": "Failed to finalize triage run state",
                "code": "FAILURE_REPORTER_TRIAGE_RUN_SAVE_FAILED",
                "draft_id": id,
                "run_id": run_id,
            })),
        )
            .into_response();
    }
    state.event_bus.publish(tandem_types::EngineEvent::new(
        "failure_reporter.triage_run.created",
        json!({
            "draft_id": updated_draft.draft_id,
            "run_id": run.run_id,
            "repo": updated_draft.repo,
        }),
    ));

    Json(json!({
        "ok": true,
        "draft": updated_draft,
        "run": run,
    }))
    .into_response()
}
