use std::sync::Mutex;

use serde_json::Value;
use tokio::sync::{broadcast, mpsc};

use tandem_types::EngineEvent;

#[derive(Clone)]
pub struct EventBus {
    tx: broadcast::Sender<EngineEvent>,
    session_part_tx: mpsc::UnboundedSender<EngineEvent>,
    session_part_rx: std::sync::Arc<Mutex<Option<mpsc::UnboundedReceiver<EngineEvent>>>>,
}

impl EventBus {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(2048);
        let (session_part_tx, session_part_rx) = mpsc::unbounded_channel();
        Self {
            tx,
            session_part_tx,
            session_part_rx: std::sync::Arc::new(Mutex::new(Some(session_part_rx))),
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<EngineEvent> {
        self.tx.subscribe()
    }

    pub fn take_session_part_receiver(&self) -> Option<mpsc::UnboundedReceiver<EngineEvent>> {
        self.session_part_rx.lock().ok()?.take()
    }

    pub fn publish(&self, event: EngineEvent) {
        if should_enqueue_session_part_event(&event) {
            let _ = self.session_part_tx.send(event.clone());
        }
        let _ = self.tx.send(event);
    }
}

fn should_enqueue_session_part_event(event: &EngineEvent) -> bool {
    if event.event_type != "message.part.updated" {
        return false;
    }
    let Some(part) = event.properties.get("part").and_then(Value::as_object) else {
        return false;
    };
    let part_type = part
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    let is_tool_part = matches!(
        part_type.as_str(),
        "tool" | "tool-invocation" | "tool-result" | "tool_invocation" | "tool_result"
    );
    if !is_tool_part {
        return false;
    }

    let part_state = part
        .get("state")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    let has_result = part.get("result").is_some_and(|value| !value.is_null());
    let has_error = part
        .get("error")
        .and_then(Value::as_str)
        .is_some_and(|value| !value.trim().is_empty());

    // Streaming write and tool-call deltas can be extremely noisy.
    // Keep only actionable updates for persistence.
    !(part_state == "running" && !has_result && !has_error)
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn filters_running_tool_delta_events_for_session_part_queue() {
        let event = EngineEvent::new(
            "message.part.updated",
            json!({
                "part": {
                    "type": "tool",
                    "state": "running",
                    "tool": "write",
                    "args": {"path":"out.md","content":"hello"}
                }
            }),
        );
        assert!(!should_enqueue_session_part_event(&event));
    }

    #[test]
    fn keeps_completed_tool_events_for_session_part_queue() {
        let event = EngineEvent::new(
            "message.part.updated",
            json!({
                "part": {
                    "type": "tool",
                    "state": "completed",
                    "tool": "write",
                    "args": {"path":"out.md","content":"hello"},
                    "result": {"ok": true}
                }
            }),
        );
        assert!(should_enqueue_session_part_event(&event));
    }

    #[test]
    fn supports_snake_case_tool_part_types_for_session_queue() {
        let event = EngineEvent::new(
            "message.part.updated",
            json!({
                "part": {
                    "type": "tool_invocation",
                    "state": "completed",
                    "tool": "websearch",
                    "result": {"results":[{"url":"https://example.com"}]}
                }
            }),
        );
        assert!(should_enqueue_session_part_event(&event));
    }
}
