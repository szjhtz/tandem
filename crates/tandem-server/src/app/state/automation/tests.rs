use super::*;
use crate::automation_v2::types::{AutomationFlowInputRef, AutomationFlowNode};
use serde_json::json;

// ---------------------------------------------------------------------------
// Phase-0 smoke tests — regression safety net for module extraction.
// Covers the 4 highest-traffic pure functions identified in
// AUTOMATION_MODULARIZATION_PLAN.md §Pre-Extraction Test Safety Net.
//
// These tests verify observable behaviour before any code moves happen, so
// that a broken import or wrong re-export is caught immediately by `cargo test`.
// ---------------------------------------------------------------------------

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

fn bare_node() -> AutomationFlowNode {
    AutomationFlowNode {
        node_id: "n1".to_string(),
        agent_id: "a1".to_string(),
        objective: "do something".to_string(),
        depends_on: vec![],
        input_refs: vec![],
        output_contract: None,
        retry_policy: None,
        timeout_ms: None,
        stage_kind: None,
        gate: None,
        metadata: None,
    }
}

fn node_with_input_ref() -> AutomationFlowNode {
    let mut node = bare_node();
    node.input_refs = vec![AutomationFlowInputRef {
        from_step_id: "prev".to_string(),
        alias: "research".to_string(),
    }];
    node
}

fn code_workflow_node() -> AutomationFlowNode {
    // automation_node_is_code_workflow checks metadata.builder.task_kind first.
    let mut node = bare_node();
    node.metadata = Some(json!({
        "builder": { "task_kind": "code_change" }
    }));
    node
}

fn code_patch_contract_node() -> AutomationFlowNode {
    let mut node = bare_node();
    node.node_id = "code_patch".to_string();
    node.objective = "Patch the code and verify the change.".to_string();
    node.output_contract = Some(AutomationFlowOutputContract {
        kind: "code_patch".to_string(),
        validator: None,
        enforcement: None,
        schema: None,
        summary_guidance: None,
    });
    node.metadata = Some(json!({
        "builder": {
            "output_path": "src/lib.rs",
            "verification_command": "cargo test"
        }
    }));
    node
}

fn email_delivery_node() -> AutomationFlowNode {
    let mut node = bare_node();
    node.objective = "Send the finalized report to the requested email address.".to_string();
    node.metadata = Some(json!({
        "delivery": {
            "method": "email",
            "to": "evan@frumu.ai",
            "content_type": "text/html",
            "inline_body_only": true,
            "attachments": false
        }
    }));
    node
}

fn report_markdown_node() -> AutomationFlowNode {
    let mut node = node_with_input_ref();
    node.output_contract = Some(AutomationFlowOutputContract {
        kind: "report_markdown".to_string(),
        validator: Some(crate::AutomationOutputValidatorKind::GenericArtifact),
        enforcement: None,
        schema: None,
        summary_guidance: None,
    });
    node
}

#[test]
fn automation_quality_mode_defaults_to_strict_but_honors_legacy_metadata() {
    let strict_mode = super::enforcement::automation_quality_mode_from_metadata(None, true);
    assert_eq!(
        strict_mode,
        super::enforcement::AutomationQualityMode::StrictResearchV1
    );

    let legacy_metadata = serde_json::json!({
        "quality_mode": "legacy"
    });
    let legacy_object = legacy_metadata.as_object().cloned().expect("object");
    let legacy_mode =
        super::enforcement::automation_quality_mode_from_metadata(Some(&legacy_object), true);
    assert_eq!(
        legacy_mode,
        super::enforcement::AutomationQualityMode::Legacy
    );
}

// -----------------------------------------------------------------------
// automation_infer_selected_mcp_servers
// -----------------------------------------------------------------------

#[test]
fn mcp_servers_empty_inputs_returns_empty() {
    let result = automation_infer_selected_mcp_servers(&[], &[], &[], false);
    assert!(result.is_empty());
}

#[test]
fn mcp_servers_explicit_allowed_list_returned_directly() {
    let result = automation_infer_selected_mcp_servers(
        &["gmail".to_string()],
        &[],
        &["gmail".to_string(), "slack".to_string()],
        false,
    );
    assert_eq!(result, vec!["gmail"]);
}

#[test]
fn mcp_servers_allowlist_wildcard_returns_all_enabled() {
    let enabled = vec!["gmail".to_string(), "slack".to_string()];
    let result = automation_infer_selected_mcp_servers(&[], &["*".to_string()], &enabled, false);
    assert_eq!(result, enabled);
}

