function pickStatusClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("fail") || normalized.includes("error")) return "err";
  if (normalized.includes("wait") || normalized.includes("queue") || normalized.includes("new")) return "warn";
  return "ok";
}

function buildRoleSummary(tasks) {
  const summary = new Map();
  for (const t of tasks) {
    const role = t.ownerRole || "unknown";
    const rec = summary.get(role) || { total: 0, running: 0, done: 0, failed: 0 };
    rec.total += 1;
    const status = String(t.status || "").toLowerCase();
    if (status.includes("fail") || status.includes("error")) rec.failed += 1;
    else if (status.includes("done") || status.includes("complete")) rec.done += 1;
    else rec.running += 1;
    summary.set(role, rec);
  }
  return [...summary.entries()];
}

function reasonText(reason) {
  if (!reason) return "";
  if (reason.kind === "task_transition") {
    return `${reason.taskId}: ${reason.from} -> ${reason.to} (${reason.reason || "status changed"})`;
  }
  if (reason.kind === "task_reason") {
    return `${reason.taskId}: ${reason.reason || "updated"}`;
  }
  return reason.reason || JSON.stringify(reason);
}

export async function renderSwarm(ctx) {
  const { api, byId, escapeHtml, toast, state, addCleanup } = ctx;
  const status = await api("/api/swarm/status").catch(() => ({ status: "error" }));
  const snapshot = await api("/api/swarm/snapshot").catch(() => ({ registry: { value: { tasks: {} } }, logs: [], reasons: [] }));
  const tasks = Object.values(snapshot.registry?.value?.tasks || {});
  const reasons = (snapshot.reasons || []).slice().reverse();
  const roleSummary = buildRoleSummary(tasks);

  byId("view").innerHTML = `
    <div class="card">
      <h3>Node Swarm Orchestrator</h3>
      <div class="grid cols-4 gap-sm">
        <input id="swarm-root" value="${escapeHtml(status.workspaceRoot || "")}" placeholder="workspace root" />
        <input id="swarm-objective" value="${escapeHtml(status.objective || "Ship a small feature end-to-end")}" placeholder="objective" />
        <input id="swarm-max" type="number" min="1" value="${escapeHtml(String(status.maxTasks || 3))}" />
        <div class="row">
          <button id="swarm-start" class="primary" ${status.localEngine ? "" : "disabled"}>Start</button>
          <button id="swarm-stop" class="danger">Stop</button>
        </div>
      </div>
      ${status.localEngine ? "" : '<p class="warn">Swarm orchestration is disabled on remote engine URLs. Monitoring remains available.</p>'}
    </div>

    <div class="card mt">
      <div class="row-between"><h3>Live Agent Flow</h3><span class="status-dot ${pickStatusClass(status.status)}">${escapeHtml(status.status || "idle")}</span></div>
      <div class="wire-wrap">
        <svg viewBox="0 0 680 240" class="wire-svg">
          <defs>
            <linearGradient id="wire-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.12"></stop>
              <stop offset="50%" stop-color="#60a5fa" stop-opacity="0.95"></stop>
              <stop offset="100%" stop-color="#34d399" stop-opacity="0.12"></stop>
            </linearGradient>
          </defs>
          <line x1="140" y1="120" x2="320" y2="60" class="wire-line wire-line-active"></line>
          <line x1="140" y1="120" x2="320" y2="120" class="wire-line wire-line-active"></line>
          <line x1="140" y1="120" x2="320" y2="180" class="wire-line wire-line-active"></line>
          <line x1="360" y1="60" x2="540" y2="50" class="wire-line wire-line-active"></line>
          <line x1="360" y1="120" x2="540" y2="120" class="wire-line wire-line-active"></line>
          <line x1="360" y1="180" x2="540" y2="190" class="wire-line wire-line-active"></line>

          <circle cx="120" cy="120" r="20" class="node node-active"></circle>
          <text x="120" y="152" class="node-label" text-anchor="middle">Manager</text>
          <circle cx="340" cy="60" r="18" class="node node-active"></circle>
          <text x="340" y="92" class="node-label" text-anchor="middle">Worker</text>
          <circle cx="340" cy="120" r="18" class="node node-active"></circle>
          <text x="340" y="152" class="node-label" text-anchor="middle">Tester</text>
          <circle cx="340" cy="180" r="18" class="node node-active"></circle>
          <text x="340" y="212" class="node-label" text-anchor="middle">Reviewer</text>
          <circle cx="560" cy="50" r="16" class="node"></circle>
          <text x="560" y="80" class="node-label" text-anchor="middle">Code</text>
          <circle cx="560" cy="120" r="16" class="node"></circle>
          <text x="560" y="150" class="node-label" text-anchor="middle">Tests</text>
          <circle cx="560" cy="190" r="16" class="node"></circle>
          <text x="560" y="220" class="node-label" text-anchor="middle">PR</text>
        </svg>
      </div>
      <div class="grid cols-3 gap-sm mt-sm">
        ${roleSummary
          .map(
            ([role, rec]) =>
              `<div class="metric-card"><div><strong>${escapeHtml(role)}</strong></div><div class="muted">${rec.total} tasks</div><div class="muted">${rec.running} active / ${rec.done} done / ${rec.failed} failed</div></div>`
          )
          .join("") || '<p class="muted">No active roles yet.</p>'}
      </div>
    </div>

    <div class="card mt">
      <div class="row-between">
        <h3>Swarm Why Timeline</h3>
        <div class="row">
          <select id="swarm-reason-kind">
            <option value="">All kinds</option>
            <option value="task_transition">task_transition</option>
            <option value="task_reason">task_reason</option>
          </select>
          <input id="swarm-reason-task" placeholder="Filter by task id" />
        </div>
      </div>
      <div id="swarm-reasons" class="timeline mt-sm"></div>
    </div>

    <div class="card mt">
      <h3>Tasks (${tasks.length})</h3>
      <div id="swarm-tasks" class="list"></div>
    </div>

    <div class="card mt">
      <h3>Swarm Logs</h3>
      <pre id="swarm-logs" class="code"></pre>
    </div>
  `;

  const taskList = byId("swarm-tasks");
  taskList.innerHTML =
    tasks
      .sort((a, b) => (b.lastUpdateMs || 0) - (a.lastUpdateMs || 0))
      .map(
        (t) => `<div class="list-item static row-between"><div><strong>${escapeHtml(t.taskId)}</strong><div class="muted">${escapeHtml(t.ownerRole || "")}</div><div class="muted">${escapeHtml(t.statusReason || "")}</div></div><div class="status-dot ${pickStatusClass(t.status)}">${escapeHtml(t.status || "unknown")}</div></div>`
      )
      .join("") || '<p class="muted">No swarm tasks yet.</p>';

  function renderReasons() {
    const kind = byId("swarm-reason-kind").value.trim();
    const taskFilter = byId("swarm-reason-task").value.trim().toLowerCase();
    const filtered = reasons.filter((r) => {
      if (kind && r.kind !== kind) return false;
      if (taskFilter && !String(r.taskId || "").toLowerCase().includes(taskFilter)) return false;
      return true;
    });

    byId("swarm-reasons").innerHTML =
      filtered
        .map(
          (r) => `
        <div class="timeline-item">
          <div class="timeline-meta"><span class="muted">${new Date(r.at).toLocaleTimeString()}</span> <span class="status-dot ${pickStatusClass(r.to || r.from)}">${escapeHtml(r.kind || "reason")}</span></div>
          <div><strong>${escapeHtml(r.taskId || "swarm")}</strong> <span class="muted">${escapeHtml(r.role || "")}</span></div>
          <div class="timeline-body">${escapeHtml(reasonText(r))}</div>
        </div>
      `
        )
        .join("") || '<p class="muted">No timeline reasons yet.</p>';
  }

  byId("swarm-reason-kind").addEventListener("change", renderReasons);
  byId("swarm-reason-task").addEventListener("input", renderReasons);
  renderReasons();

  byId("swarm-logs").textContent = (snapshot.logs || [])
    .slice(-200)
    .map((l) => `[${new Date(l.at).toLocaleTimeString()}] ${l.stream}: ${l.line}`)
    .join("\n");

  byId("swarm-start").addEventListener("click", async () => {
    try {
      await api("/api/swarm/start", {
        method: "POST",
        body: JSON.stringify({
          workspaceRoot: byId("swarm-root").value.trim(),
          objective: byId("swarm-objective").value.trim(),
          maxTasks: Number.parseInt(byId("swarm-max").value, 10) || 3,
        }),
      });
      toast("ok", "Swarm started.");
      renderSwarm(ctx);
    } catch (e) {
      toast("err", e instanceof Error ? e.message : String(e));
    }
  });

  byId("swarm-stop").addEventListener("click", async () => {
    try {
      await api("/api/swarm/stop", { method: "POST" });
      toast("ok", "Swarm stop requested.");
      renderSwarm(ctx);
    } catch (e) {
      toast("err", e instanceof Error ? e.message : String(e));
    }
  });

  const poll = setInterval(() => {
    if (state.route === "swarm") renderSwarm(ctx);
  }, 4000);
  addCleanup(() => clearInterval(poll));

  try {
    const evt = new EventSource("/api/swarm/events", { withCredentials: true });
    evt.onmessage = () => {
      if (state.route === "swarm") renderSwarm(ctx);
    };
    evt.onerror = () => evt.close();
    addCleanup(() => evt.close());
  } catch {
    // ignore
  }
}
