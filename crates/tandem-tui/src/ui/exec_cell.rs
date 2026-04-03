use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};

pub fn tool_call_lines(tool_name: &str, args_preview: &str) -> Vec<Line<'static>> {
    let mut lines = Vec::new();
    lines.push(Line::from(vec![
        Span::styled(
            " TOOL ",
            Style::default()
                .fg(Color::Black)
                .bg(Color::Magenta)
                .add_modifier(Modifier::BOLD),
        ),
        Span::raw(" "),
        Span::styled(
            tool_name.to_string(),
            Style::default()
                .fg(Color::Magenta)
                .add_modifier(Modifier::BOLD),
        ),
    ]));
    for line in args_preview.lines().take(8) {
        lines.push(Line::from(vec![
            Span::styled("   ", Style::default().fg(Color::DarkGray)),
            Span::styled(line.to_string(), Style::default().fg(Color::Gray)),
        ]));
    }
    if args_preview.lines().count() > 8 {
        lines.push(Line::from("   ..."));
    }
    lines
}

pub fn tool_result_lines(output: &str) -> Vec<Line<'static>> {
    if let Some(summary) = parse_edit_summary(output) {
        return edit_result_lines(&summary);
    }
    if let Some(summary) = parse_rollback_summary(output) {
        return rollback_result_lines(&summary);
    }

    let mut lines = Vec::new();
    let (body_lines, next_lines) = parse_next_block(output);
    let output_lines = body_lines;
    let result_kind = classify_generic_result(&output_lines, &next_lines);
    let (badge, badge_bg, body_color) = match result_kind {
        GenericResultKind::Standard => (" RESULT ", Color::DarkGray, Color::Gray),
        GenericResultKind::OperatorActionRequired => (" ACTION ", Color::Yellow, Color::Yellow),
    };
    lines.push(Line::from(vec![Span::styled(
        badge,
        Style::default()
            .fg(Color::Black)
            .bg(badge_bg)
            .add_modifier(Modifier::BOLD),
    )]));
    if output_lines.len() <= 10 {
        for line in output_lines {
            lines.push(Line::from(vec![
                Span::styled("   ", Style::default().fg(Color::DarkGray)),
                Span::styled(line.to_string(), Style::default().fg(body_color)),
            ]));
        }
    } else {
        for line in output_lines.iter().take(4) {
            lines.push(Line::from(vec![
                Span::styled("   ", Style::default().fg(Color::DarkGray)),
                Span::styled((*line).to_string(), Style::default().fg(body_color)),
            ]));
        }
        lines.push(Line::from(vec![
            Span::styled("   ", Style::default().fg(Color::DarkGray)),
            Span::styled(
                format!(
                    "... {} lines omitted ...",
                    output_lines.len().saturating_sub(8)
                ),
                Style::default().fg(Color::DarkGray),
            ),
        ]));
        for line in output_lines
            .iter()
            .skip(output_lines.len().saturating_sub(4))
        {
            lines.push(Line::from(vec![
                Span::styled("   ", Style::default().fg(Color::DarkGray)),
                Span::styled((*line).to_string(), Style::default().fg(body_color)),
            ]));
        }
    }
    if !next_lines.is_empty() {
        lines.extend(next_block_lines(&next_lines));
    }
    lines
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct EditSummary {
    status: EditStatus,
    action_count: usize,
    file_count: usize,
    added_lines: usize,
    removed_lines: usize,
    actions: Vec<EditAction>,
    files: Vec<String>,
    diff_preview: Vec<DiffPreviewLine>,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct EditAction {
    kind: String,
    path: String,
    added_lines: usize,
    removed_lines: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct DiffPreviewLine {
    kind: DiffPreviewKind,
    text: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DiffPreviewKind {
    Add,
    Remove,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum EditStatus {
    Applied,
    Partial,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct RollbackSummary {
    kind: RollbackKind,
    run_id: String,
    fields: Vec<(String, String)>,
    sections: Vec<RollbackSection>,
    next_lines: Vec<String>,
    action_required: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct RollbackSection {
    title: String,
    lines: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RollbackKind {
    Preview,
    Execute,
    ExecuteAll,
    Receipts,
}

fn parse_edit_summary(output: &str) -> Option<EditSummary> {
    let mut actions = Vec::new();
    let mut files = Vec::new();
    let mut collecting_named_files = false;
    let mut added_lines = 0usize;
    let mut removed_lines = 0usize;
    let mut diff_preview = Vec::new();
    let output_lower = output.to_lowercase();

    for raw_line in output.lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }

        if line == "The following files have been updated:"
            || line == "The following files have been deleted:"
        {
            collecting_named_files = true;
            continue;
        }

        if collecting_named_files {
            if let Some(path) = line.strip_prefix("- ").map(str::trim) {
                if !path.is_empty() {
                    files.push(path.to_string());
                    continue;
                }
            } else {
                collecting_named_files = false;
            }
        }

        if let Some((action, rest)) = line.split_once(' ') {
            if matches!(action, "M" | "A" | "D") {
                let path = rest.split(" +").next().unwrap_or(rest).trim();
                if !path.is_empty() && !path.starts_with("files have been") {
                    let action_added = parse_count_suffix(rest, '+');
                    let action_removed = parse_count_suffix(rest, '-');
                    actions.push(EditAction {
                        kind: action.to_string(),
                        path: path.to_string(),
                        added_lines: action_added,
                        removed_lines: action_removed,
                    });
                    files.push(path.to_string());
                    added_lines += action_added;
                    removed_lines += action_removed;
                }
            }
        }

        if let Some(preview_line) = parse_diff_preview_line(raw_line) {
            diff_preview.push(preview_line);
        }
    }

    files.sort();
    files.dedup();
    actions.sort();
    actions.dedup();

    let looks_like_edit_failure = (output_lower.contains("failed")
        || output_lower.contains("error"))
        && (output_lower.contains("patch")
            || output_lower.contains("apply")
            || output_lower.contains("edit")
            || output_lower.contains("update"));

    if actions.is_empty() && files.is_empty() && !looks_like_edit_failure {
        return None;
    }

    let status = if output_lower.contains("failed") || output_lower.contains("error") {
        if actions.is_empty() && files.is_empty() {
            EditStatus::Failed
        } else {
            EditStatus::Partial
        }
    } else {
        EditStatus::Applied
    };
    Some(EditSummary {
        status,
        action_count: actions.len(),
        file_count: files.len(),
        added_lines,
        removed_lines,
        actions,
        files,
        diff_preview: trim_diff_preview(diff_preview, added_lines + removed_lines),
    })
}

fn edit_result_lines(summary: &EditSummary) -> Vec<Line<'static>> {
    let mut lines = Vec::new();
    let (badge_label, badge_bg, text_color, heading_text) = match summary.status {
        EditStatus::Applied => (" EDITS ", Color::Green, Color::Green, "applied"),
        EditStatus::Partial => (
            " PARTIAL ",
            Color::Yellow,
            Color::Yellow,
            "partially applied",
        ),
        EditStatus::Failed => (" FAILED ", Color::Red, Color::Red, "failed"),
    };
    lines.push(Line::from(vec![
        Span::styled(
            badge_label,
            Style::default()
                .fg(Color::Black)
                .bg(badge_bg)
                .add_modifier(Modifier::BOLD),
        ),
        Span::raw(" "),
        Span::styled(
            format!(
                "{} • {} file{}",
                heading_text,
                summary.file_count,
                if summary.file_count == 1 { "" } else { "s" }
            ),
            Style::default().fg(text_color).add_modifier(Modifier::BOLD),
        ),
    ]));
    if summary.status == EditStatus::Failed {
        lines.push(Line::from(vec![
            Span::styled("   ", Style::default().fg(Color::DarkGray)),
            Span::styled(
                "No files changed",
                Style::default()
                    .fg(Color::Gray)
                    .add_modifier(Modifier::BOLD),
            ),
        ]));
    } else if summary.added_lines > 0 || summary.removed_lines > 0 {
        lines.push(Line::from(vec![
            Span::styled("   ", Style::default().fg(Color::DarkGray)),
            Span::styled(
                format!(
                    "{} action{} • +{} -{}",
                    summary.action_count,
                    if summary.action_count == 1 { "" } else { "s" },
                    summary.added_lines,
                    summary.removed_lines
                ),
                Style::default().fg(Color::Gray),
            ),
        ]));
    }

    for action in summary.actions.iter().take(3) {
        lines.push(Line::from(vec![
            Span::styled("   ", Style::default().fg(Color::DarkGray)),
            Span::styled(action.display(), Style::default().fg(Color::Gray)),
        ]));
    }
    if summary.actions.len() > 3 {
        lines.push(Line::from(vec![
            Span::styled("   ", Style::default().fg(Color::DarkGray)),
            Span::styled(
                format!("+{} more edit actions", summary.actions.len() - 3),
                Style::default().fg(Color::Gray),
            ),
        ]));
    }

    if !summary.files.is_empty() {
        let sample = summary.files.iter().take(3).cloned().collect::<Vec<_>>();
        lines.push(Line::from(vec![
            Span::styled("   ", Style::default().fg(Color::DarkGray)),
            Span::styled(
                format!("files: {}", sample.join(" | ")),
                Style::default().fg(Color::DarkGray),
            ),
        ]));
    }

    for preview in &summary.diff_preview {
        let (prefix_color, text_color, prefix) = match preview.kind {
            DiffPreviewKind::Add => (Color::Green, Color::Green, "+ "),
            DiffPreviewKind::Remove => (Color::Red, Color::Red, "- "),
        };
        lines.push(Line::from(vec![
            Span::styled("   ", Style::default().fg(Color::DarkGray)),
            Span::styled(
                prefix,
                Style::default()
                    .fg(prefix_color)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::styled(preview.text.clone(), Style::default().fg(text_color)),
        ]));
    }

    lines.extend(edit_next_lines(summary));

    lines
}

fn parse_rollback_summary(output: &str) -> Option<RollbackSummary> {
    let (body_lines, next_lines) = parse_next_block(output);
    let mut lines = body_lines
        .into_iter()
        .filter(|line| !line.trim().is_empty());
    let header = lines.next()?.trim();
    let (kind, run_id) = parse_rollback_header(header)?;
    let mut fields = Vec::new();
    let mut sections = Vec::new();
    let mut current_section: Option<RollbackSection> = None;

    for raw_line in lines {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }

        if is_rollback_section_heading(line) {
            if let Some(section) = current_section.take() {
                sections.push(section);
            }
            current_section = Some(RollbackSection {
                title: line.to_string(),
                lines: Vec::new(),
            });
            continue;
        }

        if current_section.is_none() {
            if let Some((key, value)) = line.split_once(':') {
                fields.push((key.trim().to_string(), value.trim().to_string()));
                continue;
            }
        }

        let section = current_section.get_or_insert_with(|| RollbackSection {
            title: "Details".to_string(),
            lines: Vec::new(),
        });
        section.lines.push(line.to_string());
    }

    if let Some(section) = current_section.take() {
        sections.push(section);
    }

    let action_required = rollback_action_required(kind, &fields, &sections, &next_lines);

    Some(RollbackSummary {
        kind,
        run_id,
        fields,
        sections,
        next_lines,
        action_required,
    })
}

fn rollback_result_lines(summary: &RollbackSummary) -> Vec<Line<'static>> {
    let mut lines = Vec::new();
    let (badge_label, badge_bg, text_color) = if summary.action_required {
        (" ACTION ", Color::Yellow, Color::Yellow)
    } else {
        (" ROLLBACK ", Color::Cyan, Color::Cyan)
    };
    lines.push(Line::from(vec![
        Span::styled(
            badge_label,
            Style::default()
                .fg(Color::Black)
                .bg(badge_bg)
                .add_modifier(Modifier::BOLD),
        ),
        Span::raw(" "),
        Span::styled(
            format!("{} • {}", summary.kind.label(), summary.run_id),
            Style::default().fg(text_color).add_modifier(Modifier::BOLD),
        ),
    ]));

    if let Some(headline) = rollback_headline(summary) {
        lines.push(Line::from(vec![
            Span::styled("   ", Style::default().fg(Color::DarkGray)),
            Span::styled(headline, Style::default().fg(Color::Gray)),
        ]));
    }

    for detail in rollback_detail_lines(summary) {
        lines.push(Line::from(vec![
            Span::styled("   ", Style::default().fg(Color::DarkGray)),
            Span::styled(detail, Style::default().fg(Color::Gray)),
        ]));
    }

    if !summary.next_lines.is_empty() {
        lines.extend(next_block_lines(&summary.next_lines));
    }

    lines
}

fn parse_count_suffix(rest: &str, prefix: char) -> usize {
    rest.split_whitespace()
        .find_map(|part| {
            let value = part.strip_prefix(prefix)?;
            value.parse::<usize>().ok()
        })
        .unwrap_or(0)
}

fn parse_rollback_header(line: &str) -> Option<(RollbackKind, String)> {
    [
        ("Rollback preview (", RollbackKind::Preview),
        ("Rollback execute all (", RollbackKind::ExecuteAll),
        ("Rollback execute (", RollbackKind::Execute),
        ("Rollback receipts (", RollbackKind::Receipts),
    ]
    .into_iter()
    .find_map(|(prefix, kind)| {
        let run_id = line.strip_prefix(prefix)?.strip_suffix(')')?.trim();
        if run_id.is_empty() {
            None
        } else {
            Some((kind, run_id.to_string()))
        }
    })
}

fn parse_next_block(output: &str) -> (Vec<&str>, Vec<String>) {
    let lines = output.lines().collect::<Vec<_>>();
    let Some(index) = lines
        .iter()
        .position(|line| matches!(line.trim(), "Next" | "Next:"))
    else {
        return (lines, Vec::new());
    };

    let mut body = lines[..index].to_vec();
    while body.last().is_some_and(|line| line.trim().is_empty()) {
        body.pop();
    }
    let next = lines[index + 1..]
        .iter()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .map(|line| line.to_string())
        .collect::<Vec<_>>();
    (body, next)
}

fn next_block_lines(next_lines: &[String]) -> Vec<Line<'static>> {
    let mut lines = Vec::new();
    lines.push(Line::from(vec![
        Span::styled(
            " NEXT ",
            Style::default()
                .fg(Color::Black)
                .bg(Color::Blue)
                .add_modifier(Modifier::BOLD),
        ),
        Span::raw(" "),
        Span::styled(
            next_lines.first().cloned().unwrap_or_default(),
            Style::default().fg(Color::Blue),
        ),
    ]));
    for line in next_lines.iter().skip(1).take(3) {
        lines.push(Line::from(vec![
            Span::styled("   ", Style::default().fg(Color::DarkGray)),
            Span::styled(line.clone(), Style::default().fg(Color::Blue)),
        ]));
    }
    if next_lines.len() > 4 {
        lines.push(Line::from(vec![
            Span::styled("   ", Style::default().fg(Color::DarkGray)),
            Span::styled(
                format!("+{} more next steps", next_lines.len() - 4),
                Style::default().fg(Color::DarkGray),
            ),
        ]));
    }
    lines
}

fn rollback_field<'a>(summary: &'a RollbackSummary, key: &str) -> Option<&'a str> {
    summary
        .fields
        .iter()
        .find(|(field, _)| field == key)
        .map(|(_, value)| value.as_str())
}