#[test]
fn mcp_servers_requires_email_delivery_returns_all_enabled() {
    let enabled = vec!["gmail".to_string(), "hubspot".to_string()];
    let result = automation_infer_selected_mcp_servers(&[], &[], &enabled, true);
    assert_eq!(result, enabled);
}

#[test]
fn report_markdown_preserves_full_upstream_inputs() {
    let node = report_markdown_node();
    assert!(automation_node_preserves_full_upstream_inputs(&node));

    let mut text_summary = bare_node();
    text_summary.output_contract = Some(AutomationFlowOutputContract {
        kind: "text_summary".to_string(),
        validator: Some(crate::AutomationOutputValidatorKind::GenericArtifact),
        enforcement: None,
        schema: None,
        summary_guidance: None,
    });
    text_summary.input_refs = vec![AutomationFlowInputRef {
        from_step_id: "prev".to_string(),
        alias: "input".to_string(),
    }];
    assert!(automation_node_preserves_full_upstream_inputs(
        &text_summary
    ));
}

#[test]
fn mcp_servers_allowlist_namespace_pattern_matches_server() {
    // "mcp.my_server.*" should match server named "my-server" (dashes → underscores)
    let enabled = vec!["my-server".to_string(), "other".to_string()];
    let result = automation_infer_selected_mcp_servers(
        &[],
        &["mcp.my_server.*".to_string()],
        &enabled,
        false,
    );
    assert_eq!(result, vec!["my-server"]);
}

#[test]
fn mcp_servers_deduplicates_when_allowed_and_allowlist_overlap() {
    let enabled = vec!["gmail".to_string()];
    let result = automation_infer_selected_mcp_servers(
        &["gmail".to_string()],
        &["mcp.gmail.*".to_string()],
        &enabled,
        false,
    );
    assert_eq!(result, vec!["gmail"]);
}

#[test]
fn email_send_detection_recognizes_compact_sendemail_names() {
    assert!(automation_tool_name_is_email_send(
        "mcp.composio_1.gmail_sendemail"
    ));
    assert!(automation_tool_name_is_email_send("Gmail_SendEmail"));
    assert!(automation_tool_name_is_email_draft(
        "mcp.composio_1.gmail_draftemail"
    ));
}

#[test]
fn step_cost_provenance_marks_budget_limit_and_cost_deltas() {
    let provenance = automation_step_cost_provenance(
        "step_1",
        Some("gpt-5.1".to_string()),
        120,
        80,
        2.75,
        9.50,
        true,
    );

    assert_eq!(
        provenance.get("step_id").and_then(Value::as_str),
        Some("step_1")
    );
    assert_eq!(
        provenance.get("model_id").and_then(Value::as_str),
        Some("gpt-5.1")
    );
    assert_eq!(
        provenance.get("tokens_in").and_then(Value::as_u64),
        Some(120)
    );
    assert_eq!(
        provenance.get("tokens_out").and_then(Value::as_u64),
        Some(80)
    );
    assert_eq!(
        provenance.get("computed_cost_usd").and_then(Value::as_f64),
        Some(2.75)
    );
    assert_eq!(
        provenance
            .get("cumulative_run_cost_usd_at_step_end")
            .and_then(Value::as_f64),
        Some(9.50)
    );
    assert_eq!(
        provenance
            .get("budget_limit_reached")
            .and_then(Value::as_bool),
        Some(true)
    );
}

// -----------------------------------------------------------------------
// automation_tool_capability_ids
// -----------------------------------------------------------------------

#[test]
fn capability_ids_bare_node_empty() {
    let node = bare_node();
    let caps = automation_tool_capability_ids(&node, "research");
    assert!(
        caps.is_empty(),
        "bare node should yield no capabilities, got: {caps:?}"
    );
}

#[test]
fn capability_ids_node_with_input_ref_includes_workspace_read() {
    let node = node_with_input_ref();
    let caps = automation_tool_capability_ids(&node, "research");
    assert!(caps.contains(&"workspace_read".to_string()));
}

#[test]
fn capability_ids_code_workflow_git_patch_includes_verify_command() {
    let caps = automation_tool_capability_ids(&code_workflow_node(), "git_patch");
    assert!(
        caps.contains(&"verify_command".to_string()),
        "git_patch code node should require verify_command, got: {caps:?}"
    );
}

