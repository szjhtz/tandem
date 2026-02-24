# Tandem Engine Performance Investigation Plan (VPS)

## Execution Tracker

- Date: 2026-02-24
- Status: In progress

### Completed

- Added server-side timing instrumentation in:
  - `GET /session`
  - `GET /session/{id}`
  - `POST /session/{id}/command`
- Added request correlation id handling via `x-tandem-correlation-id` (fallback generated id).
- Added slow-path warning logs for high-latency requests.
- Verified builds:
  - `cargo check -p tandem-server` passed
  - `pnpm --dir examples/vps-web-portal run build` passed

### In Progress

- Run a controlled providerless soak while collecting server logs with the new timings.

### Next

- Confirm whether latency growth is mostly `lookup_ms` or `command_ms` for `/session/{id}/command`.
- Compare `GET /session` latency behavior with and without `archived` filtering enabled.
- If wait/queue behavior dominates, add bounded concurrency/backpressure on hot endpoints.
- If execution dominates, optimize endpoint internals before adding limits.

## Goal

Identify and remove the sustained-load bottleneck seen in providerless mixed soak tests (`command + getSession + listSessions`) where timeout/error rate grows under higher concurrency.

## Current Signal

- One-shot diagnostics are healthy.
- Sustained soak shows tail-latency growth and timeout errors on:
  - `/session/{id}/command`
  - `/session?page_size=5`
- This suggests queueing/contention under sustained mixed load, not a single obvious broken endpoint.

## Success Criteria

- Under agreed target load, all must hold:
  - Error rate < 1%
  - P95 stable (no upward drift during soak)
  - P99 below target SLO
  - No repeated client timeout events (`20s`) for critical endpoints

## Scope

Engine-side only (Rust binary):

- Instrumentation
- Load validation
- Hotspot isolation
- Fixes
- Regression soak

Portal is only used as load harness + visualization.

## Phase 1: Add Minimal Instrumentation

Add per-endpoint timing and contention visibility in engine handlers:

### Endpoints

- `POST /session/{id}/command`
- `GET /session/{id}`
- `GET /session?page_size=...`

### Metrics/Spans to add

- Request counters:
  - `requests_total{endpoint,status}`
  - `errors_total{endpoint,error_type}`
- Latency histograms:
  - `latency_ms{endpoint}`
- In-flight gauge:
  - `in_flight{endpoint}`
- Internal timings:
  - `wait_ms{endpoint,phase}` (lock/pool/semaphore wait)
  - `exec_ms{endpoint,phase}` (actual work)

### Logging

- Emit slow-path structured logs for >500ms with fields:
  - `endpoint`, `phase`, `elapsed_ms`, `status`, `request_id`

## Phase 2: Rebuild + Baseline

1. Build engine with instrumentation.
2. Restart engine service.
3. Run baseline soaks from Stress Lab using providerless profiles:
   - `command_only`
   - `get_session_only`
   - `list_sessions_only`
   - `mixed`
4. Keep each run same duration and same host conditions.

Capture for each run:

- Avg/P50/P95/P99
- Error count/rate
- Timeout count
- CPU, memory, open FDs
- wait_ms vs exec_ms by endpoint/phase

## Phase 3: Controlled Load Matrix

Run fixed-duration sweeps with same payload:

- Concurrency: `4, 8, 12, 16, 24, 32`
- Cycle delay: fixed first (current), then re-run with higher delay

For each point, save:

- Endpoint p95/p99
- Error rate
- in-flight peak
- wait_ms and exec_ms percentiles

Expected outcome:

- A clear "knee" where wait_ms and error rate climb.

## Phase 4: Bottleneck Classification

Use the data to classify:

### A) Contention bottleneck

Symptoms:

- wait_ms grows sharply
- exec_ms relatively stable
  Actions:
- Reduce lock scope
- Split hot shared state
- Avoid lock held during I/O
- Shard maps / separate read and write paths

### B) Endpoint work bottleneck

Symptoms:

- exec_ms grows with load
  Actions:
- Optimize command path (spawn/read/serialization)
- Optimize list query path (indexing/caching/page trimming)
- Reduce payload size returned by list endpoint

### C) Capacity control bottleneck

Symptoms:

- in-flight climbs without bound
  Actions:
- Add per-endpoint semaphore limits
- Add overload backpressure (quick 429/503) before timeout
- Tune timeouts per endpoint (not one global timeout)

## Phase 5: Fix + Verify

1. Implement smallest high-impact fix.
2. Rebuild/restart engine.
3. Re-run identical matrix.
4. Compare before/after with same report format.

Ship only if success criteria are met.

## Safety + Reproducibility Rules

- No unrelated code changes during perf run.
- Keep one variable changed at a time.
- Pin runtime conditions (same VM size, same background tasks).
- Keep exact test configuration in report headers.

## Report Template (copy/paste)

```
Run ID:
Commit:
Date/Time:
VM spec:
Scenario:
Duration:
Concurrency:
Cycle delay:

command_only:
- avg/p50/p95/p99:
- errors/timeouts:
- wait_ms vs exec_ms:

get_session_only:
- avg/p50/p95/p99:
- errors/timeouts:
- wait_ms vs exec_ms:

list_sessions_only:
- avg/p50/p95/p99:
- errors/timeouts:
- wait_ms vs exec_ms:

mixed:
- avg/p50/p95/p99:
- errors/timeouts:
- wait_ms vs exec_ms:

Observed bottleneck class:
Chosen fix:
After-fix delta:
Decision:
```

## Immediate Next Step

Implement Phase 1 instrumentation in the three target handlers, then run one full matrix and classify the bottleneck before touching optimization logic.
