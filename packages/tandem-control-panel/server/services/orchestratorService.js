export function mapOrchestratorPath(pathname) {
  const path = String(pathname || "").trim();
  if (path.startsWith("/api/orchestrator")) {
    return `/api/swarm${path.slice("/api/orchestrator".length)}`;
  }
  return path;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickNumeric(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

export function deriveRunBudget(run, events, tasks) {
  const startedAtMs = toNumber(run?.started_at_ms);
  const updatedAtMs = toNumber(run?.updated_at_ms || Date.now());
  const wallTimeSecs =
    startedAtMs > 0 && updatedAtMs >= startedAtMs ? Math.round((updatedAtMs - startedAtMs) / 1000) : 0;
  const iterationsUsed = Array.isArray(events)
    ? events.filter((row) => String(row?.type || "").toLowerCase().includes("task_")).length
    : 0;
  const tokenEvents = Array.isArray(events) ? events : [];
  let tokensUsed = 0;
  for (const event of tokenEvents) {
    const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
    const total = pickNumeric(
      payload?.total_tokens,
      payload?.tokens_total,
      payload?.token_count,
      payload?.usage_total_tokens
    );
    if (total > 0) tokensUsed = Math.max(tokensUsed, total);
    const prompt = toNumber(payload?.prompt_tokens || payload?.input_tokens);
    const completion = toNumber(payload?.completion_tokens || payload?.output_tokens);
    if (prompt + completion > tokensUsed) tokensUsed = prompt + completion;
  }
  const maxIterations = pickNumeric(run?.budget?.max_iterations, 500);
  const maxTokens = pickNumeric(run?.budget?.max_tokens, run?.budget?.max_total_tokens, 400000);
  const maxWallTimeSecs = pickNumeric(run?.budget?.max_wall_time_secs, 3600);
  const maxSubagentRuns = pickNumeric(run?.budget?.max_subagent_runs, Math.max(64, tasks.length * 6));
  const subagentRunsUsed = Array.isArray(events)
    ? events.filter((row) => String(row?.type || "").toLowerCase().includes("task_completed")).length
    : 0;
  const exceeded =
    iterationsUsed > maxIterations ||
    tokensUsed > maxTokens ||
    wallTimeSecs > maxWallTimeSecs ||
    subagentRunsUsed > maxSubagentRuns;
  return {
    max_iterations: maxIterations,
    iterations_used: iterationsUsed,
    max_tokens: maxTokens,
    tokens_used: tokensUsed,
    max_wall_time_secs: maxWallTimeSecs,
    wall_time_secs: wallTimeSecs,
    max_subagent_runs: maxSubagentRuns,
    subagent_runs_used: subagentRunsUsed,
    exceeded,
    exceeded_reason: exceeded ? "One or more execution limits exceeded." : "",
  };
}

export function inferStatusFromEvents(status, events) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized && normalized !== "planning") return normalized;
  const rows = Array.isArray(events) ? events : [];
  let sawPlanReady = false;
  let sawPlanApproved = false;
  for (const row of rows) {
    const type = String(row?.type || "").trim().toLowerCase();
    if (type === "plan_ready_for_approval") sawPlanReady = true;
    if (type === "plan_approved") sawPlanApproved = true;
  }
  if (sawPlanReady && !sawPlanApproved) return "awaiting_approval";
  return normalized || "idle";
}