#[test]
fn capability_ids_code_workflow_research_mode_excludes_verify_command() {
    let caps = automation_tool_capability_ids(&code_workflow_node(), "research");
    assert!(
        !caps.contains(&"verify_command".to_string()),
        "research mode should not include verify_command, got: {caps:?}"
    );
}

#[test]
fn code_patch_contract_is_treated_as_a_code_workflow() {
    let node = code_patch_contract_node();
    assert_eq!(
        automation_output_validator_kind(&node),
        crate::AutomationOutputValidatorKind::CodePatch
    );
    assert!(automation_node_is_code_workflow(&node));
    assert_eq!(
        automation_node_execution_policy(&node, ".")
            .get("workflow_class")
            .and_then(Value::as_str),
        Some("code")
    );
}

#[test]
fn code_patch_contract_includes_verification_command_capability() {
    let caps = automation_tool_capability_ids(&code_patch_contract_node(), "git_patch");
    assert!(
        caps.contains(&"verify_command".to_string()),
        "code_patch contract should require verify_command in patch mode, got: {caps:?}"
    );
}

#[test]
fn code_patch_contract_enforcement_defaults_require_reads_and_prewrite_gates() {
    let enforcement = automation_node_output_enforcement(&code_patch_contract_node());
    assert_eq!(
        enforcement.validation_profile.as_deref(),
        Some("code_change")
    );
    assert!(enforcement.required_tools.iter().any(|tool| tool == "read"));
    assert!(enforcement
        .required_evidence
        .iter()
        .any(|value| value == "local_source_reads"));
    assert!(enforcement
        .prewrite_gates
        .iter()
        .any(|gate| gate == "workspace_inspection"));
    assert!(enforcement
        .prewrite_gates
        .iter()
        .any(|gate| gate == "concrete_reads"));
}

#[test]
fn code_patch_contract_requires_verification_before_completion() {
    let node = code_patch_contract_node();
    let tool_telemetry = json!({
        "verification_expected": true,
        "verification_ran": false
    });
    assert_eq!(
        detect_automation_node_failure_kind(&node, "blocked", None, None, None).as_deref(),
        None
    );
    assert_eq!(
        detect_automation_node_failure_kind(
            &node,
            "blocked",
            Some(false),
            None,
            Some(&json!({"verification_expected": true, "verification_ran": false}))
        )
        .as_deref(),
        Some("verification_missing")
    );
    assert_eq!(
        detect_automation_blocker_category(&node, "blocked", None, &tool_telemetry, None,),
        Some("verification_required".to_string())
    );
}

#[test]
fn capability_ids_output_is_sorted_and_deduplicated() {
    let node = node_with_input_ref();
    let caps = automation_tool_capability_ids(&node, "research");
    let mut sorted = caps.clone();
    sorted.sort();
    sorted.dedup();
    assert_eq!(
        caps, sorted,
        "capability ids must be sorted and deduplicated"
    );
}

#[test]
fn capability_resolution_expands_wildcard_offered_email_tools() {
    let node = email_delivery_node();
    let available_tool_names = [
        "read".to_string(),
        "glob".to_string(),
        "mcp.composio_1.gmail_send_email".to_string(),
        "mcp.composio_1.gmail_create_email_draft".to_string(),
    ]
    .into_iter()
    .collect::<std::collections::HashSet<_>>();
    let resolution = automation_resolve_capabilities(
        &node,
        "artifact_write",
        &["mcp.composio_1.*".to_string()],
        &available_tool_names,
    );

    let offered_send_tools = resolution
        .get("email_tool_diagnostics")
        .and_then(|value| value.get("offered_send_tools"))
        .and_then(serde_json::Value::as_array)
        .cloned()
        .unwrap_or_default();
    let offered_draft_tools = resolution
        .get("email_tool_diagnostics")
        .and_then(|value| value.get("offered_draft_tools"))
        .and_then(serde_json::Value::as_array)
        .cloned()
        .unwrap_or_default();

    assert!(offered_send_tools
        .iter()
        .any(|value| { value.as_str() == Some("mcp.composio_1.gmail_send_email") }));
    assert!(offered_draft_tools
        .iter()
        .any(|value| { value.as_str() == Some("mcp.composio_1.gmail_create_email_draft") }));
}

// -----------------------------------------------------------------------
// normalize_upstream_research_output_paths
// -----------------------------------------------------------------------

#[test]
fn normalize_upstream_paths_passthrough_when_no_content_key() {
    let output = json!({ "summary": "hello" });
    let result = normalize_upstream_research_output_paths("/workspace", None, &output);
    assert_eq!(
        result, output,
        "output with no 'content' key should be returned unchanged"
    );
}

