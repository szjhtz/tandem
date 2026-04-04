use super::{AgentPane, App};
use std::collections::HashSet;

impl App {
    fn make_paste_marker(id: u32, payload: &str) -> String {
        format!("[Pasted {} chars #{}]", payload.chars().count(), id)
    }

    pub(super) fn register_collapsed_paste(agent: &mut AgentPane, payload: &str) -> String {
        let id = agent.next_paste_id;
        agent.next_paste_id = agent.next_paste_id.saturating_add(1);
        agent.paste_registry.insert(id, payload.to_string());
        Self::make_paste_marker(id, payload)
    }

    pub(super) fn should_collapse_paste(payload: &str) -> bool {
        payload.lines().count() > 2
    }

    pub(super) fn insert_chat_paste(agent: Option<&mut AgentPane>, payload: &str) -> String {
        if !Self::should_collapse_paste(payload) {
            return payload.to_string();
        }
        if let Some(agent) = agent {
            return Self::register_collapsed_paste(agent, payload);
        }
        format!("[Pasted {} chars]", payload.chars().count())
    }

    pub(super) fn normalize_paste_payload(payload: &str) -> String {
        payload.replace("\r\n", "\n").replace('\r', "\n")
    }

    fn parse_marker_id(marker: &str) -> Option<u32> {
        let trimmed = marker.trim();
        if !trimmed.starts_with("[Pasted ") || !trimmed.ends_with(']') {
            return None;
        }
        let hash = trimmed.rfind('#')?;
        let id_str = &trimmed[hash + 1..trimmed.len() - 1];
        id_str.parse::<u32>().ok()
    }

    fn find_paste_token_ranges(text: &str) -> Vec<(usize, usize)> {
        let mut ranges = Vec::new();
        let mut i = 0usize;
        while i < text.len() {
            let rest = &text[i..];
            if rest.starts_with("[Pasted ") {
                if let Some(end_rel) = rest.find(']') {
                    let end = i + end_rel + 1;
                    let token = &text[i..end];
                    if token.contains(" chars") {
                        ranges.push((i, end));
                        i = end;
                        continue;
                    }
                }
            }
            if let Some(ch) = rest.chars().next() {
                i += ch.len_utf8();
            } else {
                break;
            }
        }
        ranges
    }

    fn prev_char_boundary(text: &str, pos: usize) -> usize {
        if pos == 0 {
            return 0;
        }
        let mut i = pos.saturating_sub(1);
        while i > 0 && !text.is_char_boundary(i) {
            i = i.saturating_sub(1);
        }
        i
    }

    pub(super) fn paste_token_range_for_backspace(
        input: &crate::ui::components::composer_input::ComposerInputState,
    ) -> Option<(usize, usize)> {
        let text = input.text();
        let cursor = input.cursor_byte_index().min(text.len());
        if cursor == 0 {
            return None;
        }
        let target = Self::prev_char_boundary(text, cursor);
        Self::find_paste_token_ranges(text)
            .into_iter()
            .find(|(start, end)| target >= *start && target < *end)
    }

    pub(super) fn paste_token_range_for_delete(
        input: &crate::ui::components::composer_input::ComposerInputState,
    ) -> Option<(usize, usize)> {
        let text = input.text();
        let cursor = input.cursor_byte_index().min(text.len());
        if cursor >= text.len() {
            return None;
        }
        Self::find_paste_token_ranges(text)
            .into_iter()
            .find(|(start, end)| cursor >= *start && cursor < *end)
    }

    fn collect_referenced_paste_ids(text: &str) -> HashSet<u32> {
        let mut ids = HashSet::new();
        let mut i = 0usize;
        while i < text.len() {
            let rest = &text[i..];
            if rest.starts_with("[Pasted ") {
                if let Some(end_rel) = rest.find(']') {
                    let end = i + end_rel + 1;
                    if let Some(id) = Self::parse_marker_id(&text[i..end]) {
                        ids.insert(id);
                    }
                    i = end;
                    continue;
                }
            }
            if let Some(ch) = rest.chars().next() {
                i += ch.len_utf8();
            } else {
                break;
            }
        }
        ids
    }

    pub(super) fn prune_agent_paste_registry(agent: &mut AgentPane) {
        let referenced = Self::collect_referenced_paste_ids(agent.draft.text());
        agent.paste_registry.retain(|id, _| referenced.contains(id));
    }

    pub(super) fn expand_paste_markers(text: &str, agent: &AgentPane) -> String {
        let mut out = String::with_capacity(text.len());
        let mut i = 0usize;
        while i < text.len() {
            if text[i..].starts_with("[Pasted ") {
                if let Some(end_rel) = text[i..].find(']') {
                    let end = i + end_rel + 1;
                    let marker = &text[i..end];
                    if let Some(id) = Self::parse_marker_id(marker) {
                        if let Some(payload) = agent.paste_registry.get(&id) {
                            out.push_str(payload);
                            i = end;
                            continue;
                        }
                    }
                }
            }
            if let Some(ch) = text[i..].chars().next() {
                out.push(ch);
                i += ch.len_utf8();
            } else {
                break;
            }
        }
        out
    }

    fn unresolved_paste_ids(text: &str, agent: &AgentPane) -> Vec<u32> {
        let mut unresolved = Vec::new();
        for id in Self::collect_referenced_paste_ids(text) {
            if !agent.paste_registry.contains_key(&id) {
                unresolved.push(id);
            }
        }
        unresolved.sort_unstable();
        unresolved
    }

    pub(super) fn expand_paste_markers_checked(
        text: &str,
        agent: &AgentPane,
    ) -> Result<String, String> {
        let unresolved = Self::unresolved_paste_ids(text, agent);
        if unresolved.is_empty() {
            Ok(Self::expand_paste_markers(text, agent))
        } else {
            Err(format!(
                "Cannot send: pasted token payload missing for id(s): {}. Re-paste and try again.",
                unresolved
                    .iter()
                    .map(|id| id.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            ))
        }
    }
}
