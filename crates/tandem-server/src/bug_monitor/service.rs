use anyhow::Result;
use serde_json::Value;

use crate::app::state::{sha256_hex, truncate_text, AppState};
use crate::bug_monitor::types::BugMonitorIncidentRecord;
use crate::bug_monitor::types::{BugMonitorConfig, BugMonitorSubmission};
use crate::EngineEvent;

pub async fn collect_bug_monitor_excerpt(state: &AppState, properties: &Value) -> Vec<String> {
    let mut excerpt = Vec::new();
    if let Some(reason) = first_string(properties, &["reason", "error", "detail", "message"]) {
        excerpt.push(reason);
    }
    if let Some(title) = first_string(properties, &["title", "task"]) {
        if !excerpt.iter().any(|row| row == &title) {
            excerpt.push(title);
        }
    }
    let logs = state.logs.read().await;
    for entry in logs.iter().rev().take(3) {
        if let Some(message) = entry.get("message").and_then(|row| row.as_str()) {
            excerpt.push(truncate_text(message, 240));
        }
    }
    excerpt.truncate(8);
    excerpt
}

pub async fn process_event(
    state: &AppState,
    event: &EngineEvent,
    config: &BugMonitorConfig,
) -> anyhow::Result<BugMonitorIncidentRecord> {
    let submission = build_bug_monitor_submission_from_event(state, config, event).await?;
    let duplicate_matches = crate::http::bug_monitor::bug_monitor_failure_pattern_matches(
        state,
        submission.repo.as_deref().unwrap_or_default(),
        submission.fingerprint.as_deref().unwrap_or_default(),
        submission.title.as_deref(),
        submission.detail.as_deref(),
        &submission.excerpt,
        3,
    )
    .await;
    let fingerprint = submission
        .fingerprint
        .clone()
        .ok_or_else(|| anyhow::anyhow!("bug monitor submission fingerprint missing"))?;
    let default_workspace_root = state.workspace_index.snapshot().await.root;
    let workspace_root = config
        .workspace_root
        .clone()
        .unwrap_or(default_workspace_root);
    let now = crate::util::time::now_ms();

    let existing = state
        .bug_monitor_incidents
        .read()
        .await
        .values()
        .find(|row| row.fingerprint == fingerprint)
        .cloned();

    let mut incident = if let Some(mut row) = existing {
        row.occurrence_count = row.occurrence_count.saturating_add(1);
        row.updated_at_ms = now;
        row.last_seen_at_ms = Some(now);
        if row.excerpt.is_empty() {
            row.excerpt = submission.excerpt.clone();
        }
        row
    } else {
        BugMonitorIncidentRecord {
            incident_id: format!("failure-incident-{}", uuid::Uuid::new_v4().simple()),
            fingerprint: fingerprint.clone(),
            event_type: event.event_type.clone(),
            status: "queued".to_string(),
            repo: submission.repo.clone().unwrap_or_default(),
            workspace_root,
            title: submission
                .title
                .clone()
                .unwrap_or_else(|| format!("Failure detected in {}", event.event_type)),
            detail: submission.detail.clone(),
            excerpt: submission.excerpt.clone(),
            source: submission.source.clone(),
            run_id: submission.run_id.clone(),
            session_id: submission.session_id.clone(),
            correlation_id: submission.correlation_id.clone(),
            component: submission.component.clone(),
            level: submission.level.clone(),
            occurrence_count: 1,
            created_at_ms: now,
            updated_at_ms: now,
            last_seen_at_ms: Some(now),
            draft_id: None,
            triage_run_id: None,
            last_error: None,
            duplicate_summary: None,
            duplicate_matches: None,
            event_payload: Some(event.properties.clone()),
        }
    };
    state.put_bug_monitor_incident(incident.clone()).await?;

    if !duplicate_matches.is_empty() {
        incident.status = "duplicate_suppressed".to_string();
        let duplicate_summary =
            crate::http::bug_monitor::build_bug_monitor_duplicate_summary(&duplicate_matches);
        incident.duplicate_summary = Some(duplicate_summary.clone());
        incident.duplicate_matches = Some(duplicate_matches.clone());
        incident.updated_at_ms = crate::util::time::now_ms();
        state.put_bug_monitor_incident(incident.clone()).await?;
        state.event_bus.publish(EngineEvent::new(
            "bug_monitor.incident.duplicate_suppressed",
            serde_json::json!({
                "incident_id": incident.incident_id,
                "fingerprint": incident.fingerprint,
                "eventType": incident.event_type,
                "status": incident.status,
                "duplicate_summary": duplicate_summary,
                "duplicate_matches": duplicate_matches,
            }),
        ));
        return Ok(incident);
    }

    let draft = match state.submit_bug_monitor_draft(submission).await {
        Ok(draft) => draft,
        Err(error) => {
            incident.status = "draft_failed".to_string();
            incident.last_error = Some(truncate_text(&error.to_string(), 500));
            incident.updated_at_ms = crate::util::time::now_ms();
            state.put_bug_monitor_incident(incident.clone()).await?;
            state.event_bus.publish(EngineEvent::new(
                "bug_monitor.incident.detected",
                serde_json::json!({
                    "incident_id": incident.incident_id,
                    "fingerprint": incident.fingerprint,
                    "eventType": incident.event_type,
                    "draft_id": incident.draft_id,
                    "triage_run_id": incident.triage_run_id,
                    "status": incident.status,
                    "detail": incident.last_error,
                }),
            ));
            return Ok(incident);
        }
    };
    incident.draft_id = Some(draft.draft_id.clone());
    incident.status = "draft_created".to_string();
    state.put_bug_monitor_incident(incident.clone()).await?;

    match crate::http::bug_monitor::ensure_bug_monitor_triage_run(
        state.clone(),
        &draft.draft_id,
        true,
    )
    .await
    {
        Ok((updated_draft, _run_id, _deduped)) => {
            incident.triage_run_id = updated_draft.triage_run_id.clone();
            if incident.triage_run_id.is_some() {
                incident.status = "triage_queued".to_string();
            }
            incident.last_error = None;
        }
        Err(error) => {
            incident.status = "draft_created".to_string();
            incident.last_error = Some(truncate_text(&error.to_string(), 500));
        }
    }

    if let Some(draft_id) = incident.draft_id.clone() {
        let latest_draft = state
            .get_bug_monitor_draft(&draft_id)
            .await
            .unwrap_or(draft.clone());
        match crate::bug_monitor_github::publish_draft(
            state,
            &draft_id,
            Some(&incident.incident_id),
            crate::bug_monitor_github::PublishMode::Auto,
        )
        .await
        {
            Ok(outcome) => {
                incident.status = outcome.action;
                incident.last_error = None;
            }
            Err(error) => {
                let detail = truncate_text(&error.to_string(), 500);
                incident.last_error = Some(detail.clone());
                let mut failed_draft = latest_draft;
                failed_draft.status = "github_post_failed".to_string();
                failed_draft.github_status = Some("github_post_failed".to_string());
                failed_draft.last_post_error = Some(detail.clone());
                let evidence_digest = failed_draft.evidence_digest.clone();
                let _ = state.put_bug_monitor_draft(failed_draft.clone()).await;
                let _ = crate::bug_monitor_github::record_post_failure(
                    state,
                    &failed_draft,
                    Some(&incident.incident_id),
                    "auto_post",
                    evidence_digest.as_deref(),
                    &detail,
                )
                .await;
            }
        }
    }

    incident.updated_at_ms = crate::util::time::now_ms();
    state.put_bug_monitor_incident(incident.clone()).await?;
    state.event_bus.publish(EngineEvent::new(
        "bug_monitor.incident.detected",
        serde_json::json!({
            "incident_id": incident.incident_id,
            "fingerprint": incident.fingerprint,
            "eventType": incident.event_type,
            "draft_id": incident.draft_id,
            "triage_run_id": incident.triage_run_id,
            "status": incident.status,
        }),
    ));
    Ok(incident)
}
pub fn first_string(properties: &Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(value) = properties.get(*key).and_then(|row| row.as_str()) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

pub async fn build_bug_monitor_submission_from_event(
    state: &AppState,
    config: &BugMonitorConfig,
    event: &EngineEvent,
) -> Result<BugMonitorSubmission> {
    let repo = config
        .repo
        .clone()
        .ok_or_else(|| anyhow::anyhow!("Bug Monitor repo is not configured"))?;
    let default_workspace_root = state.workspace_index.snapshot().await.root;
    let workspace_root = config
        .workspace_root
        .clone()
        .unwrap_or(default_workspace_root);
    let reason = first_string(
        &event.properties,
        &["reason", "error", "detail", "message", "summary"],
    );
    let run_id = first_string(&event.properties, &["runID", "run_id"]);
    let session_id = first_string(&event.properties, &["sessionID", "session_id"]);
    let correlation_id = first_string(
        &event.properties,
        &["correlationID", "correlation_id", "commandID", "command_id"],
    );
    let component = first_string(
        &event.properties,
        &[
            "component",
            "routineID",
            "routine_id",
            "workflowID",
            "workflow_id",
            "task",
            "title",
        ],
    );
    let mut excerpt = collect_bug_monitor_excerpt(state, &event.properties).await;
    if excerpt.is_empty() {
        if let Some(reason) = reason.as_ref() {
            excerpt.push(reason.clone());
        }
    }
    let serialized = serde_json::to_string(&event.properties).unwrap_or_default();
    let fingerprint = sha256_hex(&[
        repo.as_str(),
        workspace_root.as_str(),
        event.event_type.as_str(),
        reason.as_deref().unwrap_or(""),
        run_id.as_deref().unwrap_or(""),
        session_id.as_deref().unwrap_or(""),
        correlation_id.as_deref().unwrap_or(""),
        component.as_deref().unwrap_or(""),
        serialized.as_str(),
    ]);
    let title = if let Some(component) = component.as_ref() {
        format!("{} failure in {}", event.event_type, component)
    } else {
        format!("{} detected", event.event_type)
    };
    let mut detail_lines = vec![
        format!("event_type: {}", event.event_type),
        format!("workspace_root: {}", workspace_root),
    ];
    if let Some(reason) = reason.as_ref() {
        detail_lines.push(format!("reason: {reason}"));
    }
    if let Some(run_id) = run_id.as_ref() {
        detail_lines.push(format!("run_id: {run_id}"));
    }
    if let Some(session_id) = session_id.as_ref() {
        detail_lines.push(format!("session_id: {session_id}"));
    }
    if let Some(correlation_id) = correlation_id.as_ref() {
        detail_lines.push(format!("correlation_id: {correlation_id}"));
    }
    if let Some(component) = component.as_ref() {
        detail_lines.push(format!("component: {component}"));
    }
    if !serialized.trim().is_empty() {
        detail_lines.push(String::new());
        detail_lines.push("payload:".to_string());
        detail_lines.push(truncate_text(&serialized, 2_000));
    }

    Ok(BugMonitorSubmission {
        repo: Some(repo),
        title: Some(title),
        detail: Some(detail_lines.join("\n")),
        source: Some("tandem_events".to_string()),
        run_id,
        session_id,
        correlation_id,
        file_name: None,
        process: Some("tandem-engine".to_string()),
        component,
        event: Some(event.event_type.clone()),
        level: Some("error".to_string()),
        excerpt,
        fingerprint: Some(fingerprint),
    })
}