fn rollback_action_required(
    kind: RollbackKind,
    fields: &[(String, String)],
    sections: &[RollbackSection],
    next_lines: &[String],
) -> bool {
    if kind == RollbackKind::Receipts {
        return false;
    }

    let combined = fields
        .iter()
        .flat_map(|(key, value)| [key.as_str(), value.as_str()])
        .chain(sections.iter().flat_map(|section| {
            std::iter::once(section.title.as_str()).chain(section.lines.iter().map(String::as_str))
        }))
        .chain(next_lines.iter().map(String::as_str))
        .collect::<Vec<_>>()
        .join("\n")
        .to_lowercase();

    if [
        "approval required",
        "operator action required",
        "request center",
        "required_ack",
        "--ack",
        "guarded",
    ]
    .iter()
    .any(|needle| combined.contains(needle))
    {
        return true;
    }

    match kind {
        RollbackKind::Preview => fields
            .iter()
            .find(|(key, _)| key == "fully_executable")
            .is_some_and(|(_, value)| value == "false"),
        RollbackKind::Execute | RollbackKind::ExecuteAll => fields.iter().any(|(key, value)| {
            (key == "applied" && value == "false") || (key == "missing" && value != "<none>")
        }),
        RollbackKind::Receipts => false,
    }
}

fn rollback_headline(summary: &RollbackSummary) -> Option<String> {
    match summary.kind {
        RollbackKind::Preview => {
            let step_count = rollback_field(summary, "step_count")?;
            let executable_steps = rollback_field(summary, "executable_steps")?;
            let advisory_steps = rollback_field(summary, "advisory_steps")?;
            Some(format!(
                "{} steps • {} executable • {} advisory",
                step_count, executable_steps, advisory_steps
            ))
        }
        RollbackKind::Execute | RollbackKind::ExecuteAll => {
            let applied = rollback_field(summary, "applied").unwrap_or("false");
            let status = if applied == "true" {
                "applied"
            } else {
                "blocked"
            };
            Some(format!(
                "{} • {} steps • {} operations",
                status,
                rollback_field(summary, "applied_steps").unwrap_or("?"),
                rollback_field(summary, "applied_operations").unwrap_or("?"),
            ))
        }
        RollbackKind::Receipts => Some(format!(
            "{} entries • {} applied • {} blocked",
            rollback_field(summary, "entries").unwrap_or("?"),
            rollback_field(summary, "applied").unwrap_or("?"),
            rollback_field(summary, "blocked").unwrap_or("?"),
        )),
    }
}

