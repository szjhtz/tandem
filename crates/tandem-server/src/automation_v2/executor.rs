use std::panic::AssertUnwindSafe;

use futures::future::join_all;
use futures::FutureExt;
use serde_json::{json, Value};

use crate::app::state::AppState;
use crate::automation_v2::types::{
    AutomationFlowNode, AutomationPendingGate, AutomationRunStatus, AutomationStopKind,
};
use crate::util::time::now_ms;

pub async fn run_automation_v2_executor(state: AppState) {
    loop {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        let Some(run) = state.claim_next_queued_automation_v2_run().await else {
            continue;
        };
        let Some(automation) = state.get_automation_v2(&run.automation_id).await else {
            let _ = state
                .update_automation_v2_run(&run.run_id, |row| {
                    row.status = AutomationRunStatus::Failed;
                    row.detail = Some("automation not found".to_string());
                })
                .await;
            continue;
        };
        if let Err(error) =
            crate::app::state::clear_automation_declared_outputs(&state, &automation).await
        {
            let _ = state
                .update_automation_v2_run(&run.run_id, |row| {
                    row.status = AutomationRunStatus::Failed;
                    row.detail = Some(error.to_string());
                })
                .await;
            continue;
        }
        let max_parallel = automation
            .execution
            .max_parallel_agents
            .unwrap_or(1)
            .clamp(1, 16) as usize;

        loop {
            let Some(latest) = state.get_automation_v2_run(&run.run_id).await else {
                break;
            };
            if latest.checkpoint.awaiting_gate.is_none() {
                let blocked_nodes =
                    crate::app::state::automation_blocked_nodes(&automation, &latest);
                let _ = state
                    .update_automation_v2_run(&run.run_id, |row| {
                        row.checkpoint.blocked_nodes = blocked_nodes.clone();
                        crate::app::state::record_automation_open_phase_event(&automation, row);
                    })
                    .await;
            }
            if let Some(detail) =
                crate::app::state::automation_guardrail_failure(&automation, &latest)
            {
                let session_ids = latest.active_session_ids.clone();
                for session_id in &session_ids {
                    let _ = state.cancellations.cancel(&session_id).await;
                }
                state.forget_automation_v2_sessions(&session_ids).await;
                let instance_ids = latest.active_instance_ids.clone();
                for instance_id in instance_ids {
                    let _ = state
                        .agent_teams
                        .cancel_instance(&state, &instance_id, "stopped by guardrail")
                        .await;
                }
                let _ = state
                    .update_automation_v2_run(&run.run_id, |row| {
                        row.status = AutomationRunStatus::Cancelled;
                        row.detail = Some(detail.clone());
                        row.stop_kind = Some(AutomationStopKind::GuardrailStopped);
                        row.stop_reason = Some(detail.clone());
                        row.active_session_ids.clear();
                        row.active_instance_ids.clear();
                        crate::app::state::record_automation_lifecycle_event(
                            row,
                            "run_guardrail_stopped",
                            Some(detail.clone()),
                            Some(AutomationStopKind::GuardrailStopped),
                        );
                    })
                    .await;
                break;
            }
            if matches!(
                latest.status,
                AutomationRunStatus::Paused
                    | AutomationRunStatus::Pausing
                    | AutomationRunStatus::AwaitingApproval
                    | AutomationRunStatus::Cancelled
                    | AutomationRunStatus::Blocked
                    | AutomationRunStatus::Failed
                    | AutomationRunStatus::Completed
            ) {
                break;
            }
            if latest.checkpoint.pending_nodes.is_empty() {
                let _ = state
                    .update_automation_v2_run(&run.run_id, |row| {
                        if row.checkpoint.blocked_nodes.is_empty() {
                            row.status = AutomationRunStatus::Completed;
                            row.detail = Some("automation run completed".to_string());
                        } else {
                            row.status = AutomationRunStatus::Blocked;
                            row.detail =
                                Some("automation run blocked by upstream node outcome".to_string());
                        }
                    })
                    .await;
                break;
            }

            let completed = latest
                .checkpoint
                .completed_nodes
                .iter()
                .cloned()
                .collect::<std::collections::HashSet<_>>();
            let pending = latest.checkpoint.pending_nodes.clone();
            let mut runnable = pending
                .iter()
                .filter_map(|node_id| {
                    let node = automation
                        .flow
                        .nodes
                        .iter()
                        .find(|n| n.node_id == *node_id)?;
                    if node.depends_on.iter().all(|dep| completed.contains(dep)) {
                        Some(node.clone())
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>();
            runnable = crate::app::state::automation_filter_runnable_by_open_phase(
                &automation,
                &latest,
                runnable,
            );
            let phase_rank = crate::app::state::automation_phase_rank_map(&automation);
            let current_open_phase_rank =
                crate::app::state::automation_current_open_phase(&automation, &latest)
                    .map(|(_, rank, _)| rank);
            runnable.sort_by(|a, b| {
                crate::app::state::automation_node_sort_key(a, &phase_rank, current_open_phase_rank)
                    .cmp(&crate::app::state::automation_node_sort_key(
                        b,
                        &phase_rank,
                        current_open_phase_rank,
                    ))
            });
            let runnable = crate::app::state::automation_filter_runnable_by_write_scope_conflicts(
                runnable,
                max_parallel,
            );

            if runnable.is_empty() {
                let _ = state
                    .update_automation_v2_run(&run.run_id, |row| {
                        if row.checkpoint.blocked_nodes.is_empty() {
                            row.status = AutomationRunStatus::Failed;
                            row.detail = Some("flow deadlock: no runnable nodes".to_string());
                        } else {
                            row.status = AutomationRunStatus::Blocked;
                            row.detail = Some(
                                "automation run blocked: no runnable nodes remain".to_string(),
                            );
                        }
                    })
                    .await;
                break;
            }

            let executable = runnable
                .iter()
                .filter(|node| !crate::app::state::is_automation_approval_node(node))
                .cloned()
                .collect::<Vec<_>>();
            if executable.is_empty() {
                if let Some(gate_node) = runnable
                    .iter()
                    .find(|node| crate::app::state::is_automation_approval_node(node))
                {
                    let blocked_nodes = crate::app::state::collect_automation_descendants(
                        &automation,
                        &std::iter::once(gate_node.node_id.clone()).collect(),
                    )
                    .into_iter()
                    .filter(|node_id| node_id != &gate_node.node_id)
                    .collect::<Vec<_>>();
                    let Some(gate) = crate::app::state::build_automation_pending_gate(gate_node)
                    else {
                        let _ = state
                            .update_automation_v2_run(&run.run_id, |row| {
                                row.status = AutomationRunStatus::Failed;
                                row.detail = Some("approval node missing gate config".to_string());
                            })
                            .await;
                        break;
                    };
                    let _ = state
                        .update_automation_v2_run(&run.run_id, |row| {
                            row.status = AutomationRunStatus::AwaitingApproval;
                            row.detail =
                                Some(format!("awaiting approval for gate `{}`", gate.node_id));
                            row.checkpoint.awaiting_gate = Some(gate.clone());
                            row.checkpoint.blocked_nodes = blocked_nodes.clone();
                        })
                        .await;
                }
                break;
            }

            let runnable_node_ids = executable
                .iter()
                .map(|node| node.node_id.clone())
                .collect::<Vec<_>>();
            let _ = state
                .update_automation_v2_run(&run.run_id, |row| {
                    for node_id in &runnable_node_ids {
                        let attempts = row
                            .checkpoint
                            .node_attempts
                            .entry(node_id.clone())
                            .or_insert(0);
                        *attempts += 1;
                    }
                    for node in &executable {
                        let attempt = row
                            .checkpoint
                            .node_attempts
                            .get(&node.node_id)
                            .copied()
                            .unwrap_or(0);
                        crate::app::state::record_automation_lifecycle_event_with_metadata(
                            row,
                            "node_started",
                            Some(format!("node `{}` started", node.node_id)),
                            None,
                            Some(json!({
                                "node_id": node.node_id,
                                "agent_id": node.agent_id,
                                "objective": node.objective,
                                "attempt": attempt,
                            })),
                        );
                    }
                })
                .await;

            let tasks = executable
                .iter()
                .map(|node| {
                    let Some(agent) = automation
                        .agents
                        .iter()
                        .find(|a| a.agent_id == node.agent_id)
                        .cloned()
                    else {
                        return futures::future::ready((
                            node.node_id.clone(),
                            Err(anyhow::anyhow!("agent not found")),
                        ))
                        .boxed();
                    };
                    let state = state.clone();
                    let run_id = run.run_id.clone();
                    let automation = automation.clone();
                    let node = node.clone();
                    async move {
                        let result = AssertUnwindSafe(
                            crate::app::state::execute_automation_v2_node(
                                &state,
                                &run_id,
                                &automation,
                                &node,
                                &agent,
                            ),
                        )
                        .catch_unwind()
                        .await
                        .map_err(|panic_payload| {
                            let detail = if let Some(message) = panic_payload.downcast_ref::<&str>()
                            {
                                (*message).to_string()
                            } else if let Some(message) = panic_payload.downcast_ref::<String>() {
                                message.clone()
                            } else {
                                "unknown panic".to_string()
                            };
                            anyhow::anyhow!("node execution panicked: {}", detail)
                        })
                        .and_then(|result| result);
                        (node.node_id, result)
                    }
                    .boxed()
                })
                .collect::<Vec<_>>();
            let outcomes = join_all(tasks).await;

            let mut terminal_failure = None::<String>;
            let latest_attempts = state
                .get_automation_v2_run(&run.run_id)
                .await
                .map(|row| row.checkpoint.node_attempts)
                .unwrap_or_default();
            for (node_id, result) in outcomes {
                match result {
                    Ok(output) => {
                        let can_accept = state
                            .get_automation_v2_run(&run.run_id)
                            .await
                            .map(|row| {
                                matches!(
                                    row.status,
                                    AutomationRunStatus::Running | AutomationRunStatus::Queued
                                )
                            })
                            .unwrap_or(false);
                        if !can_accept {
                            continue;
                        }
                        let session_id = crate::app::state::automation_output_session_id(&output);
                        let summary = output
                            .get("summary")
                            .and_then(Value::as_str)
                            .map(str::trim)
                            .unwrap_or_default()
                            .to_string();
                        let contract_kind = output
                            .get("contract_kind")
                            .and_then(Value::as_str)
                            .map(str::trim)
                            .unwrap_or_default()
                            .to_string();
                        let blocked = crate::app::state::automation_output_is_blocked(&output);
                        let verify_failed =
                            crate::app::state::automation_output_is_verify_failed(&output);
                        let blocked_reason =
                            crate::app::state::automation_output_blocked_reason(&output);
                        let failure_reason =
                            crate::app::state::automation_output_failure_reason(&output);
                        let attempt = latest_attempts.get(&node_id).copied().unwrap_or(1);
                        let _ = state
                            .update_automation_v2_run(&run.run_id, |row| {
                                let blocked_descendants = if blocked || verify_failed {
                                    crate::app::state::collect_automation_descendants(
                                        &automation,
                                        &std::iter::once(node_id.clone()).collect(),
                                    )
                                } else {
                                    std::collections::HashSet::new()
                                };
                                row.checkpoint.pending_nodes.retain(|id| {
                                    id != &node_id && !blocked_descendants.contains(id)
                                });
                                if !blocked
                                    && !verify_failed
                                    && !row
                                        .checkpoint
                                        .completed_nodes
                                        .iter()
                                        .any(|id| id == &node_id)
                                {
                                    row.checkpoint.completed_nodes.push(node_id.clone());
                                }
                                if blocked {
                                    if !row.checkpoint.blocked_nodes.iter().any(|id| id == &node_id)
                                    {
                                        row.checkpoint.blocked_nodes.push(node_id.clone());
                                    }
                                    for blocked_node in &blocked_descendants {
                                        if !row
                                            .checkpoint
                                            .blocked_nodes
                                            .iter()
                                            .any(|id| id == blocked_node)
                                        {
                                            row.checkpoint.blocked_nodes.push(blocked_node.clone());
                                        }
                                    }
                                }
                                row.checkpoint
                                    .node_outputs
                                    .insert(node_id.clone(), output.clone());
                                if !verify_failed
                                    && row
                                        .checkpoint
                                        .last_failure
                                        .as_ref()
                                        .is_some_and(|failure| failure.node_id == node_id)
                                {
                                    row.checkpoint.last_failure = None;
                                }
                                if verify_failed {
                                    row.checkpoint.last_failure = Some(
                                        crate::automation_v2::types::AutomationFailureRecord {
                                            node_id: node_id.clone(),
                                            reason: failure_reason.clone().unwrap_or_else(|| {
                                                "verification failed".to_string()
                                            }),
                                            failed_at_ms: now_ms(),
                                        },
                                    );
                                }
                                crate::app::state::record_automation_workflow_state_events(
                                    row,
                                    &node_id,
                                    &output,
                                    attempt,
                                    session_id.as_deref(),
                                    &summary,
                                    &contract_kind,
                                );
                                crate::app::state::record_automation_lifecycle_event_with_metadata(
                                    row,
                                    if verify_failed {
                                        "node_verify_failed"
                                    } else if blocked {
                                        "node_blocked"
                                    } else {
                                        "node_completed"
                                    },
                                    Some(if verify_failed {
                                        format!("node `{}` failed verification", node_id)
                                    } else if blocked {
                                        format!("node `{}` blocked downstream execution", node_id)
                                    } else {
                                        format!("node `{}` completed", node_id)
                                    }),
                                    None,
                                    Some(json!({
                                        "node_id": node_id,
                                        "attempt": attempt,
                                        "session_id": session_id,
                                        "summary": summary,
                                        "contract_kind": contract_kind,
                                        "status": if verify_failed {
                                            "verify_failed"
                                        } else if blocked {
                                            "blocked"
                                        } else {
                                            "completed"
                                        },
                                        "blocked_reason": blocked_reason,
                                        "failure_reason": failure_reason,
                                        "blocked_descendants": blocked_descendants,
                                    })),
                                );
                                if !blocked && !verify_failed {
                                    crate::app::state::record_milestone_promotions(
                                        &automation,
                                        row,
                                        &node_id,
                                    );
                                }
                                crate::app::state::refresh_automation_runtime_state(
                                    &automation,
                                    row,
                                );
                            })
                            .await;
                        if verify_failed {
                            terminal_failure = Some(failure_reason.unwrap_or_else(|| {
                                format!("node `{}` failed verification", node_id)
                            }));
                            let _ = state
                                .update_automation_v2_run(&run.run_id, |row| {
                                    row.status = AutomationRunStatus::Failed;
                                    row.detail = terminal_failure.clone();
                                })
                                .await;
                            break;
                        }
                    }
                    Err(error) => {
                        let should_ignore = state
                            .get_automation_v2_run(&run.run_id)
                            .await
                            .map(|row| {
                                matches!(
                                    row.status,
                                    AutomationRunStatus::Paused
                                        | AutomationRunStatus::Pausing
                                        | AutomationRunStatus::AwaitingApproval
                                        | AutomationRunStatus::Cancelled
                                        | AutomationRunStatus::Blocked
                                        | AutomationRunStatus::Failed
                                        | AutomationRunStatus::Completed
                                )
                            })
                            .unwrap_or(false);
                        if should_ignore {
                            continue;
                        }
                        let detail = crate::app::state::truncate_text(&error.to_string(), 500);
                        let attempts = latest_attempts.get(&node_id).copied().unwrap_or(1);
                        let max_attempts = automation
                            .flow
                            .nodes
                            .iter()
                            .find(|row| row.node_id == node_id)
                            .map(crate::app::state::automation_node_max_attempts)
                            .unwrap_or(1);
                        let terminal = attempts >= max_attempts;
                        let _ = state
                            .update_automation_v2_run(&run.run_id, |row| {
                                crate::app::state::record_automation_lifecycle_event_with_metadata(
                                    row,
                                    "node_failed",
                                    Some(format!("node `{}` failed", node_id)),
                                    None,
                                    Some(json!({
                                        "node_id": node_id,
                                        "attempt": attempts,
                                        "max_attempts": max_attempts,
                                        "reason": detail,
                                        "terminal": terminal,
                                    })),
                                );
                            })
                            .await;
                        if terminal {
                            terminal_failure = Some(format!(
                                "node `{}` failed after {}/{} attempts: {}",
                                node_id, attempts, max_attempts, detail
                            ));
                            let _ = state
                                .update_automation_v2_run(&run.run_id, |row| {
                                    row.checkpoint.last_failure = Some(
                                        crate::automation_v2::types::AutomationFailureRecord {
                                            node_id: node_id.clone(),
                                            reason: detail.clone(),
                                            failed_at_ms: now_ms(),
                                        },
                                    );
                                })
                                .await;
                            break;
                        }
                        let _ = state
                            .update_automation_v2_run(&run.run_id, |row| {
                                row.detail = Some(format!(
                                    "retrying node `{}` after attempt {}/{} failed: {}",
                                    node_id, attempts, max_attempts, detail
                                ));
                            })
                            .await;
                    }
                }
            }
            if let Some(detail) = terminal_failure {
                let _ = state
                    .update_automation_v2_run(&run.run_id, |row| {
                        row.status = AutomationRunStatus::Failed;
                        row.detail = Some(detail);
                    })
                    .await;
                break;
            }
        }
    }
}
