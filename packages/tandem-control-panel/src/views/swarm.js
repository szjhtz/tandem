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
      <div class="row-between mb">
        <h3 style="display:flex;align-items:center;gap:0.5rem;"><i data-feather="cpu" style="color:var(--accent-light);"></i> Node Swarm Orchestrator</h3>
        <span class="status-dot ${pickStatusClass(status.status)}">${escapeHtml(status.status || "idle")}</span>
      </div>
      <p class="muted mb">Dispatch multiple connected Tandem instance routines to solve a problem cooperatively.</p>
      <div class="grid cols-chat gap-sm">
        <input id="swarm-root" value="${escapeHtml(status.workspaceRoot || "")}" placeholder="Workspace Absolute Path" />
        <div class="row w-full" style="width: 100%;">
          <input id="swarm-objective" value="${escapeHtml(status.objective || "Ship a small feature end-to-end")}" placeholder="Objective Prompt" style="flex:1;" />
          <input id="swarm-max" type="number" min="1" value="${escapeHtml(String(status.maxTasks || 3))}" style="width: 80px;" title="Max Tasks" />
          <button id="swarm-start" class="primary" ${status.localEngine ? "" : "disabled"}><i data-feather="play"></i> Start</button>
          <button id="swarm-stop" class="danger"><i data-feather="square"></i> Stop</button>
        </div>
      </div>
      ${status.localEngine ? "" : '<p class="warn mt" style="padding:0.75rem;background:rgba(245,158,11,0.1);border-radius:8px;border:1px solid rgba(245,158,11,0.3);"><i data-feather="alert-triangle"></i> Swarm orchestration is disabled on remote engine URLs. Monitoring remains available.</p>'}
    </div>

    <div class="grid gap mt">
      <div class="card">
        <h3 style="display:flex;align-items:center;gap:0.5rem;margin-bottom:1rem;"><i data-feather="git-merge" style="color:var(--info-color);"></i> Live Agent Flow</h3>
        <div class="wire-wrap" style="background: rgba(3,7,18,0.5); border-color: rgba(255,255,255,0.05);">
          <svg viewBox="0 0 680 240" class="wire-svg">
            <defs>
              <linearGradient id="wire-grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.12"></stop>
                <stop offset="50%" stop-color="#a78bfa" stop-opacity="0.95"></stop>
                <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.12"></stop>
              </linearGradient>
            </defs>
            <line x1="140" y1="120" x2="320" y2="60" class="wire-line wire-line-active" style="stroke-width:1.5;"></line>
            <line x1="140" y1="120" x2="320" y2="120" class="wire-line wire-line-active" style="stroke-width:1.5;"></line>
            <line x1="140" y1="120" x2="320" y2="180" class="wire-line wire-line-active" style="stroke-width:1.5;"></line>
            <line x1="360" y1="60" x2="540" y2="50" class="wire-line wire-line-active" style="stroke-width:1.5;"></line>
            <line x1="360" y1="120" x2="540" y2="120" class="wire-line wire-line-active" style="stroke-width:1.5;"></line>
            <line x1="360" y1="180" x2="540" y2="190" class="wire-line wire-line-active" style="stroke-width:1.5;"></line>

            <circle cx="120" cy="120" r="20" class="node node-active" style="fill:rgba(139,92,246,0.2);stroke:rgba(167,139,250,0.8);"></circle>
            <text x="120" y="152" class="node-label" text-anchor="middle" style="fill:#e2e8f0;font-weight:500;">Manager</text>
            <circle cx="340" cy="60" r="18" class="node node-active" style="fill:rgba(56,189,248,0.1);stroke:rgba(56,189,248,0.6);"></circle>
            <text x="340" y="92" class="node-label" text-anchor="middle" style="fill:#cbd5e1;">Worker</text>
            <circle cx="340" cy="120" r="18" class="node node-active" style="fill:rgba(56,189,248,0.1);stroke:rgba(56,189,248,0.6);"></circle>
            <text x="340" y="152" class="node-label" text-anchor="middle" style="fill:#cbd5e1;">Tester</text>
            <circle cx="340" cy="180" r="18" class="node node-active" style="fill:rgba(56,189,248,0.1);stroke:rgba(56,189,248,0.6);"></circle>
            <text x="340" y="212" class="node-label" text-anchor="middle" style="fill:#cbd5e1;">Reviewer</text>
            
            <circle cx="560" cy="50" r="16" class="node" style="fill:rgba(15,23,42,0.8);stroke:rgba(255,255,255,0.1);"></circle>
            <text x="560" y="80" class="node-label" text-anchor="middle" style="fill:#94a3b8;">Code</text>
            <circle cx="560" cy="120" r="16" class="node" style="fill:rgba(15,23,42,0.8);stroke:rgba(255,255,255,0.1);"></circle>
            <text x="560" y="150" class="node-label" text-anchor="middle" style="fill:#94a3b8;">Tests</text>
            <circle cx="560" cy="190" r="16" class="node" style="fill:rgba(15,23,42,0.8);stroke:rgba(255,255,255,0.1);"></circle>
            <text x="560" y="220" class="node-label" text-anchor="middle" style="fill:#94a3b8;">PR</text>
          </svg>
        </div>
        <div class="grid cols-3 gap-sm mt">
          ${roleSummary
      .map(
        ([role, rec]) =>
          `<div class="metric-card" style="background:rgba(0,0,0,0.2);"><div><strong style="color:var(--accent-light);"><i data-feather="user"></i> ${escapeHtml(role)}</strong></div><div class="muted mt-sm">${rec.total} Tasks Processed</div><div class="muted" style="font-size:0.8rem;">${rec.running} Active &middot; ${rec.done} Done &middot; <span class="${rec.failed > 0 ? 'err' : ''}">${rec.failed} Failed</span></div></div>`
      )
      .join("") || '<p class="muted" style="text-align:center;width:100%;grid-column:1/-1;">No active roles orchestrated yet.</p>'}
        </div>
      </div>
    </div>

    <div class="grid cols-2 gap mt">
      <div class="card">
        <div class="row-between mb">
          <h3 style="display:flex;align-items:center;gap:0.5rem;"><i data-feather="git-commit"></i> Timeline</h3>
          <div class="row">
            <select id="swarm-reason-kind" style="width:auto;padding:0.4rem;">
              <option value="">All kinds</option>
              <option value="task_transition">task_transition</option>
              <option value="task_reason">task_reason</option>
            </select>
            <input id="swarm-reason-task" placeholder="Filter task id..." style="width:120px;padding:0.4rem;" />
          </div>
        </div>
        <div id="swarm-reasons" class="timeline mt-sm" style="max-height: 480px;"></div>
      </div>

      <div class="card">
        <div class="row-between mb">
          <h3 style="display:flex;align-items:center;gap:0.5rem;"><i data-feather="layers"></i> Tasks</h3>
          <span class="status-pill info">${tasks.length}</span>
        </div>
        <div id="swarm-tasks" class="list" style="max-height: 480px; overflow: auto; padding-right: 0.5rem;"></div>
      </div>
    </div>

    <div class="card mt">
      <h3 style="display:flex;align-items:center;gap:0.5rem;margin-bottom:1rem;"><i data-feather="terminal"></i> Technical Logs</h3>
      <pre id="swarm-logs" class="code" style="background:rgba(0,0,0,0.4); border-radius:8px; padding:1rem; border:1px solid rgba(255,255,255,0.05); max-height:400px; overflow:auto;"></pre>
    </div>
  `;

  if (window.feather) window.feather.replace();

  const taskList = byId("swarm-tasks");
  taskList.innerHTML =
    tasks
      .sort((a, b) => (b.lastUpdateMs || 0) - (a.lastUpdateMs || 0))
      .map(
        (t) => `<div class="list-item static" style="margin-bottom:0.5rem;">
          <div class="row-between">
            <strong style="color:var(--info-color);font-family:var(--font-mono);font-size:0.85rem;">${escapeHtml(t.taskId)}</strong>
            <span class="status-dot ${pickStatusClass(t.status)}">${escapeHtml(t.status || "unknown")}</span>
          </div>
          <div class="muted mt-sm" style="font-size:0.8rem;text-transform:uppercase;letter-spacing:0.05em;"><i data-feather="user" style="width:12px;height:12px;"></i> ${escapeHtml(t.ownerRole || "No Owner")}</div>
          <div class="muted mt-sm" style="font-size:0.85rem;line-height:1.4;">${escapeHtml(t.statusReason || "Processing")}</div>
        </div>`
      )
      .join("") || '<p class="muted" style="text-align:center;padding:2rem;">No swarm tasks logged in this session.</p>';
  if (window.feather) window.feather.replace(taskList);

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
