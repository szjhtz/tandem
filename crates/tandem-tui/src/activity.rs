use crate::app::{
    AgentPane, AgentStatus, ChatMessage, ContentBlock, MessageRole, PendingRequest,
    PendingRequestKind,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActivityTone {
    Neutral,
    Active,
    Waiting,
    Success,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActivitySummary {
    pub headline: String,
    pub detail: String,
    pub tone: ActivityTone,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ExplorationBatch {
    reads: usize,
    searches: usize,
    lists: usize,
    previews: Vec<String>,
    primary_target_key: Option<String>,
}

pub fn summarize_active_agent(
    agent: &AgentPane,
    pending_requests: &[PendingRequest],
    waiting_for_clarification: bool,
    awaiting_plan_approval: bool,
) -> ActivitySummary {
    let active_request_count = pending_requests
        .iter()
        .filter(|request| {
            request.session_id == agent.session_id && request.agent_id == agent.agent_id
        })
        .count();
    let has_question_request = pending_requests.iter().any(|request| {
        request.session_id == agent.session_id
            && request.agent_id == agent.agent_id
            && matches!(request.kind, PendingRequestKind::Question(_))
    });
    build_agent_activity_summary(
        agent,
        active_request_count,
        has_question_request || waiting_for_clarification,
        awaiting_plan_approval,
    )
}

pub fn agent_status_label(agent: &AgentPane, spinner: &str) -> String {
    let summary = build_agent_activity_summary(agent, 0, false, false);
    match summary.tone {
        ActivityTone::Active => format!("{} {}", spinner, summary.headline),
        _ => summary.headline,
    }
}

pub fn exploration_completion_message(agent: &AgentPane) -> Option<ChatMessage> {
    let counts = ToolActivityCounts::from_agent(agent);
    if counts.exploration_count() == 0 {
        return None;
    }
    if counts.non_exploration_count() > 0 {
        return None;
    }

    let previews = agent
        .live_tool_calls
        .values()
        .find_map(|call| {
            let preview = call.args_preview.trim();
            if preview.is_empty() {
                None
            } else {
                Some(preview.to_string())
            }
        })
        .into_iter()
        .collect::<Vec<_>>();

    Some(exploration_summary_message(
        counts.reads,
        counts.searches,
        counts.lists,
        &previews,
    ))
}

pub fn record_tool_call(
    batch: &mut Option<ExplorationBatch>,
    tool_name: &str,
    args_preview: &str,
) -> Option<ChatMessage> {
    match tool_category(tool_name) {
        ToolCategory::ExplorationRead => {
            let summary = flush_on_target_change(batch, args_preview);
            let batch = batch.get_or_insert_with(ExplorationBatch::default);
            batch.reads += 1;
            batch.note_preview(args_preview);
            summary
        }
        ToolCategory::ExplorationSearch => {
            let summary = flush_on_target_change(batch, args_preview);
            let batch = batch.get_or_insert_with(ExplorationBatch::default);
            batch.searches += 1;
            batch.note_preview(args_preview);
            summary
        }
        ToolCategory::ExplorationList => {
            let summary = flush_on_target_change(batch, args_preview);
            let batch = batch.get_or_insert_with(ExplorationBatch::default);
            batch.lists += 1;
            batch.note_preview(args_preview);
            summary
        }
        ToolCategory::Other => take_exploration_completion_message(batch),
    }
}

pub fn take_exploration_completion_message(
    batch: &mut Option<ExplorationBatch>,
) -> Option<ChatMessage> {
    let batch = batch.take()?;
    if batch.total() == 0 {
        return None;
    }

    Some(exploration_summary_message(
        batch.reads,
        batch.searches,
        batch.lists,
        &batch.previews,
    ))
}

fn build_agent_activity_summary(
    agent: &AgentPane,
    active_request_count: usize,
    waiting_for_clarification: bool,
    awaiting_plan_approval: bool,
) -> ActivitySummary {
    if active_request_count > 0 {
        let detail = if waiting_for_clarification {
            "Clarification answer required to continue".to_string()
        } else if active_request_count == 1 {
            "1 approval or question is waiting in the request center".to_string()
        } else {
            format!(
                "{} approvals or questions are waiting in the request center",
                active_request_count
            )
        };
        return ActivitySummary {
            headline: "Waiting for approval".to_string(),
            detail,
            tone: ActivityTone::Waiting,
        };
    }
    if awaiting_plan_approval {
        return ActivitySummary {
            headline: "Waiting on plan approval".to_string(),
            detail: "Review the current plan feedback request to continue".to_string(),
            tone: ActivityTone::Waiting,
        };
    }

    if !agent.live_tool_calls.is_empty() {
        return tool_activity_summary(agent);
    }

    if matches!(agent.status, AgentStatus::Running | AgentStatus::Streaming) {
        let detail = agent
            .live_activity_message
            .clone()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| {
                if let Some(run_id) = agent.active_run_id.as_deref() {
                    format!("Active run {}", run_id)
                } else if let Some(context_run_id) = agent.bound_context_run_id.as_deref() {
                    format!("Linked context {}", context_run_id)
                } else {
                    "Streaming response and preparing next action".to_string()
                }
            });
        return ActivitySummary {
            headline: "Thinking".to_string(),
            detail,
            tone: ActivityTone::Active,
        };
    }

    match agent.status {
        AgentStatus::Done => ActivitySummary {
            headline: "Ready".to_string(),
            detail: agent
                .bound_context_run_id
                .as_ref()
                .map(|context_run_id| {
                    format!(
                        "Linked context {} • try /context_run_rollback_preview {}",
                        context_run_id, context_run_id
                    )
                })
                .unwrap_or_else(|| "Last response completed".to_string()),
            tone: ActivityTone::Success,
        },
        AgentStatus::Error => ActivitySummary {
            headline: "Errored".to_string(),
            detail: "The last action failed; inspect recent transcript output".to_string(),
            tone: ActivityTone::Error,
        },
        AgentStatus::Cancelling => ActivitySummary {
            headline: "Cancelling".to_string(),
            detail: "Waiting for the current run to stop".to_string(),
            tone: ActivityTone::Waiting,
        },
        AgentStatus::Closed => ActivitySummary {
            headline: "Closed".to_string(),
            detail: "This agent pane is no longer active".to_string(),
            tone: ActivityTone::Neutral,
        },
        AgentStatus::Idle => ActivitySummary {
            headline: "Idle".to_string(),
            detail: agent
                .bound_context_run_id
                .as_ref()
                .map(|context_run_id| {
                    format!(
                        "Linked context {} • /context_run_get {}",
                        context_run_id, context_run_id
                    )
                })
                .unwrap_or_else(|| "Type a prompt or use /help to start a task".to_string()),
            tone: ActivityTone::Neutral,
        },
        AgentStatus::Running | AgentStatus::Streaming => unreachable!(),
    }
}

fn tool_activity_summary(agent: &AgentPane) -> ActivitySummary {
    let counts = ToolActivityCounts::from_agent(agent);
    let detail = counts.detail();

    let headline = if counts.edits > 0
        && counts.reads + counts.searches + counts.lists == 0
        && counts.commands == 0
    {
        "Applying edits"
    } else if counts.commands > 0
        && counts.edits == 0
        && counts.reads + counts.searches + counts.lists == 0
    {
        "Running command"
    } else if counts.planning > 0
        && counts.reads + counts.searches + counts.lists + counts.edits + counts.commands == 0
    {
        "Updating plan"
    } else if counts.reads + counts.searches + counts.lists > 0
        && counts.edits == 0
        && counts.commands == 0
    {
        "Exploring"
    } else if counts.questions > 0
        && counts.reads
            + counts.searches
            + counts.lists
            + counts.edits
            + counts.commands
            + counts.planning
            == 0
    {
        "Preparing question"
    } else {
        "Working"
    };

    let preview = agent
        .live_activity_message
        .clone()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            agent.live_tool_calls.values().find_map(|call| {
                let preview = call.args_preview.trim();
                if preview.is_empty() {
                    None
                } else {
                    Some(preview.to_string())
                }
            })
        });

    ActivitySummary {
        headline: headline.to_string(),
        detail: match preview {
            Some(preview) if !detail.is_empty() => format!("{} • {}", detail, preview),
            Some(preview) => preview,
            None if !detail.is_empty() => detail,
            None => "Active tool call in progress".to_string(),
        },
        tone: ActivityTone::Active,
    }
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
struct ToolActivityCounts {
    reads: usize,
    searches: usize,
    lists: usize,
    edits: usize,
    commands: usize,
    planning: usize,
    questions: usize,
    diagnostics: usize,
    other: usize,
}

impl ToolActivityCounts {
    fn from_agent(agent: &AgentPane) -> Self {
        let mut counts = Self::default();
        for call in agent.live_tool_calls.values() {
            match canonical_tool_name(&call.tool_name).as_str() {
                "read" => counts.reads += 1,
                "grep" | "searchcodebase" | "search_codebase" | "websearch" | "web_fetch"
                | "webfetch" => counts.searches += 1,
                "glob" | "ls" => counts.lists += 1,
                "apply_patch" | "deletefile" | "delete_file" => counts.edits += 1,
                "runcommand"
                | "run_command"
                | "checkcommandstatus"
                | "check_command_status"
                | "stopcommand"
                | "stop_command"
                | "openpreview"
                | "open_preview" => counts.commands += 1,
                "todowrite" | "todo_write" | "update_todo_list" | "task" | "new_task" => {
                    counts.planning += 1
                }
                "askuserquestion" | "ask_user_question" | "question" => counts.questions += 1,
                "getdiagnostics" | "get_diagnostics" => counts.diagnostics += 1,
                _ => counts.other += 1,
            }
        }
        counts
    }

    fn exploration_count(&self) -> usize {
        self.reads + self.searches + self.lists
    }

    fn non_exploration_count(&self) -> usize {
        self.edits + self.commands + self.planning + self.questions + self.diagnostics + self.other
    }

    fn detail(&self) -> String {
        let mut parts = Vec::new();
        if self.reads > 0 {
            parts.push(format!(
                "{} read{}",
                self.reads,
                if self.reads == 1 { "" } else { "s" }
            ));
        }
        if self.searches > 0 {
            parts.push(format!(
                "{} search{}",
                self.searches,
                if self.searches == 1 { "" } else { "es" }
            ));
        }
        if self.lists > 0 {
            parts.push(format!(
                "{} list{}",
                self.lists,
                if self.lists == 1 { "" } else { "s" }
            ));
        }
        if self.edits > 0 {
            parts.push(format!(
                "{} edit{}",
                self.edits,
                if self.edits == 1 { "" } else { "s" }
            ));
        }
        if self.commands > 0 {
            parts.push(format!(
                "{} command{}",
                self.commands,
                if self.commands == 1 { "" } else { "s" }
            ));
        }
        if self.planning > 0 {
            parts.push(format!(
                "{} plan update{}",
                self.planning,
                if self.planning == 1 { "" } else { "s" }
            ));
        }
        if self.questions > 0 {
            parts.push(format!(
                "{} question{}",
                self.questions,
                if self.questions == 1 { "" } else { "s" }
            ));
        }
        if self.diagnostics > 0 {
            parts.push(format!(
                "{} diagnostic{}",
                self.diagnostics,
                if self.diagnostics == 1 { "" } else { "s" }
            ));
        }
        if self.other > 0 {
            parts.push(format!("{} other", self.other));
        }
        parts.join(" • ")
    }
}

fn canonical_tool_name(tool: &str) -> String {
    let last = tool
        .rsplit('.')
        .next()
        .unwrap_or(tool)
        .trim()
        .to_lowercase();
    last.replace('-', "_")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ToolCategory {
    ExplorationRead,
    ExplorationSearch,
    ExplorationList,
    Other,
}

fn tool_category(tool: &str) -> ToolCategory {
    match canonical_tool_name(tool).as_str() {
        "read" => ToolCategory::ExplorationRead,
        "grep" | "searchcodebase" | "search_codebase" | "websearch" | "web_fetch" | "webfetch" => {
            ToolCategory::ExplorationSearch
        }
        "glob" | "ls" => ToolCategory::ExplorationList,
        _ => ToolCategory::Other,
    }
}

impl ExplorationBatch {
    fn total(&self) -> usize {
        self.reads + self.searches + self.lists
    }

    fn note_preview(&mut self, args_preview: &str) {
        let preview = args_preview.trim();
        if preview.is_empty() {
            return;
        }
        if self.primary_target_key.is_none() {
            self.primary_target_key = exploration_target_key(preview);
        }
        if self.previews.iter().any(|item| item == preview) {
            return;
        }
        if self.previews.len() < 12 {
            self.previews.push(preview.to_string());
        }
    }
}

fn flush_on_target_change(
    batch: &mut Option<ExplorationBatch>,
    args_preview: &str,
) -> Option<ChatMessage> {
    let Some(existing) = batch.as_ref() else {
        return None;
    };
    if existing.total() < 2 {
        return None;
    }
    let Some(existing_key) = existing.primary_target_key.as_deref() else {
        return None;
    };
    let Some(new_key) = exploration_target_key(args_preview) else {
        return None;
    };
    if existing_key == new_key {
        None
    } else {
        take_exploration_completion_message(batch)
    }
}

fn exploration_summary_message(
    reads: usize,
    searches: usize,
    lists: usize,
    previews: &[String],
) -> ChatMessage {
    exploration_summary_message_with_mode(
        reads,
        searches,
        lists,
        previews,
        exploration_verbose_enabled(),
    )
}

fn exploration_summary_message_with_mode(
    reads: usize,
    searches: usize,
    lists: usize,
    previews: &[String],
    verbose: bool,
) -> ChatMessage {
    let headline = exploration_headline(reads, searches, lists);
    let detail = exploration_detail(reads, searches, lists);
    let targets = exploration_targets(previews);
    let verbose_details = exploration_verbose_details(previews, verbose);
    let text = if let Some(targets) = targets {
        if let Some(verbose_details) = verbose_details {
            format!(
                "{}: {} • targets: {} • details: {}",
                headline, detail, targets, verbose_details
            )
        } else {
            format!("{}: {} • targets: {}", headline, detail, targets)
        }
    } else if let Some(verbose_details) = verbose_details {
        format!("{}: {} • details: {}", headline, detail, verbose_details)
    } else {
        format!("{}: {}", headline, detail)
    };
    ChatMessage {
        role: MessageRole::System,
        content: vec![ContentBlock::Text(text)],
    }
}

fn exploration_verbose_enabled() -> bool {
    matches!(
        std::env::var("TANDEM_TUI_VERBOSE_EXPLORATION")
            .ok()
            .as_deref(),
        Some("1" | "true" | "TRUE" | "yes" | "YES" | "on" | "ON")
    )
}

fn exploration_verbose_details(previews: &[String], verbose: bool) -> Option<String> {
    if !verbose {
        return None;
    }
    let details = previews
        .iter()
        .map(|preview| preview.trim())
        .filter(|preview| !preview.is_empty())
        .take(8)
        .collect::<Vec<_>>();
    if details.len() <= 3 {
        None
    } else {
        Some(details.join(" | "))
    }
}

fn exploration_headline(reads: usize, searches: usize, lists: usize) -> &'static str {
    if searches > 0 && reads == 0 && lists == 0 {
        "Searched workspace"
    } else if reads > 0 && searches == 0 && lists == 0 {
        "Read workspace files"
    } else if lists > 0 && reads == 0 && searches == 0 {
        "Listed workspace paths"
    } else {
        "Explored workspace"
    }
}

fn exploration_detail(reads: usize, searches: usize, lists: usize) -> String {
    let mut parts = Vec::new();
    if reads > 0 {
        parts.push(format!(
            "{} read{}",
            reads,
            if reads == 1 { "" } else { "s" }
        ));
    }
    if searches > 0 {
        parts.push(format!(
            "{} search{}",
            searches,
            if searches == 1 { "" } else { "es" }
        ));
    }
    if lists > 0 {
        parts.push(format!(
            "{} list{}",
            lists,
            if lists == 1 { "" } else { "s" }
        ));
    }
    parts.join(" • ")
}

fn exploration_targets(previews: &[String]) -> Option<String> {
    let compact = previews
        .iter()
        .map(|preview| preview.trim())
        .filter(|preview| !preview.is_empty())
        .take(3)
        .collect::<Vec<_>>();
    if compact.is_empty() {
        None
    } else {
        Some(compact.join(" | "))
    }
}

fn exploration_target_key(preview: &str) -> Option<String> {
    let preview = preview.trim();
    if preview.is_empty() {
        return None;
    }
    let normalized = preview.replace('\\', "/");
    if normalized.contains('/') {
        let trimmed = normalized.trim_matches('"').trim_matches('\'');
        if let Some(anchor) = trimmed.find("/workspace/") {
            let suffix = &trimmed[anchor + "/workspace/".len()..];
            let key = suffix.split('/').next().unwrap_or(suffix).trim();
            if !key.is_empty() {
                return Some(key.to_lowercase());
            }
        }
        let key = trimmed
            .trim_start_matches("./")
            .trim_start_matches('/')
            .split('/')
            .next()
            .unwrap_or(trimmed)
            .trim();
        if !key.is_empty() {
            return Some(key.to_lowercase());
        }
    }

    let compact = preview
        .split_whitespace()
        .take(3)
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase();
    if compact.is_empty() {
        None
    } else {
        Some(compact)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app::{
        AgentStatus, LiveToolCall, PendingPermissionRequest, PendingRequest, PendingRequestKind,
    };
    use crate::ui::components::composer_input::ComposerInputState;
    use std::collections::{HashMap, VecDeque};

    fn message_text(message: ChatMessage) -> String {
        match message.content.into_iter().next() {
            Some(ContentBlock::Text(text)) => text,
            _ => panic!("expected text block"),
        }
    }

    fn test_agent(live_tool_calls: HashMap<String, LiveToolCall>) -> AgentPane {
        AgentPane {
            agent_id: "A1".to_string(),
            session_id: "s1".to_string(),
            draft: ComposerInputState::new(),
            stream_collector: None,
            messages: Vec::new(),
            scroll_from_bottom: 0,
            tasks: Vec::new(),
            active_task_id: None,
            status: AgentStatus::Streaming,
            active_run_id: Some("run-1".to_string()),
            bound_context_run_id: None,
            follow_up_queue: VecDeque::new(),
            steering_message: None,
            paste_registry: HashMap::new(),
            next_paste_id: 1,
            live_tool_calls,
            exploration_batch: None,
            live_activity_message: None,
            delegated_worker: false,
            delegated_team_name: None,
        }
    }

    fn summary_text(summary: ActivitySummary) -> String {
        format!("{} | {}", summary.headline, summary.detail)
    }

    #[test]
    fn exploration_completion_message_summarizes_exploration_only() {
        let mut live_tool_calls = HashMap::new();
        live_tool_calls.insert(
            "read-1".to_string(),
            LiveToolCall {
                tool_name: "Read".to_string(),
                args_preview: "/workspace/src/main.rs".to_string(),
            },
        );
        live_tool_calls.insert(
            "search-1".to_string(),
            LiveToolCall {
                tool_name: "SearchCodebase".to_string(),
                args_preview: "rollback preview".to_string(),
            },
        );
        let text = message_text(
            exploration_completion_message(&test_agent(live_tool_calls))
                .expect("exploration summary"),
        );
        assert!(text.contains("Explored workspace"));
        assert!(text.contains("read"));
        assert!(text.contains("search"));
        assert!(text.contains("targets:"));
    }

    #[test]
    fn exploration_completion_message_skips_mixed_edit_activity() {
        let mut live_tool_calls = HashMap::new();
        live_tool_calls.insert(
            "read-1".to_string(),
            LiveToolCall {
                tool_name: "Read".to_string(),
                args_preview: "/workspace/src/main.rs".to_string(),
            },
        );
        live_tool_calls.insert(
            "patch-1".to_string(),
            LiveToolCall {
                tool_name: "apply_patch".to_string(),
                args_preview: "update app.rs".to_string(),
            },
        );
        assert!(exploration_completion_message(&test_agent(live_tool_calls)).is_none());
    }

    #[test]
    fn record_tool_call_builds_exploration_batch_and_completion_message() {
        let mut batch = None;
        record_tool_call(&mut batch, "Read", "/workspace/src/main.rs");
        record_tool_call(&mut batch, "SearchCodebase", "rollback preview");
        let message =
            take_exploration_completion_message(&mut batch).expect("batch completion message");
        assert!(batch.is_none());
        let text = message_text(message);
        assert!(text.contains("Explored workspace"));
        assert!(text.contains("read"));
        assert!(text.contains("search"));
        assert!(text.contains("/workspace/src/main.rs"));
    }

    #[test]
    fn record_tool_call_uses_specific_search_headline_when_only_searching() {
        let mut batch = None;
        record_tool_call(&mut batch, "SearchCodebase", "rollback preview");
        record_tool_call(&mut batch, "grep", "context run");
        let text = message_text(
            take_exploration_completion_message(&mut batch).expect("search completion message"),
        );
        assert!(text.starts_with("Searched workspace:"));
        assert!(text.contains("targets: rollback preview | context run"));
    }

    #[test]
    fn record_tool_call_suppresses_mixed_exploration_batch() {
        let mut batch = None;
        assert!(record_tool_call(&mut batch, "Read", "/workspace/src/main.rs").is_none());
        let text = message_text(
            record_tool_call(&mut batch, "apply_patch", "update app.rs").expect("boundary flush"),
        );
        assert!(text.contains("Read workspace files"));
        assert!(take_exploration_completion_message(&mut batch).is_none());
        assert!(batch.is_none());
    }

    #[test]
    fn record_tool_call_flushes_when_exploration_target_changes() {
        let mut batch = None;
        assert!(record_tool_call(&mut batch, "Read", "/workspace/src/main.rs").is_none());
        assert!(record_tool_call(&mut batch, "Read", "/workspace/src/lib.rs").is_none());
        let text = message_text(
            record_tool_call(&mut batch, "Read", "/workspace/docs/plan.md")
                .expect("target-change flush"),
        );
        assert!(text.starts_with("Read workspace files:"));
        assert!(text.contains("targets: /workspace/src/main.rs | /workspace/src/lib.rs"));

        let final_text = message_text(
            take_exploration_completion_message(&mut batch).expect("remaining batch message"),
        );
        assert!(final_text.contains("/workspace/docs/plan.md"));
    }

    #[test]
    fn exploration_summary_matches_snapshot() {
        let mut batch = None;
        record_tool_call(&mut batch, "Read", "/workspace/src/main.rs");
        record_tool_call(&mut batch, "SearchCodebase", "rollback preview");
        let rendered = message_text(
            take_exploration_completion_message(&mut batch).expect("exploration snapshot"),
        );
        let expected =
            "Explored workspace: 1 read • 1 search • targets: /workspace/src/main.rs | rollback preview";
        assert_eq!(rendered, expected);
    }

    #[test]
    fn target_change_exploration_summary_matches_snapshot() {
        let mut batch = None;
        record_tool_call(&mut batch, "Read", "/workspace/src/main.rs");
        record_tool_call(&mut batch, "Read", "/workspace/src/lib.rs");
        let rendered = message_text(
            record_tool_call(&mut batch, "Read", "/workspace/docs/plan.md")
                .expect("target-change snapshot"),
        );
        let expected =
            "Read workspace files: 2 reads • targets: /workspace/src/main.rs | /workspace/src/lib.rs";
        assert_eq!(rendered, expected);
    }

    #[test]
    fn verbose_exploration_summary_matches_snapshot() {
        let previews = vec![
            "/workspace/src/main.rs".to_string(),
            "/workspace/src/lib.rs".to_string(),
            "/workspace/docs/plan.md".to_string(),
            "rollback preview".to_string(),
        ];
        let rendered = message_text(exploration_summary_message_with_mode(
            2, 1, 1, &previews, true,
        ));
        let expected = "Explored workspace: 2 reads • 1 search • 1 list • targets: /workspace/src/main.rs | /workspace/src/lib.rs | /workspace/docs/plan.md • details: /workspace/src/main.rs | /workspace/src/lib.rs | /workspace/docs/plan.md | rollback preview";
        assert_eq!(rendered, expected);
    }

    #[test]
    fn live_activity_summary_matches_waiting_snapshot() {
        let agent = test_agent(HashMap::new());
        let pending_requests = vec![PendingRequest {
            session_id: "s1".to_string(),
            agent_id: "A1".to_string(),
            kind: PendingRequestKind::Permission(PendingPermissionRequest {
                id: "perm-1".to_string(),
                tool: "apply_patch".to_string(),
                args: None,
                args_source: None,
                args_integrity: None,
                query: None,
                status: None,
            }),
        }];
        let rendered = summary_text(summarize_active_agent(
            &agent,
            &pending_requests,
            false,
            false,
        ));
        let expected =
            "Waiting for approval | 1 approval or question is waiting in the request center";
        assert_eq!(rendered, expected);
    }

    #[test]
    fn agent_status_label_matches_active_snapshot() {
        let mut agent = test_agent(HashMap::new());
        agent.status = AgentStatus::Streaming;
        agent.live_activity_message = Some("Reviewing patch output".to_string());
        let rendered = agent_status_label(&agent, "⠋");
        assert_eq!(rendered, "⠋ Thinking");
    }
}
