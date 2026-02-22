#!/usr/bin/env bash
set -euo pipefail

# Measures process-cold startup by restarting engine each trial and timing:
# boot readiness, run_now ACK, and mission run terminal status visibility.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Load local benchmark env (for provider keys like OPENROUTER_API_KEY).
if [[ -f "$SCRIPT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/.env"
  set +a
fi

BASE_URL="${TANDEM_BASE_URL:-http://127.0.0.1:39731}"
API_FAMILY="${TANDEM_AUTOMATION_API:-routines}"
RUNS="${BENCH_RUNS:-5}"
STARTUP_TIMEOUT_SECONDS="${BENCH_STARTUP_TIMEOUT_SECONDS:-45}"
RUN_TERMINAL_TIMEOUT_SECONDS="${BENCH_RUN_TERMINAL_TIMEOUT_SECONDS:-60}"
POLL_MS="${BENCH_POLL_MS:-200}"
API_TOKEN="${TANDEM_API_TOKEN:-}"
TANDEM_PROVIDER="${TANDEM_PROVIDER:-}"
TANDEM_MODEL="${TANDEM_MODEL:-}"
BENCH_TARGET_PHASE="${BENCH_TARGET_PHASE:-trigger}" # trigger|started|terminal

HOST="$(echo "$BASE_URL" | sed -E 's#https?://([^:/]+).*#\1#')"
PORT="$(echo "$BASE_URL" | sed -E 's#https?://[^:/]+:([0-9]+).*#\1#')"
if [[ "$PORT" == "$BASE_URL" ]]; then
  PORT="39731"
fi

engine_cmd_default="$REPO_ROOT/target/debug/tandem-engine serve --host $HOST --port $PORT"
if [[ -n "$TANDEM_PROVIDER" ]]; then
  engine_cmd_default="$engine_cmd_default --provider $TANDEM_PROVIDER"
fi
if [[ -n "$TANDEM_MODEL" ]]; then
  engine_cmd_default="$engine_cmd_default --model $TANDEM_MODEL"
fi
ENGINE_CMD="${TANDEM_ENGINE_CMD:-$engine_cmd_default}"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for benchmark_cold_start.sh"
  exit 1
fi

if [[ "$API_FAMILY" == "automations" ]]; then
  CREATE_PATH="/automations"
  RUN_NOW_PREFIX="/automations"
  RUN_PATH_PREFIX="/automations/runs"
else
  CREATE_PATH="/routines"
  RUN_NOW_PREFIX="/routines"
  RUN_PATH_PREFIX="/routines/runs"
fi

api_curl() {
  if [[ -n "$API_TOKEN" ]]; then
    curl -sS -H "Authorization: Bearer $API_TOKEN" "$@"
  else
    curl -sS "$@"
  fi
}

now_ms() {
  if command -v python3 >/dev/null 2>&1; then
    python3 - <<'PY'
import time
print(int(time.time()*1000))
PY
  elif command -v python >/dev/null 2>&1; then
    python - <<'PY'
import time
print(int(time.time()*1000))
PY
  else
    date +%s%3N
  fi
}

wait_ready() {
  local timeout="$1"
  local poll_ms="$2"
  local deadline
  deadline=$((SECONDS + timeout))
  while (( SECONDS < deadline )); do
    if api_curl -f "$BASE_URL/global/health" 2>/dev/null | jq -e '.ready == true' >/dev/null 2>&1; then
      return 0
    fi
    sleep "$(awk "BEGIN { printf \"%.3f\", $poll_ms/1000 }")"
  done
  return 1
}

assert_port_free() {
  if ss -ltnp 2>/dev/null | grep -Eq ":$PORT([[:space:]]|$)"; then
    echo "port $PORT is already in use; stop existing engine before running cold-start benchmark"
    ss -ltnp 2>/dev/null | grep -E ":$PORT([[:space:]]|$)" || true
    exit 1
  fi
}

percentile() {
  local file="$1"
  local p="$2"
  awk -v p="$p" '
    { a[NR]=$1 }
    END {
      if (NR==0) { print "nan"; exit 0 }
      n=asort(a)
      idx=int((n*p)+0.999999)-1
      if (idx < 0) idx=0
      if (idx >= n) idx=n-1
      print a[idx+1]
    }
  ' "$file"
}

tmp_boot="$(mktemp)"
tmp_ack="$(mktemp)"
tmp_terminal="$(mktemp)"
tmp_total="$(mktemp)"
out_json="$SCRIPT_DIR/cold_start_results.json"
bench_id="bench-cold-start-$(date +%s)"

cleanup() {
  if [[ -n "${engine_pid:-}" ]]; then
    kill "$engine_pid" >/dev/null 2>&1 || true
    wait "$engine_pid" 2>/dev/null || true
  fi
  rm -f "$tmp_boot" "$tmp_ack" "$tmp_terminal" "$tmp_total"
}
trap cleanup EXIT

echo "{ \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"base_url\": \"$BASE_URL\", \"api_family\": \"$API_FAMILY\", \"runs\": $RUNS, \"results\": [" > "$out_json"

for i in $(seq 1 "$RUNS"); do
  echo
  echo "== Trial $i/$RUNS =="
  trial_id="${bench_id}-${i}"
  assert_port_free

  engine_start_ms="$(now_ms)"

  bash -lc "$ENGINE_CMD" >/tmp/tandem-bench-engine.log 2>&1 &
  engine_pid=$!
  sleep 0.1
  if ! kill -0 "$engine_pid" 2>/dev/null; then
    echo "engine process exited early; check /tmp/tandem-bench-engine.log"
    exit 1
  fi

  if ! wait_ready "$STARTUP_TIMEOUT_SECONDS" "$POLL_MS"; then
    kill "$engine_pid" >/dev/null 2>&1 || true
    echo "engine did not become ready within timeout"
    exit 1
  fi

  engine_ready_ms="$(now_ms)"
  engine_boot_ms=$((engine_ready_ms - engine_start_ms))

  echo "== Create benchmark mission definition =="
  if [[ "$API_FAMILY" == "automations" ]]; then
    create_payload="$(cat <<JSON
{
  "automation_id": "$trial_id",
  "name": "Cold Start Benchmark Automation",
  "schedule": { "interval_seconds": { "seconds": 3600 } },
  "mission": {
    "objective": "Read one local file and return a one-line summary.",
    "success_criteria": ["At least one file read attempt is completed."],
    "entrypoint_compat": "mission.default"
  },
  "policy": {
    "tool": {
      "run_allowlist": ["read"],
      "external_integrations_allowed": false
    },
    "approval": {
      "requires_approval": false
    }
  },
  "output_targets": ["file://reports/$trial_id.json"]
}
JSON
)"
  else
    create_payload="$(cat <<JSON
{
  "routine_id": "$trial_id",
  "name": "Cold Start Benchmark Routine",
  "schedule": { "interval_seconds": { "seconds": 3600 } },
  "entrypoint": "mission.default",
  "args": {
    "prompt": "Read one local file and return a one-line summary.",
    "success_criteria": ["At least one file read attempt is completed."]
  },
  "allowed_tools": ["read"],
  "output_targets": ["file://reports/$trial_id.json"],
  "requires_approval": false,
  "external_integrations_allowed": false
}
JSON
)"
  fi

  create_resp="$(api_curl -X POST "$BASE_URL$CREATE_PATH" \
    -H "content-type: application/json" \
    -d "$create_payload")"
  if ! echo "$create_resp" | jq -e '.automation.automation_id // .routineID // .routine.routine_id // .ok' >/dev/null 2>&1; then
    kill "$engine_pid" >/dev/null 2>&1 || true
    echo "failed to create benchmark definition"
    echo "create response: $create_resp"
    exit 1
  fi

  # API-side enqueue/ack latency for mission-trigger path.
  run_now_start_ms="$(now_ms)"
  run_now_resp="$(api_curl -X POST "$BASE_URL$RUN_NOW_PREFIX/$trial_id/run_now" -H "content-type: application/json" -d '{}')"
  run_now_end_ms="$(now_ms)"
  run_now_ack_ms=$((run_now_end_ms - run_now_start_ms))

  run_id="$(echo "$run_now_resp" | jq -r '.runID // .runId // .run_id // .id // .run.runID // .run.runId // .run.run_id // .run.id // empty')"
  if [[ -z "$run_id" ]]; then
    kill "$engine_pid" >/dev/null 2>&1 || true
    echo "could not parse run id"
    echo "run_now response: $run_now_resp"
    exit 1
  fi

  target_status=""
  run_terminal_ms=0
  if [[ "$BENCH_TARGET_PHASE" == "trigger" ]]; then
    target_status="triggered"
    run_terminal_ms="$run_now_ack_ms"
  else
    # End-to-end mission run gate (started or terminal status visible in run record).
    terminal_start_ms="$run_now_start_ms"
    terminal_deadline=$((SECONDS + RUN_TERMINAL_TIMEOUT_SECONDS))
    terminal_status=""

    while (( SECONDS < terminal_deadline )); do
      run_record="$(api_curl -f "$BASE_URL$RUN_PATH_PREFIX/$run_id" || true)"
      if [[ -n "$run_record" ]]; then
        status="$(echo "$run_record" | jq -r '.run.status // .status // empty')"
        case "$BENCH_TARGET_PHASE" in
          started)
            case "$status" in
              running|completed|failed|blocked_policy|denied|cancelled)
                target_status="$status"
                ;;
            esac
            ;;
          terminal)
            case "$status" in
              completed|failed|blocked_policy|denied|cancelled)
                target_status="$status"
                ;;
            esac
            ;;
          *)
            kill "$engine_pid" >/dev/null 2>&1 || true
            echo "invalid BENCH_TARGET_PHASE: $BENCH_TARGET_PHASE (expected trigger|started|terminal)"
            exit 1
            ;;
        esac
        if [[ -n "$target_status" ]]; then break; fi
      fi
      sleep "$(awk "BEGIN { printf \"%.3f\", $POLL_MS/1000 }")"
    done

    if [[ -z "$target_status" ]]; then
      run_record="$(api_curl "$BASE_URL$RUN_PATH_PREFIX/$run_id" || true)"
      if [[ -n "$run_record" ]]; then
        terminal_status="$(echo "$run_record" | jq -r '.run.status // .status // empty')"
      fi
      kill "$engine_pid" >/dev/null 2>&1 || true
      echo "run did not reach target phase '$BENCH_TARGET_PHASE' within timeout (last_status=${terminal_status:-unknown})"
      exit 1
    fi

    terminal_end_ms="$(now_ms)"
    run_terminal_ms=$((terminal_end_ms - terminal_start_ms))
  fi
  total_ms=$((engine_boot_ms + run_terminal_ms))

  echo "$engine_boot_ms" >> "$tmp_boot"
  echo "$run_now_ack_ms" >> "$tmp_ack"
  echo "$run_terminal_ms" >> "$tmp_terminal"
  echo "$total_ms" >> "$tmp_total"

  echo "engine_boot_ms=$engine_boot_ms mission_trigger_ack_ms=$run_now_ack_ms mission_target_ms=$run_terminal_ms cold_start_to_mission_target_ms=$total_ms status=$target_status target_phase=$BENCH_TARGET_PHASE"

  if [[ "$i" -gt 1 ]]; then
    echo "," >> "$out_json"
  fi
  echo "  {\"trial\":$i,\"definition_id\":\"$trial_id\",\"engine_boot_ms\":$engine_boot_ms,\"mission_trigger_ack_ms\":$run_now_ack_ms,\"mission_target_ms\":$run_terminal_ms,\"cold_start_to_mission_target_ms\":$total_ms,\"status\":\"$target_status\",\"target_phase\":\"$BENCH_TARGET_PHASE\",\"run_id\":\"$run_id\"}" >> "$out_json"

  kill "$engine_pid" >/dev/null 2>&1 || true
  wait "$engine_pid" 2>/dev/null || true
done

echo "] }" >> "$out_json"

boot_p50="$(percentile "$tmp_boot" 0.5)"
boot_p95="$(percentile "$tmp_boot" 0.95)"
ack_p50="$(percentile "$tmp_ack" 0.5)"
ack_p95="$(percentile "$tmp_ack" 0.95)"
terminal_p50="$(percentile "$tmp_terminal" 0.5)"
terminal_p95="$(percentile "$tmp_terminal" 0.95)"
total_p50="$(percentile "$tmp_total" 0.5)"
total_p95="$(percentile "$tmp_total" 0.95)"

echo
echo "== Summary =="
echo "engine_boot_ms     p50=$boot_p50 p95=$boot_p95"
echo "mission_trigger_ack_ms      p50=$ack_p50 p95=$ack_p95"
echo "mission_target_ms           p50=$terminal_p50 p95=$terminal_p95 (target_phase=$BENCH_TARGET_PHASE)"
echo "cold_start_to_mission_target_ms   p50=$total_p50 p95=$total_p95"
echo
echo "Saved: $out_json"
