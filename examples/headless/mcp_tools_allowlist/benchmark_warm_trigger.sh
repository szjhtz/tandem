#!/usr/bin/env bash
set -euo pipefail

# Measures mission/automation trigger latency on an already-running engine.
# This is useful for production-like "warm engine" timings.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load local benchmark env (for provider keys/tokens).
if [[ -f "$SCRIPT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/.env"
  set +a
fi

BASE_URL="${TANDEM_BASE_URL:-http://127.0.0.1:39731}"
API_FAMILY="${TANDEM_AUTOMATION_API:-routines}"
RUNS="${BENCH_RUNS:-20}"
RUN_TIMEOUT_SECONDS="${BENCH_RUN_TERMINAL_TIMEOUT_SECONDS:-60}"
POLL_MS="${BENCH_POLL_MS:-200}"
API_TOKEN="${TANDEM_API_TOKEN:-}"
BENCH_TARGET_PHASE="${BENCH_TARGET_PHASE:-trigger}" # trigger|started|terminal

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for benchmark_warm_trigger.sh"
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
  local deadline
  deadline=$((SECONDS + timeout))
  while (( SECONDS < deadline )); do
    if api_curl -f "$BASE_URL/global/health" 2>/dev/null | jq -e '.ready == true' >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.2
  done
  return 1
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

if ! wait_ready 20; then
  echo "engine is not ready at $BASE_URL; start tandem-engine serve first"
  exit 1
fi

tmp_ack="$(mktemp)"
tmp_target="$(mktemp)"
out_json="$SCRIPT_DIR/warm_trigger_results.json"
bench_id="bench-warm-trigger-$(date +%s)"

cleanup() {
  rm -f "$tmp_ack" "$tmp_target"
}
trap cleanup EXIT

echo "{ \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"base_url\": \"$BASE_URL\", \"api_family\": \"$API_FAMILY\", \"runs\": $RUNS, \"results\": [" > "$out_json"

for i in $(seq 1 "$RUNS"); do
  echo
  echo "== Trial $i/$RUNS =="
  trial_id="${bench_id}-${i}"

  if [[ "$API_FAMILY" == "automations" ]]; then
    create_payload="$(cat <<JSON
{
  "automation_id": "$trial_id",
  "name": "Warm Trigger Benchmark Automation",
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
  "name": "Warm Trigger Benchmark Routine",
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

  create_resp="$(api_curl -X POST "$BASE_URL$CREATE_PATH" -H "content-type: application/json" -d "$create_payload")"
  if ! echo "$create_resp" | jq -e '.automation.automation_id // .routineID // .routine.routine_id // .ok' >/dev/null 2>&1; then
    echo "failed to create benchmark definition"
    echo "create response: $create_resp"
    exit 1
  fi

  trigger_start_ms="$(now_ms)"
  run_now_resp="$(api_curl -X POST "$BASE_URL$RUN_NOW_PREFIX/$trial_id/run_now" -H "content-type: application/json" -d '{}')"
  trigger_end_ms="$(now_ms)"
  mission_trigger_ack_ms=$((trigger_end_ms - trigger_start_ms))

  run_id="$(echo "$run_now_resp" | jq -r '.runID // .runId // .run_id // .id // .run.runID // .run.runId // .run.run_id // .run.id // empty')"
  if [[ -z "$run_id" ]]; then
    echo "could not parse run id"
    echo "run_now response: $run_now_resp"
    exit 1
  fi

  status="triggered"
  mission_target_ms="$mission_trigger_ack_ms"

  if [[ "$BENCH_TARGET_PHASE" != "trigger" ]]; then
    deadline=$((SECONDS + RUN_TIMEOUT_SECONDS))
    status=""
    while (( SECONDS < deadline )); do
      run_record="$(api_curl -f "$BASE_URL$RUN_PATH_PREFIX/$run_id" || true)"
      if [[ -n "$run_record" ]]; then
        current="$(echo "$run_record" | jq -r '.run.status // .status // empty')"
        case "$BENCH_TARGET_PHASE" in
          started)
            case "$current" in
              running|completed|failed|blocked_policy|denied|cancelled) status="$current" ;;
            esac
            ;;
          terminal)
            case "$current" in
              completed|failed|blocked_policy|denied|cancelled) status="$current" ;;
            esac
            ;;
          *)
            echo "invalid BENCH_TARGET_PHASE: $BENCH_TARGET_PHASE (expected trigger|started|terminal)"
            exit 1
            ;;
        esac
        if [[ -n "$status" ]]; then
          break
        fi
      fi
      sleep "$(awk "BEGIN { printf \"%.3f\", $POLL_MS/1000 }")"
    done
    if [[ -z "$status" ]]; then
      echo "run did not reach target phase '$BENCH_TARGET_PHASE' within timeout"
      exit 1
    fi
    mission_target_ms=$(( $(now_ms) - trigger_start_ms ))
  fi

  echo "$mission_trigger_ack_ms" >> "$tmp_ack"
  echo "$mission_target_ms" >> "$tmp_target"
  echo "mission_trigger_ack_ms=$mission_trigger_ack_ms mission_target_ms=$mission_target_ms status=$status target_phase=$BENCH_TARGET_PHASE"

  if [[ "$i" -gt 1 ]]; then
    echo "," >> "$out_json"
  fi
  echo "  {\"trial\":$i,\"definition_id\":\"$trial_id\",\"mission_trigger_ack_ms\":$mission_trigger_ack_ms,\"mission_target_ms\":$mission_target_ms,\"status\":\"$status\",\"target_phase\":\"$BENCH_TARGET_PHASE\",\"run_id\":\"$run_id\"}" >> "$out_json"
done

echo "] }" >> "$out_json"

ack_p50="$(percentile "$tmp_ack" 0.5)"
ack_p95="$(percentile "$tmp_ack" 0.95)"
target_p50="$(percentile "$tmp_target" 0.5)"
target_p95="$(percentile "$tmp_target" 0.95)"

echo
echo "== Summary =="
echo "mission_trigger_ack_ms  p50=$ack_p50 p95=$ack_p95"
echo "mission_target_ms       p50=$target_p50 p95=$target_p95 (target_phase=$BENCH_TARGET_PHASE)"
echo
echo "Saved: $out_json"