fn rollback_detail_lines(summary: &RollbackSummary) -> Vec<String> {
    let mut lines = Vec::new();

    match summary.kind {
        RollbackKind::Preview => {
            if let Some(ready) = rollback_field(summary, "fully_executable") {
                lines.push(format!("ready: {}", ready));
            }
            if let Some(required_ack) =
                rollback_field(summary, "required_ack").filter(|value| *value != "<none>")
            {
                lines.push(format!("ack required: {}", required_ack));
            }
        }
        RollbackKind::Execute | RollbackKind::ExecuteAll => {
            if let Some(selected) =
                rollback_field(summary, "selected").filter(|value| *value != "<none>")
            {
                lines.push(format!("selected: {}", selected));
            }
            if let Some(missing) =
                rollback_field(summary, "missing").filter(|value| *value != "<none>")
            {
                lines.push(format!("missing: {}", missing));
            }
            if let Some(reason) =
                rollback_field(summary, "reason").filter(|value| *value != "<none>")
            {
                lines.push(format!("reason: {}", reason));
            }
        }
        RollbackKind::Receipts => {}
    }

    for section in &summary.sections {
        lines.extend(rollback_section_preview_lines(section));
    }

    lines
}

fn rollback_section_preview_lines(section: &RollbackSection) -> Vec<String> {
    match section.title.as_str() {
        "Executable ids" => {
            let ids = section
                .lines
                .iter()
                .map(|line| line.trim())
                .filter(|line| !line.is_empty())
                .map(|line| line.trim_start_matches("- ").to_string())
                .collect::<Vec<_>>();
            if ids.is_empty() {
                Vec::new()
            } else {
                vec![format!(
                    "ids: {}",
                    summarize_compact_items(&ids, 3, "more ids")
                )]
            }
        }
        "Steps" => preview_bullets(section, "step", 2, "more steps"),
        "Recent receipts" => preview_bullets(section, "receipt", 2, "more receipts"),
        _ => {
            let items = section
                .lines
                .iter()
                .map(|line| line.trim())
                .filter(|line| !line.is_empty())
                .map(ToString::to_string)
                .collect::<Vec<_>>();
            if items.is_empty() {
                Vec::new()
            } else {
                vec![format!(
                    "{}: {}",
                    section.title.to_lowercase(),
                    summarize_compact_items(&items, 2, "more")
                )]
            }
        }
    }
}