#[test]
fn normalize_upstream_paths_survives_empty_handoff() {
    let output = json!({
        "content": {
            "text": "some text",
            "structured_handoff": {}
        }
    });
    let result = normalize_upstream_research_output_paths("/workspace", None, &output);
    assert!(result.is_object(), "result should still be a JSON object");
}

#[test]
fn normalize_upstream_paths_scopes_tandem_artifacts_for_run() {
    let workspace_root = std::env::temp_dir().join(format!(
        "tandem-upstream-run-scoped-{}",
        uuid::Uuid::new_v4()
    ));
    std::fs::create_dir_all(workspace_root.join(".tandem/runs/run-123/artifacts"))
        .expect("create artifacts");
    std::fs::write(
        workspace_root.join(".tandem/runs/run-123/artifacts/report.md"),
        "report",
    )
    .expect("write artifact");
    let output = json!({
        "content": {
            "structured_handoff": {
                "files_reviewed": [".tandem/artifacts/report.md"]
            }
        }
    });
    let result = normalize_upstream_research_output_paths(
        workspace_root.to_str().expect("workspace"),
        Some("run-123"),
        &output,
    );
    assert_eq!(
        result.pointer("/content/structured_handoff/files_reviewed/0"),
        Some(&json!(".tandem/runs/run-123/artifacts/report.md"))
    );
    let _ = std::fs::remove_dir_all(&workspace_root);
}

#[test]
fn required_output_path_scopes_shared_artifacts_for_run() {
    let mut node = bare_node();
    node.node_id = "generate_report".to_string();
    node.output_contract = Some(AutomationFlowOutputContract {
        kind: "report_markdown".to_string(),
        validator: Some(crate::AutomationOutputValidatorKind::GenericArtifact),
        enforcement: None,
        schema: None,
        summary_guidance: None,
    });
    node.metadata = Some(json!({
        "builder": {
            "output_path": ".tandem/artifacts/generate-report.md"
        }
    }));

    assert_eq!(
        automation_node_required_output_path_for_run(&node, Some("run-iso")),
        Some(".tandem/runs/run-iso/artifacts/generate-report.md".to_string())
    );
    assert_eq!(
        automation_node_required_output_path_for_run(&node, None),
        Some(".tandem/artifacts/generate-report.md".to_string())
    );
}

// -----------------------------------------------------------------------
// assess_artifact_candidate — score ordering invariants
// -----------------------------------------------------------------------

#[test]
fn assess_empty_text_has_negative_score() {
    let assessment =
        assess_artifact_candidate(&bare_node(), "/workspace", "tool", "", &[], &[], &[], &[]);
    assert!(
        assessment.score < 0,
        "empty text should produce a negative score, got {}",
        assessment.score
    );
}

#[test]
fn assess_substantive_text_scores_higher_than_empty() {
    let rich = "## Summary\n\nDetailed analysis.\n\n## Files reviewed\n\n- /workspace/foo.rs\n\n## Approved\n\nYes.";
    let rich_score =
        assess_artifact_candidate(&bare_node(), "/workspace", "tool", rich, &[], &[], &[], &[])
            .score;
    let empty_score =
        assess_artifact_candidate(&bare_node(), "/workspace", "tool", "", &[], &[], &[], &[]).score;
    assert!(
        rich_score > empty_score,
        "substantive text ({rich_score}) should score higher than empty ({empty_score})"
    );
}

#[test]
fn assess_source_field_preserved() {
    let assessment = assess_artifact_candidate(
        &bare_node(),
        "/workspace",
        "my_source",
        "hello",
        &[],
        &[],
        &[],
        &[],
    );
    assert_eq!(assessment.source, "my_source");
}

#[test]
fn assess_evidence_anchors_count_upstream_path_and_url_mentions() {
    let assessment = assess_artifact_candidate(
        &bare_node(),
        "/workspace",
        "tool",
        "See /workspace/docs/product-capabilities.md and https://example.com/source-1 for details.",
        &[],
        &[],
        &[
            "/workspace/docs/product-capabilities.md".to_string(),
            "/workspace/README.md".to_string(),
        ],
        &["https://example.com/source-1".to_string()],
    );
    assert!(
        assessment.evidence_anchor_count >= 2,
        "expected to match at least two upstream evidence anchors, got {}",
        assessment.evidence_anchor_count
    );
}
