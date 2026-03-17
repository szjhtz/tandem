use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RoutineStoreError {
    InvalidRoutineId { routine_id: String },
    InvalidSchedule { detail: String },
    PersistFailed { message: String },
}
