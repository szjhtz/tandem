use std::sync::Mutex;

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
        if event.event_type == "message.part.updated" {
            let _ = self.session_part_tx.send(event.clone());
        }
        let _ = self.tx.send(event);
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new()
    }
}