fn is_rollback_section_heading(line: &str) -> bool {
    matches!(line, "Executable ids" | "Steps" | "Recent receipts")
}

fn preview_bullets(
    section: &RollbackSection,
    label: &str,
    limit: usize,
    remainder_label: &str,
) -> Vec<String> {
    let items = section
        .lines
        .iter()
        .map(|line| line.trim())
        .filter(|line| line.starts_with("- "))
        .map(|line| line.trim_start_matches("- ").to_string())
        .collect::<Vec<_>>();
    let mut previews = items
        .iter()
        .take(limit)
        .map(|line| format!("{}: {}", label, line))
        .collect::<Vec<_>>();
    if items.len() > limit {
        previews.push(format!("+{} {}", items.len() - limit, remainder_label));
    }
    previews
}

fn summarize_compact_items(items: &[String], limit: usize, remainder_label: &str) -> String {
    let mut shown = items.iter().take(limit).cloned().collect::<Vec<_>>();
    if items.len() > limit {
        shown.push(format!("+{} {}", items.len() - limit, remainder_label));
    }
    shown.join(" | ")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum GenericResultKind {
    Standard,
    OperatorActionRequired,
}

fn classify_generic_result(body_lines: &[&str], next_lines: &[String]) -> GenericResultKind {
    let combined = body_lines
        .iter()
        .map(|line| line.trim())
        .chain(next_lines.iter().map(|line| line.trim()))
        .collect::<Vec<_>>()
        .join("\n")
        .to_lowercase();

    if [
        "approval required",
        "operator action required",
        "request center",
        "required_ack",
        "--ack",
        "guarded",
    ]
    .iter()
    .any(|needle| combined.contains(needle))
    {
        GenericResultKind::OperatorActionRequired
    } else {
        GenericResultKind::Standard
    }
}

fn parse_diff_preview_line(raw_line: &str) -> Option<DiffPreviewLine> {
    if raw_line.starts_with("+++") || raw_line.starts_with("---") || raw_line.starts_with("@@") {
        return None;
    }
    if let Some(text) = raw_line.strip_prefix('+') {
        let text = text.trim();
        if !text.is_empty() {
            return Some(DiffPreviewLine {
                kind: DiffPreviewKind::Add,
                text: text.to_string(),
            });
        }
    }
    if let Some(text) = raw_line.strip_prefix('-') {
        let text = text.trim();
        if !text.is_empty() {
            return Some(DiffPreviewLine {
                kind: DiffPreviewKind::Remove,
                text: text.to_string(),
            });
        }
    }
    None
}

fn trim_diff_preview(
    lines: Vec<DiffPreviewLine>,
    total_changed_lines: usize,
) -> Vec<DiffPreviewLine> {
    if total_changed_lines == 0 || total_changed_lines > 8 {
        return Vec::new();
    }
    lines.into_iter().take(6).collect()
}

impl EditAction {
    fn display(&self) -> String {
        let label = match self.kind.as_str() {
            "M" => "modified",
            "A" => "added",
            "D" => "deleted",
            _ => self.kind.as_str(),
        };
        if self.added_lines > 0 || self.removed_lines > 0 {
            format!(
                "{} {} (+{} -{})",
                label, self.path, self.added_lines, self.removed_lines
            )
        } else {
            format!("{} {}", label, self.path)
        }
    }
}

impl RollbackKind {
    fn label(self) -> &'static str {
        match self {
            RollbackKind::Preview => "preview",
            RollbackKind::Execute => "execute",
            RollbackKind::ExecuteAll => "execute all",
            RollbackKind::Receipts => "receipts",
        }
    }
}

