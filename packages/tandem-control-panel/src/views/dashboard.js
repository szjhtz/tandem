function safeCall(fn, fallback) {
  try {
    const value = fn();
    if (value && typeof value.then === "function") return value.catch(() => fallback);
    return Promise.resolve(value ?? fallback);
  } catch {
    return Promise.resolve(fallback);
  }
}

function toArray(value, key) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value[key])) return value[key];
  return [];
}

function runStatusBucket(status) {
  const s = String(status || "").toLowerCase();
  if (!s) return "running";
  if (
    s.includes("done") ||
    s.includes("complete") ||
    s.includes("success") ||
    s.includes("finished")
  ) {
    return "completed";
  }
  if (s.includes("fail") || s.includes("error") || s.includes("cancel") || s.includes("deny")) {
    return "failed";
  }
  if (s.includes("wait") || s.includes("queue") || s.includes("new") || s.includes("pending")) {
    return "queued";
  }
  return "running";
}

function runTimestamp(run) {
  const candidates = [
    run?.updatedAtMs,
    run?.updated_at_ms,
    run?.finishedAtMs,
    run?.finished_at_ms,
    run?.startedAtMs,
    run?.started_at_ms,
    run?.createdAtMs,
    run?.created_at_ms,
    run?.firedAtMs,
    run?.fired_at_ms,
  ];
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function hasSchedule(record) {
  if (!record) return false;
  const schedule = record.schedule || record.cron || record.interval || record.trigger;
  if (typeof schedule === "string") return schedule.trim().length > 0;
  if (typeof schedule === "number") return schedule > 0;
  if (schedule && typeof schedule === "object") return Object.keys(schedule).length > 0;
  return false;
}

function statusCountRows(inputRows) {
  const max = Math.max(1, ...inputRows.map((row) => row.value));
  return inputRows
    .map((row) => ({ ...row, pct: Math.max(4, Math.round((row.value / max) * 100)) }))
    .filter((row) => row.value > 0);
}

export async function renderDashboard(ctx) {
  const { api, state, byId, escapeHtml, setRoute } = ctx;

  const [
    health,
    provider,
    channels,
    routinesRaw,
    automationsRaw,
    routineRunsRaw,
    automationRunsRaw,
    sessionsRaw,
    swarmStatus,
    swarmSnapshot,
    instancesRaw,
    approvalsRaw,
  ] = await Promise.all([
    safeCall(() => api("/api/system/health"), {}),
    safeCall(() => state.client.providers.config(), { default: null, providers: {} }),
    safeCall(() => state.client.channels.status(), {}),
    safeCall(() => state.client.routines.list(), { routines: [] }),
    safeCall(() => state.client.automations.list(), { automations: [] }),
    safeCall(() => state.client.routines.listRuns({ limit: 120 }), { runs: [] }),
    safeCall(() => state.client.automations.listRuns({ limit: 120 }), { runs: [] }),
    safeCall(() => state.client.sessions.list({ pageSize: 50 }), []),
    safeCall(() => api("/api/swarm/status"), { status: "unknown" }),
    safeCall(() => api("/api/swarm/snapshot"), { registry: { value: { tasks: {} } } }),
    safeCall(
      () => (state.client?.agentTeams?.listInstances ? state.client.agentTeams.listInstances() : {}),
      { instances: [] }
    ),
    safeCall(
      () => (state.client?.agentTeams?.listApprovals ? state.client.agentTeams.listApprovals() : {}),
      { spawnApprovals: [] }
    ),
  ]);

  const routines = toArray(routinesRaw, "routines");
  const automations = toArray(automationsRaw, "automations");
  const routineRuns = toArray(routineRunsRaw, "runs");
  const automationRuns = toArray(automationRunsRaw, "runs");
  const runs = [...routineRuns, ...automationRuns];
  const sessions = toArray(sessionsRaw, "sessions");
  const teamInstances = toArray(instancesRaw, "instances");
  const teamApprovals = toArray(approvalsRaw, "spawnApprovals");
  const swarmTasks = Object.values(swarmSnapshot?.registry?.value?.tasks || {});
  const connectedChannels = Object.values(channels || {}).filter((rec) => rec?.connected).length;

  const runStatusCounts = {
    completed: 0,
    running: 0,
    queued: 0,
    failed: 0,
  };
  for (const run of runs) {
    runStatusCounts[runStatusBucket(run?.status)] += 1;
  }
  const runStatusRows = statusCountRows([
    { key: "completed", label: "Completed", value: runStatusCounts.completed },
    { key: "running", label: "Running", value: runStatusCounts.running },
    { key: "queued", label: "Queued", value: runStatusCounts.queued },
    { key: "failed", label: "Failed", value: runStatusCounts.failed },
  ]);

  const allSchedulers = [...routines, ...automations];
  const scheduledCount = allSchedulers.filter((x) => hasSchedule(x)).length;
  const manualCount = Math.max(allSchedulers.length - scheduledCount, 0);
  const pausedCount = allSchedulers.filter((rec) => {
    const s = String(rec?.status || "").toLowerCase();
    return s.includes("pause") || s.includes("disable") || s.includes("stop");
  }).length;
  const scheduleRows = statusCountRows([
    { key: "scheduled", label: "Scheduled", value: scheduledCount },
    { key: "manual", label: "Manual", value: manualCount },
    { key: "paused", label: "Paused/Disabled", value: pausedCount },
  ]);

  const swarmStatusCounts = {
    running: 0,
    done: 0,
    failed: 0,
  };
  for (const task of swarmTasks) {
    const s = String(task?.status || "").toLowerCase();
    if (s.includes("fail") || s.includes("error")) swarmStatusCounts.failed += 1;
    else if (s.includes("done") || s.includes("complete")) swarmStatusCounts.done += 1;
    else swarmStatusCounts.running += 1;
  }
  const swarmRows = statusCountRows([
    { key: "running", label: "Active", value: swarmStatusCounts.running },
    { key: "completed", label: "Completed", value: swarmStatusCounts.done },
    { key: "failed", label: "Failed", value: swarmStatusCounts.failed },
  ]);

  const now = Date.now();
  const hourlyBins = new Array(12).fill(0).map((_, i) => ({
    label: `${11 - i}h`,
    value: 0,
  }));
  for (const run of runs) {
    const ts = runTimestamp(run);
    if (!ts) continue;
    const diffHours = Math.floor((now - ts) / 3600000);
    if (diffHours >= 0 && diffHours < 12) {
      hourlyBins[11 - diffHours].value += 1;
    }
  }
  const maxHourlyRuns = Math.max(1, ...hourlyBins.map((bin) => bin.value));

  byId("view").innerHTML = `
    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div class="tcp-card">
        <div class="mb-2 flex items-center justify-between"><span class="tcp-subtle">Engine</span><i data-lucide="cpu"></i></div>
        <div class="text-2xl font-semibold">${escapeHtml(health.engine?.version || "unknown")}</div>
        <p class="mt-1 text-sm ${health.engine?.ready || health.engine?.healthy ? "text-lime-300" : "text-rose-300"}">${
          health.engine?.ready || health.engine?.healthy ? "Healthy" : "Unhealthy"
        }</p>
      </div>
      <div class="tcp-card">
        <div class="mb-2 flex items-center justify-between"><span class="tcp-subtle">Provider</span><i data-lucide="bot"></i></div>
        <div class="text-2xl font-semibold">${escapeHtml(provider.default || "none")}</div>
        <p class="mt-1 text-sm text-slate-400">Default model configured</p>
      </div>
      <div class="tcp-card">
        <div class="mb-2 flex items-center justify-between"><span class="tcp-subtle">Channels</span><i data-lucide="messages-square"></i></div>
        <div class="text-2xl font-semibold">${connectedChannels}</div>
        <p class="mt-1 text-sm text-slate-400">Connected integrations</p>
      </div>
      <div class="tcp-card">
        <div class="mb-2 flex items-center justify-between"><span class="tcp-subtle">Scheduled</span><i data-lucide="clock-3"></i></div>
        <div class="text-2xl font-semibold">${scheduledCount}</div>
        <p class="mt-1 text-sm text-slate-400">Routines + automations with a trigger</p>
      </div>
    </div>

    <div class="grid gap-4 xl:grid-cols-3">
      <section class="tcp-card">
        <div class="mb-3 flex items-center justify-between gap-2">
          <h3 class="tcp-title">Run Status (latest ${runs.length})</h3>
          <span class="tcp-subtle text-xs">routines + automations</span>
        </div>
        ${
          runStatusRows.length
            ? `<div class="dashboard-bars">${runStatusRows
                .map(
                  (row) => `
                <div class="dashboard-bar-row">
                  <div class="dashboard-bar-meta">
                    <span>${escapeHtml(row.label)}</span>
                    <span class="dashboard-bar-count">${row.value}</span>
                  </div>
                  <div class="dashboard-bar-track"><span class="dashboard-bar-fill ${row.key}" style="width:${row.pct}%"></span></div>
                </div>
              `
                )
                .join("")}</div>`
            : '<p class="tcp-subtle">No run history yet.</p>'
        }
      </section>

      <section class="tcp-card">
        <div class="mb-3 flex items-center justify-between gap-2">
          <h3 class="tcp-title">Schedule Composition</h3>
          <span class="tcp-subtle text-xs">${allSchedulers.length} configured</span>
        </div>
        ${
          scheduleRows.length
            ? `<div class="dashboard-bars">${scheduleRows
                .map(
                  (row) => `
                <div class="dashboard-bar-row">
                  <div class="dashboard-bar-meta">
                    <span>${escapeHtml(row.label)}</span>
                    <span class="dashboard-bar-count">${row.value}</span>
                  </div>
                  <div class="dashboard-bar-track"><span class="dashboard-bar-fill ${row.key}" style="width:${row.pct}%"></span></div>
                </div>
              `
                )
                .join("")}</div>`
            : '<p class="tcp-subtle">No routines or automations found.</p>'
        }
      </section>

      <section class="tcp-card">
        <div class="mb-3 flex items-center justify-between gap-2">
          <h3 class="tcp-title">Execution Snapshot</h3>
          <span class="tcp-subtle text-xs">swarm + teams</span>
        </div>
        <div class="dashboard-kpis mb-3">
          <div><span class="dashboard-kpi-label">Swarm status</span><strong>${escapeHtml(String(swarmStatus.status || "unknown"))}</strong></div>
          <div><span class="dashboard-kpi-label">Team instances</span><strong>${teamInstances.length}</strong></div>
          <div><span class="dashboard-kpi-label">Pending approvals</span><strong>${teamApprovals.length}</strong></div>
          <div><span class="dashboard-kpi-label">Chat sessions</span><strong>${sessions.length}</strong></div>
        </div>
        ${
          swarmRows.length
            ? `<div class="dashboard-bars">${swarmRows
                .map(
                  (row) => `
                <div class="dashboard-bar-row">
                  <div class="dashboard-bar-meta">
                    <span>${escapeHtml(row.label)}</span>
                    <span class="dashboard-bar-count">${row.value}</span>
                  </div>
                  <div class="dashboard-bar-track"><span class="dashboard-bar-fill ${row.key}" style="width:${row.pct}%"></span></div>
                </div>
              `
                )
                .join("")}</div>`
            : '<p class="tcp-subtle">No swarm task records available.</p>'
        }
      </section>
    </div>

    <div class="tcp-card">
      <div class="mb-3 flex items-center justify-between gap-2">
        <h3 class="tcp-title">Run Volume (Last 12h)</h3>
        <span class="tcp-subtle text-xs">${runs.length} total sampled runs</span>
      </div>
      <div class="dashboard-histogram">
        ${hourlyBins
          .map((bin) => {
            const height = Math.max(8, Math.round((bin.value / maxHourlyRuns) * 100));
            return `
            <div class="dashboard-histogram-bin">
              <span class="dashboard-histogram-count">${bin.value}</span>
              <span class="dashboard-histogram-bar" style="height:${height}%"></span>
              <span class="dashboard-histogram-label">${escapeHtml(bin.label)}</span>
            </div>
          `;
          })
          .join("")}
      </div>
    </div>

    <div class="tcp-card">
      <h3 class="tcp-title mb-3">Quick Actions</h3>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <button class="tcp-btn w-full justify-start" data-goto="chat"><i data-lucide="message-square"></i> Open Chat</button>
        <button class="tcp-btn w-full justify-start" data-goto="agents"><i data-lucide="clipboard-list"></i> Manage Routines</button>
        <button class="tcp-btn w-full justify-start" data-goto="swarm"><i data-lucide="workflow"></i> Launch Swarm</button>
        <button class="tcp-btn w-full justify-start" data-goto="mcp"><i data-lucide="plug-zap"></i> Connect MCP</button>
      </div>
    </div>
  `;

  byId("view").querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => setRoute(btn.dataset.goto));
  });
}
