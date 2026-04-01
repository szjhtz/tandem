use std::collections::BTreeMap;

use super::*;
use tandem_core::ToolEffectLedgerRecord;

#[derive(Debug, Clone, serde::Serialize)]
struct ContextRunLedgerEventView {
    seq: u64,
    ts_ms: u64,
    event_id: String,
    record: ToolEffectLedgerRecord,
}

pub(super) async fn context_run_ledger(
    State(state): State<AppState>,
    Path(run_id): Path<String>,
    Query(query): Query<super::RunEventsQuery>,
) -> Result<Json<Value>, StatusCode> {
    let events =
        load_context_run_ledger_source_events(&state, &run_id, query.since_seq, query.tail);
    let records = context_run_ledger_records(&events);
    Ok(Json(json!({
        "records": records,
        "summary": context_run_ledger_summary(&records),
    })))
}

pub(super) fn context_run_ledger_summary_for_run(state: &AppState, run_id: &str) -> Value {
    let events = load_context_run_ledger_source_events(state, run_id, None, None);
    let records = context_run_ledger_records(&events);
    context_run_ledger_summary(&records)
}

fn load_context_run_ledger_source_events(
    state: &AppState,
    run_id: &str,
    since_seq: Option<u64>,
    tail: Option<usize>,
) -> Vec<ContextRunEventRecord> {
    super::context_runs::load_context_run_events_jsonl(
        &super::context_runs::context_run_events_path(state, run_id),
        since_seq,
        tail,
    )
}

fn context_run_ledger_records(events: &[ContextRunEventRecord]) -> Vec<ContextRunLedgerEventView> {
    events
        .iter()
        .filter_map(|event| {
            if event.event_type != "tool_effect_recorded" {
                return None;
            }
            let record =
                event.payload.get("record").cloned().and_then(|value| {
                    serde_json::from_value::<ToolEffectLedgerRecord>(value).ok()
                })?;
            Some(ContextRunLedgerEventView {
                seq: event.seq,
                ts_ms: event.ts_ms,
                event_id: event.event_id.clone(),
                record,
            })
        })
        .collect()
}

fn context_run_ledger_summary(records: &[ContextRunLedgerEventView]) -> Value {
    let mut by_status = BTreeMap::<String, u64>::new();
    let mut by_phase = BTreeMap::<String, u64>::new();
    let mut by_tool = BTreeMap::<String, u64>::new();

    for row in records {
        *by_status
            .entry(serde_json::to_string(&row.record.status).unwrap_or_default())
            .or_default() += 1;
        *by_phase
            .entry(serde_json::to_string(&row.record.phase).unwrap_or_default())
            .or_default() += 1;
        *by_tool.entry(row.record.tool.clone()).or_default() += 1;
    }

    let last_seq = records.last().map(|record| record.seq);
    let last_ts_ms = records.last().map(|record| record.ts_ms);

    json!({
        "record_count": records.len(),
        "by_status": normalize_serialized_enum_counts(by_status),
        "by_phase": normalize_serialized_enum_counts(by_phase),
        "by_tool": by_tool,
        "last_seq": last_seq,
        "last_ts_ms": last_ts_ms,
    })
}

fn normalize_serialized_enum_counts(counts: BTreeMap<String, u64>) -> BTreeMap<String, u64> {
    counts
        .into_iter()
        .map(|(key, value)| (key.trim_matches('"').to_string(), value))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tool_effect_event(seq: u64, tool: &str, phase: &str, status: &str) -> ContextRunEventRecord {
        ContextRunEventRecord {
            event_id: format!("event-{seq}"),
            run_id: "run-1".to_string(),
            seq,
            ts_ms: seq * 10,
            event_type: "tool_effect_recorded".to_string(),
            status: ContextRunStatus::Running,
            revision: seq,
            step_id: Some("session-run".to_string()),
            task_id: None,
            command_id: None,
            payload: json!({
                "record": {
                    "session_id": "session-1",
                    "message_id": "message-1",
                    "tool": tool,
                    "phase": phase,
                    "status": status,
                    "args_summary": {"keys":["path"],"field_count":1,"type":"object"},
                }
            }),
        }
    }

    #[test]
    fn context_run_ledger_filters_and_summarizes_records() {
        let records = context_run_ledger_records(&[
            tool_effect_event(1, "read", "invocation", "started"),
            ContextRunEventRecord {
                event_id: "event-2".to_string(),
                run_id: "run-1".to_string(),
                seq: 2,
                ts_ms: 20,
                event_type: "planning_started".to_string(),
                status: ContextRunStatus::Running,
                revision: 2,
                step_id: None,
                task_id: None,
                command_id: None,
                payload: json!({}),
            },
            tool_effect_event(3, "write", "outcome", "succeeded"),
        ]);

        assert_eq!(records.len(), 2);
        assert_eq!(records[0].record.tool, "read");
        assert_eq!(records[1].record.tool, "write");

        let summary = context_run_ledger_summary(&records);
        assert_eq!(summary["record_count"].as_u64(), Some(2));
        assert_eq!(summary["by_tool"]["read"].as_u64(), Some(1));
        assert_eq!(summary["by_tool"]["write"].as_u64(), Some(1));
        assert_eq!(summary["by_status"]["started"].as_u64(), Some(1));
        assert_eq!(summary["by_status"]["succeeded"].as_u64(), Some(1));
        assert_eq!(summary["last_seq"].as_u64(), Some(3));
    }
}
