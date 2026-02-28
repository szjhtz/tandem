export async function renderDashboard(ctx) {
  const { api, state, byId, escapeHtml, setRoute } = ctx;
  const health = await api("/api/system/health").catch(() => ({}));
  const provider = await state.client.providers.config().catch(() => ({ default: null, providers: {} }));
  const channels = await state.client.channels.status().catch(() => ({}));
  const routines = await state.client.routines.list().catch(() => ({ routines: [] }));
  const automations = await state.client.automations.list().catch(() => ({ automations: [] }));

  byId("view").innerHTML = `
    < div class="grid cols-4 gap" >
      <div class="card">
        <div class="row-between mb-sm"><h4 style="margin:0;color:var(--text-muted);font-weight:600;font-size:0.8rem;text-transform:uppercase;">Engine</h4> <i data-feather="cpu" style="width:16px;height:16px;color:var(--ok-color);"></i></div>
        <div class="metric" style="margin: 0.5rem 0;">${escapeHtml(health.engine?.version || "unknown")}</div>
        <p style="margin:0;font-size:0.85rem;" class="${health.engine?.ready || health.engine?.healthy ? " ok" : "err"}">${health.engine?.ready || health.engine?.healthy ? "Healthy & Ready" : "Unhealthy"}</p>
      </div >
      <div class="card">
        <div class="row-between mb-sm"><h4 style="margin:0;color:var(--text-muted);font-weight:600;font-size:0.8rem;text-transform:uppercase;">Provider</h4> <i data-feather="zap" style="width:16px;height:16px;color:var(--warn-color);"></i></div>
        <div class="metric" style="margin: 0.5rem 0;">${escapeHtml(provider.default || "none")}</div>
        <p style="margin:0;font-size:0.85rem;color:var(--text-muted);">Default model active</p>
      </div>
      <div class="card">
        <div class="row-between mb-sm"><h4 style="margin:0;color:var(--text-muted);font-weight:600;font-size:0.8rem;text-transform:uppercase;">Channels</h4> <i data-feather="message-circle" style="width:16px;height:16px;color:var(--info-color);"></i></div>
        <div class="metric" style="margin: 0.5rem 0;">${Object.values(channels || {}).filter((c) => c?.connected).length}</div>
        <p style="margin:0;font-size:0.85rem;color:var(--text-muted);">Integrations connected</p>
      </div>
      <div class="card">
        <div class="row-between mb-sm"><h4 style="margin:0;color:var(--text-muted);font-weight:600;font-size:0.8rem;text-transform:uppercase;">Scheduled</h4> <i data-feather="clock" style="width:16px;height:16px;color:var(--accent-light);"></i></div>
        <div class="metric" style="margin: 0.5rem 0;">${(routines.routines || []).length + (automations.automations || []).length}</div>
        <p style="margin:0;font-size:0.85rem;color:var(--text-muted);">Routines & automations</p>
      </div>
    </div >
    <div class="card mt">
      <h3>Quick Actions</h3>
      <div class="grid cols-4 gap mt">
        <button class="ghost-btn card" style="text-align:center;padding:1.5rem;display:flex;flex-direction:column;align-items:center;gap:0.75rem;" data-goto="chat">
          <div class="brand-icon" style="background:rgba(56, 189, 248, 0.1); border-color:rgba(56, 189, 248, 0.2); color:var(--info-color);"><i data-feather="message-square"></i></div>
          <strong style="color:white;font-weight:600;">Open Chat</strong>
        </button>
        <button class="ghost-btn card" style="text-align:center;padding:1.5rem;display:flex;flex-direction:column;align-items:center;gap:0.75rem;" data-goto="agents">
          <div class="brand-icon" style="background:rgba(16, 185, 129, 0.1); border-color:rgba(16, 185, 129, 0.2); color:var(--ok-color);"><i data-feather="terminal"></i></div>
          <strong style="color:white;font-weight:600;">Manage Routines</strong>
        </button>
        <button class="ghost-btn card" style="text-align:center;padding:1.5rem;display:flex;flex-direction:column;align-items:center;gap:0.75rem;" data-goto="swarm">
          <div class="brand-icon" style="background:rgba(245, 158, 11, 0.1); border-color:rgba(245, 158, 11, 0.2); color:var(--warn-color);"><i data-feather="users"></i></div>
          <strong style="color:white;font-weight:600;">Launch Swarm</strong>
        </button>
        <button class="ghost-btn card" style="text-align:center;padding:1.5rem;display:flex;flex-direction:column;align-items:center;gap:0.75rem;" data-goto="mcp">
          <div class="brand-icon" style="background:rgba(139, 92, 246, 0.1); border-color:rgba(139, 92, 246, 0.2); color:var(--accent-light);"><i data-feather="box"></i></div>
          <strong style="color:white;font-weight:600;">Connect MCP</strong>
        </button>
      </div>
    </div>
  `;

  if (window.feather) window.feather.replace();

  byId("view").querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => setRoute(btn.dataset.goto));
  });
}
