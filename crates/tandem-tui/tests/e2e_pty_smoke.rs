mod support;

use std::collections::HashMap;
use std::time::Duration;
use support::pty_harness::{MockEngineServer, MockHttpResponse, TestKey, TuiPtyHarness};

#[test]
#[ignore = "requires spawning tandem-tui in PTY; enable for local/nightly runs"]
fn pty_smoke_open_and_close_help_modal() {
    let mut harness = TuiPtyHarness::spawn_tandem_tui().expect("spawn tandem-tui");

    harness
        .wait_for_text("Engine Start", Duration::from_secs(8))
        .expect("initial screen");

    harness.send_key(TestKey::F1).expect("send F1");
    harness
        .wait_for_text("Modal", Duration::from_secs(3))
        .expect("help modal opened");

    harness.send_key(TestKey::Esc).expect("send Esc");
    harness.drain_output();

    let artifact_dir = std::path::Path::new(".tmp/tui-pty-smoke");
    harness
        .dump_artifacts(artifact_dir)
        .expect("dump artifacts");
}

#[test]
#[ignore = "requires spawning tandem-tui in PTY with a mock engine; enable for local/nightly runs"]
fn pty_mock_engine_session_opens_and_shows_engine_status() {
    let server = MockEngineServer::start(rollback_engine_routes()).expect("mock engine");
    let mut harness = TuiPtyHarness::spawn_tandem_tui_with_env(&[
        ("TANDEM_ENGINE_URL", server.base_url().as_str()),
        ("TANDEM_ENGINE_STALE_POLICY", "warn"),
    ])
    .expect("spawn tandem-tui");

    harness
        .wait_for_text("Rollback Session", Duration::from_secs(8))
        .expect("main menu session list");

    harness.send_key(TestKey::Enter).expect("open session");
    harness
        .wait_for_text("No messages yet.", Duration::from_secs(5))
        .expect("chat view");

    harness
        .submit_command("/engine status")
        .expect("engine status command");
    harness
        .wait_for_text("Engine Status:", Duration::from_secs(5))
        .expect("engine status output");
    harness
        .wait_for_text("Endpoint:", Duration::from_secs(5))
        .expect("engine endpoint output");

    let artifact_dir = std::path::Path::new(".tmp/tui-pty-rollback-flow");
    harness
        .dump_artifacts(artifact_dir)
        .expect("dump connected mock-engine artifacts");
}

fn rollback_engine_routes() -> HashMap<String, MockHttpResponse> {
    HashMap::from([
        (
            "/global/health".to_string(),
            MockHttpResponse::json(
                "200 OK",
                r#"{"healthy":true,"version":"0.4.19","mode":"attached"}"#,
            ),
        ),
        (
            "/global/lease/acquire".to_string(),
            MockHttpResponse::json(
                "200 OK",
                r#"{"lease_id":"lease-1","client_id":"tui-test","client_type":"tui","acquired_at_ms":1,"last_renewed_at_ms":1,"ttl_ms":60000,"lease_count":1}"#,
            ),
        ),
        (
            "/global/lease/renew".to_string(),
            MockHttpResponse::json("200 OK", r#"{"ok":true}"#),
        ),
        (
            "/global/lease/release".to_string(),
            MockHttpResponse::json("200 OK", r#"{"ok":true}"#),
        ),
        (
            "/provider".to_string(),
            MockHttpResponse::json(
                "200 OK",
                r#"{"all":[{"id":"openai","name":"OpenAI","models":{"gpt-4o":{"name":"GPT-4o","limit":{"context":128000}}}}],"connected":["openai"],"default":"openai"}"#,
            ),
        ),
        (
            "/config/providers".to_string(),
            MockHttpResponse::json(
                "200 OK",
                r#"{"providers":{"openai":{"default_model":"gpt-4o"}},"default":"openai"}"#,
            ),
        ),
        (
            "/api/session".to_string(),
            MockHttpResponse::json(
                "200 OK",
                r#"[{"id":"s-rollback","title":"Rollback Session","directory":"/home/evan/tandem","workspaceRoot":"/home/evan/tandem","time":{"created":1,"updated":2}}]"#,
            ),
        ),
        (
            "/session/s-rollback/message".to_string(),
            MockHttpResponse::json("200 OK", r#"[]"#),
        ),
        (
            "/context/runs/run-1/checkpoints/mutations/rollback-preview".to_string(),
            MockHttpResponse::json(
                "200 OK",
                r#"{"steps":[{"seq":3,"event_id":"evt-1","tool":"edit_file","executable":true,"operation_count":2},{"seq":4,"event_id":"evt-2","tool":"read_file","executable":false,"operation_count":1}],"step_count":2,"executable_step_count":1,"advisory_step_count":1,"executable":false}"#,
            ),
        ),
        (
            "/context/runs/run-1/checkpoints/mutations/rollback-history".to_string(),
            MockHttpResponse::json(
                "200 OK",
                r#"{"entries":[{"seq":7,"ts_ms":200,"event_id":"evt-rollback-2","outcome":"blocked","selected_event_ids":["evt-1"],"applied_step_count":0,"applied_operation_count":0,"reason":"approval required"},{"seq":6,"ts_ms":100,"event_id":"evt-rollback-1","outcome":"applied","selected_event_ids":["evt-1"],"applied_step_count":1,"applied_operation_count":2,"applied_by_action":{"rewrite_file":2}}],"summary":{"entry_count":2,"by_outcome":{"applied":1,"blocked":1}}}"#,
            ),
        ),
        (
            "/context/runs/run-1/checkpoints/mutations/rollback-execute".to_string(),
            MockHttpResponse::json(
                "200 OK",
                r#"{"applied":true,"selected_event_ids":["evt-1"],"applied_step_count":1,"applied_operation_count":2,"missing_event_ids":[],"reason":null}"#,
            ),
        ),
    ])
}
