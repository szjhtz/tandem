export async function renderDashboard(ctx) {
  const { api, state, byId, escapeHtml, setRoute } = ctx;
  const health = await api("/api/system/health").catch(() => ({}));
  const provider = await state.client.providers.config().catch(() => ({ default: null, providers: {} }));
  const channels = await state.client.channels.status().catch(() => ({}));
  const routines = await state.client.routines.list().catch(() => ({ routines: [] }));
  const automations = await state.client.automations.list().catch(() => ({ automations: [] }));

  byId("view").innerHTML = `
    <div class="grid cols-4 gap">
      <div class="card"><h4>Engine</h4><div class="metric">${escapeHtml(health.engine?.version || "unknown")}</div><p>${health.engine?.ready || health.engine?.healthy ? "Healthy" : "Unhealthy"}</p></div>
      <div class="card"><h4>Provider</h4><div class="metric">${escapeHtml(provider.default || "none")}</div><p>Default model configured</p></div>
      <div class="card"><h4>Channels</h4><div class="metric">${Object.values(channels || {}).filter((c) => c?.connected).length}</div><p>Connected integrations</p></div>
      <div class="card"><h4>Scheduled</h4><div class="metric">${(routines.routines || []).length + (automations.automations || []).length}</div><p>Routines + automations</p></div>
    </div>
    <div class="card mt">
      <h3>Quick Actions</h3>
      <div class="row-wrap">
        <button class="quick" data-goto="chat">Open Chat</button>
        <button class="quick" data-goto="agents">Manage Routines</button>
        <button class="quick" data-goto="swarm">Launch Swarm</button>
        <button class="quick" data-goto="mcp">Connect MCP</button>
      </div>
    </div>
  `;

  byId("view").querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => setRoute(btn.dataset.goto));
  });
}
