pub(crate) use super::*;
pub(crate) fn test_automation_node(
    node_id: &str,
    depends_on: Vec<&str>,
    phase_id: &str,
    priority: i64,
) -> AutomationFlowNode {
    AutomationFlowNode {
        node_id: node_id.to_string(),
        agent_id: "agent-a".to_string(),
        objective: format!("Run {node_id}"),
        depends_on: depends_on.into_iter().map(str::to_string).collect(),
        input_refs: Vec::new(),
        output_contract: None,
        retry_policy: None,
        timeout_ms: None,
        stage_kind: Some(AutomationNodeStageKind::Workstream),
        gate: None,
        metadata: Some(json!({
            "builder": {
                "phase_id": phase_id,
                "priority": priority
            }
        })),
    }
}

pub(crate) fn test_phase_automation(
    phases: Value,
    nodes: Vec<AutomationFlowNode>,
) -> AutomationV2Spec {
    AutomationV2Spec {
        automation_id: "auto-phase-test".to_string(),
        name: "Phase Test".to_string(),
        description: None,
        status: AutomationV2Status::Active,
        schedule: AutomationV2Schedule {
            schedule_type: AutomationV2ScheduleType::Manual,
            cron_expression: None,
            interval_seconds: None,
            timezone: "UTC".to_string(),
            misfire_policy: RoutineMisfirePolicy::RunOnce,
        },
        agents: vec![AutomationAgentProfile {
            agent_id: "agent-a".to_string(),
            template_id: Some("template-a".to_string()),
            display_name: "Agent A".to_string(),
            avatar_url: None,
            model_policy: None,
            skills: Vec::new(),
            tool_policy: AutomationAgentToolPolicy {
                allowlist: Vec::new(),
                denylist: Vec::new(),
            },
            mcp_policy: AutomationAgentMcpPolicy {
                allowed_servers: Vec::new(),
                allowed_tools: None,
            },
            approval_policy: None,
        }],
        flow: AutomationFlowSpec { nodes },
        execution: AutomationExecutionPolicy {
            max_parallel_agents: Some(2),
            max_total_runtime_ms: None,
            max_total_tool_calls: None,
            max_total_tokens: None,
            max_total_cost_usd: None,
        },
        output_targets: Vec::new(),
        created_at_ms: 1,
        updated_at_ms: 1,
        creator_id: "test".to_string(),
        workspace_root: Some(".".to_string()),
        metadata: Some(json!({
            "mission": {
                "phases": phases
            }
        })),
        next_fire_at_ms: None,
        last_fired_at_ms: None,
    }
}

pub(crate) fn test_phase_run(
    pending_nodes: Vec<&str>,
    completed_nodes: Vec<&str>,
) -> AutomationV2RunRecord {
    AutomationV2RunRecord {
        run_id: "run-phase-test".to_string(),
        automation_id: "auto-phase-test".to_string(),
        trigger_type: "manual".to_string(),
        status: AutomationRunStatus::Queued,
        created_at_ms: 1,
        updated_at_ms: 1,
        started_at_ms: None,
        finished_at_ms: None,
        active_session_ids: Vec::new(),
        latest_session_id: None,
        active_instance_ids: Vec::new(),
        checkpoint: AutomationRunCheckpoint {
            completed_nodes: completed_nodes.into_iter().map(str::to_string).collect(),
            pending_nodes: pending_nodes.into_iter().map(str::to_string).collect(),
            node_outputs: std::collections::HashMap::new(),
            node_attempts: std::collections::HashMap::new(),
            blocked_nodes: Vec::new(),
            awaiting_gate: None,
            gate_history: Vec::new(),
            lifecycle_history: Vec::new(),
            last_failure: None,
        },
        automation_snapshot: None,
        pause_reason: None,
        resume_reason: None,
        detail: None,
        stop_kind: None,
        stop_reason: None,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        estimated_cost_usd: 0.0,
    }
}

pub(crate) fn test_state_with_path(path: PathBuf) -> AppState {
    let mut state = AppState::new_starting("test-attempt".to_string(), true);
    state.shared_resources_path = path;
    state.routines_path = tmp_routines_file("shared-state");
    state.routine_history_path = tmp_routines_file("routine-history");
    state.routine_runs_path = tmp_routines_file("routine-runs");
    state.external_actions_path = tmp_routines_file("external-actions");
    state
}

pub(crate) fn tmp_resource_file(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "tandem-server-{name}-{}.json",
        uuid::Uuid::new_v4()
    ))
}

pub(crate) fn tmp_routines_file(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "tandem-server-routines-{name}-{}.json",
        uuid::Uuid::new_v4()
    ))
}

mod automations;
mod routines;
mod shared_resources;
mod status_index;