fn edit_next_lines(summary: &EditSummary) -> Vec<Line<'static>> {
    let next_text = match summary.status {
        EditStatus::Applied => Some("review with /diff"),
        EditStatus::Partial => Some("review with /diff and inspect the failed edit output"),
        EditStatus::Failed => Some("inspect the failure output, then retry the edit"),
    };

    let Some(next_text) = next_text else {
        return Vec::new();
    };

    vec![Line::from(vec![
        Span::styled(
            " NEXT ",
            Style::default()
                .fg(Color::Black)
                .bg(Color::Blue)
                .add_modifier(Modifier::BOLD),
        ),
        Span::raw(" "),
        Span::styled(next_text.to_string(), Style::default().fg(Color::Blue)),
    ])]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn render_lines(lines: Vec<Line<'static>>) -> String {
        lines
            .into_iter()
            .map(|line| line.to_string())
            .collect::<Vec<_>>()
            .join("\n")
    }

    #[test]
    fn tool_result_lines_detects_edit_summary_output() {
        let output = "M crates/tandem-tui/src/app.rs +5 -2\nM crates/tandem-tui/src/activity.rs +8 -0\n\nThe following files have been updated:\n  - crates/tandem-tui/src/app.rs\n  - crates/tandem-tui/src/activity.rs";
        let rendered = render_lines(tool_result_lines(output));
        assert!(rendered.contains("EDITS"));
        assert!(rendered.contains("applied • 2 files"));
        assert!(rendered.contains("2 actions • +13 -2"));
        assert!(rendered.contains("modified crates/tandem-tui/src/activity.rs (+8 -0)"));
        assert!(rendered
            .contains("files: crates/tandem-tui/src/activity.rs | crates/tandem-tui/src/app.rs"));
        assert!(rendered.contains("NEXT"));
        assert!(rendered.contains("review with /diff"));
    }

    #[test]
    fn tool_result_lines_marks_partial_edit_output() {
        let output = "M crates/tandem-tui/src/app.rs +5 -2\nFailed to apply patch cleanly";
        let rendered = render_lines(tool_result_lines(output));
        assert!(rendered.contains("PARTIAL"));
        assert!(rendered.contains("partially applied"));
        assert!(rendered.contains("modified crates/tandem-tui/src/app.rs (+5 -2)"));
        assert!(rendered.contains("inspect the failed edit output"));
    }

    #[test]
    fn tool_result_lines_marks_failed_edit_output_without_file_changes() {
        let output = "Failed to apply patch cleanly\nError: patch did not match target";
        let rendered = render_lines(tool_result_lines(output));
        assert!(rendered.contains("FAILED"));
        assert!(rendered.contains("failed • 0 files"));
        assert!(rendered.contains("No files changed"));
        assert!(rendered.contains("retry the edit"));
    }

    #[test]
    fn tool_result_lines_shows_small_diff_preview_for_low_volume_edits() {
        let output = "M crates/tandem-tui/src/app.rs +1 -1\n@@\n-old line\n+new line";
        let rendered = render_lines(tool_result_lines(output));
        assert!(rendered.contains("- old line"));
        assert!(rendered.contains("+ new line"));
    }

    #[test]
    fn tool_result_lines_skips_diff_preview_for_large_edits() {
        let output = "M crates/tandem-tui/src/app.rs +9 -2\n-old line\n+new line";
        let rendered = render_lines(tool_result_lines(output));
        assert!(!rendered.contains("- old line"));
        assert!(!rendered.contains("+ new line"));
    }

    #[test]
    fn tool_result_lines_falls_back_for_plain_output() {
        let output = "plain result line\nanother line";
        let rendered = render_lines(tool_result_lines(output));
        assert!(rendered.contains("RESULT"));
        assert!(rendered.contains("plain result line"));
    }

    #[test]
    fn tool_result_lines_uses_head_tail_truncation_for_long_output() {
        let output = (1..=12)
            .map(|index| format!("line {}", index))
            .collect::<Vec<_>>()
            .join("\n");
        let rendered = render_lines(tool_result_lines(&output));
        assert!(rendered.contains("line 1"));
        assert!(rendered.contains("line 4"));
        assert!(rendered.contains("... 4 lines omitted ..."));
        assert!(rendered.contains("line 9"));
        assert!(rendered.contains("line 12"));
        assert!(!rendered.contains("line 6"));
    }

    #[test]
    fn tool_result_lines_matches_edit_summary_snapshot() {
        let output = "M crates/tandem-tui/src/app.rs +1 -1\n@@\n-old line\n+new line";
        let rendered = render_lines(tool_result_lines(output));
        let expected = " EDITS  applied • 1 file\n   1 action • +1 -1\n   modified crates/tandem-tui/src/app.rs (+1 -1)\n   files: crates/tandem-tui/src/app.rs\n   - old line\n   + new line\n NEXT  review with /diff";
        assert_eq!(rendered, expected);
    }

    #[test]
    fn tool_result_lines_matches_partial_edit_snapshot() {
        let output = "M crates/tandem-tui/src/app.rs +5 -2\nFailed to apply patch cleanly";
        let rendered = render_lines(tool_result_lines(output));
        let expected = " PARTIAL  partially applied • 1 file\n   1 action • +5 -2\n   modified crates/tandem-tui/src/app.rs (+5 -2)\n   files: crates/tandem-tui/src/app.rs\n NEXT  review with /diff and inspect the failed edit output";
        assert_eq!(rendered, expected);
    }

    #[test]
    fn tool_result_lines_matches_failed_edit_snapshot() {
        let output = "Failed to apply patch cleanly\nError: patch did not match target";
        let rendered = render_lines(tool_result_lines(output));
        let expected = " FAILED  failed • 0 files\n   No files changed\n NEXT  inspect the failure output, then retry the edit";
        assert_eq!(rendered, expected);
    }

    #[test]
    fn tool_result_lines_matches_long_output_snapshot() {
        let output = (1..=12)
            .map(|index| format!("line {}", index))
            .collect::<Vec<_>>()
            .join("\n");
        let rendered = render_lines(tool_result_lines(&output));
        let expected = " RESULT \n   line 1\n   line 2\n   line 3\n   line 4\n   ... 4 lines omitted ...\n   line 9\n   line 10\n   line 11\n   line 12";
        assert_eq!(rendered, expected);
    }

    #[test]
    fn tool_result_lines_matches_generic_next_block_snapshot() {
        let output = "Context run detail\n  status: ready\n\nNext\n  /context_run show run-1\n  /context_run_events run-1";
        let rendered = render_lines(tool_result_lines(output));
        let expected = " RESULT \n   Context run detail\n     status: ready\n NEXT  /context_run show run-1\n   /context_run_events run-1";
        assert_eq!(rendered, expected);
    }

    #[test]
    fn tool_result_lines_matches_operator_action_required_snapshot() {
        let output = "Rollback preview (run-1)\n  required_ack: event-1\n  approval required before execute\n\nNext\n  /context_run_rollback_execute run-1 --ack event-1\n  /context_run_rollback_history run-1";
        let rendered = render_lines(tool_result_lines(output));
        let expected = " ACTION  preview • run-1\n   ack required: event-1\n   details: approval required before execute\n NEXT  /context_run_rollback_execute run-1 --ack event-1\n   /context_run_rollback_history run-1";
        assert_eq!(rendered, expected);
    }

    #[test]
    fn tool_result_lines_matches_structured_rollback_preview_snapshot() {
        let output = "Rollback preview (run-1)\n  step_count: 4\n  executable_steps: 2\n  advisory_steps: 2\n  fully_executable: false\n  required_ack: event-1\n\nExecutable ids\n  event-1\n  event-2\n\nSteps\n  - [exec] seq=1 ops=2 tool=edit event=event-1\n  - [info] seq=2 ops=1 tool=read event=event-2\n  - [info] seq=3 ops=1 tool=search event=event-3\n\nNext\n  /context_run_rollback_execute run-1 --ack event-1 event-2\n  /context_run_rollback_execute_all run-1 --ack";
        let rendered = render_lines(tool_result_lines(output));
        let expected = " ACTION  preview • run-1\n   4 steps • 2 executable • 2 advisory\n   ready: false\n   ack required: event-1\n   ids: event-1 | event-2\n   step: [exec] seq=1 ops=2 tool=edit event=event-1\n   step: [info] seq=2 ops=1 tool=read event=event-2\n   +1 more steps\n NEXT  /context_run_rollback_execute run-1 --ack event-1 event-2\n   /context_run_rollback_execute_all run-1 --ack";
        assert_eq!(rendered, expected);
    }

    #[test]
    fn tool_result_lines_matches_structured_rollback_execute_snapshot() {
        let output = "Rollback execute (run-1)\n  applied: true\n  selected: event-1, event-2\n  applied_steps: 2\n  applied_operations: 5\n  missing: <none>\n  reason: <none>\n\nNext\n  /context_run_rollback_history run-1\n  /context_run_rollback_preview run-1";
        let rendered = render_lines(tool_result_lines(output));
        let expected = " ROLLBACK  execute • run-1\n   applied • 2 steps • 5 operations\n   selected: event-1, event-2\n NEXT  /context_run_rollback_history run-1\n   /context_run_rollback_preview run-1";
        assert_eq!(rendered, expected);
    }

    #[test]
    fn tool_result_lines_matches_structured_rollback_receipts_snapshot() {
        let output = "Rollback receipts (run-1)\n  entries: 3\n  applied: 1\n  blocked: 2\n\nRecent receipts\n  - seq=3 outcome=blocked ts=300\n    reason: approval required\n  - seq=2 outcome=blocked ts=200\n    reason: waiting for ack\n  - seq=1 outcome=applied ts=100\n    reason: operator approved";
        let rendered = render_lines(tool_result_lines(output));
        let expected = " ROLLBACK  receipts • run-1\n   3 entries • 1 applied • 2 blocked\n   receipt: seq=3 outcome=blocked ts=300\n   receipt: seq=2 outcome=blocked ts=200\n   +1 more receipts";
        assert_eq!(rendered, expected);
    }
}
