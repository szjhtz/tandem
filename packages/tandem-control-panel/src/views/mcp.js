export async function renderMcp(ctx) {
  const { state, byId, toast, escapeHtml } = ctx;
  const [servers, tools] = await Promise.all([
    state.client.mcp.list().catch(() => ({})),
    state.client.mcp.listTools().catch(() => []),
  ]);

  byId("view").innerHTML = `
    <div class="grid cols-chat gap">
      <div class="card" style="align-self: start;">
        <h3 style="display:flex;align-items:center;gap:0.5rem;"><i data-feather="box" style="color:var(--accent-light);"></i> Add MCP Server</h3>
        <p class="muted mb">Connect to external Model Context Protocol resources.</p>
        <div class="form-stack">
          <label>Server Name</label>
          <input id="mcp-name" placeholder="e.g. file-system" value="arcade" />
          <label>Transport Coordinates</label>
          <input id="mcp-transport" placeholder="stdio: npx -y ... or https://..." />
          <button id="mcp-add" class="primary mt-sm"><i data-feather="link"></i> Add & Connect</button>
        </div>
      </div>
      <div class="grid gap" style="align-content: start;">
        <div class="card">
          <div class="row-between mb">
            <h3>Connected Servers</h3>
            <span class="status-pill ok">${Object.keys(servers || {}).length}</span>
          </div>
          <div id="mcp-servers" class="list"></div>
        </div>
        <div class="card">
          <div class="row-between">
            <h3>Available Tools</h3>
            <span class="status-pill info">${tools.length}</span>
          </div>
          <pre class="code mt" style="max-height: 250px; overflow: auto; background: rgba(0,0,0,0.3); padding: 1rem; border-radius: 8px;">${escapeHtml(tools.slice(0, 200).map((t) => t.id || JSON.stringify(t)).join("\n") || "No tools exported by connected servers yet.")}</pre>
        </div>
      </div>
    </div>
  `;

  if (window.feather) window.feather.replace();

  byId("mcp-add").addEventListener("click", async () => {
    const name = byId("mcp-name").value.trim();
    const transport = byId("mcp-transport").value.trim();
    if (!name || !transport) return toast("err", "name and transport are required");
    try {
      await state.client.mcp.add({ name, transport, enabled: true });
      await state.client.mcp.connect(name);
      toast("ok", "MCP connected.");
      renderMcp(ctx);
    } catch (e) {
      toast("err", e instanceof Error ? e.message : String(e));
    }
  });

  const list = byId("mcp-servers");
  const rows = Object.entries(servers || {});
  list.innerHTML =
    rows
      .map(
        ([name, cfg]) => `
      <div class="list-item static row-between">
        <div><strong>${escapeHtml(name)}</strong><div class="muted">${escapeHtml(cfg.transport || "")}</div></div>
        <div class="row">
          <button data-c="${name}" class="primary small">Connect</button>
          <button data-r="${name}" class="ghost small">Refresh</button>
          <button data-d="${name}" class="danger small">Delete</button>
        </div>
      </div>
    `
      )
      .join("") || '<p class="muted">No MCP servers configured.</p>';

  list.querySelectorAll("[data-c]").forEach((b) =>
    b.addEventListener("click", async () => {
      try {
        await state.client.mcp.connect(b.dataset.c);
        toast("ok", "Connected.");
      } catch (e) {
        toast("err", e instanceof Error ? e.message : String(e));
      }
    })
  );

  list.querySelectorAll("[data-r]").forEach((b) =>
    b.addEventListener("click", async () => {
      try {
        await state.client.mcp.refresh(b.dataset.r);
        toast("ok", "Refreshed.");
      } catch (e) {
        toast("err", e instanceof Error ? e.message : String(e));
      }
    })
  );

  list.querySelectorAll("[data-d]").forEach((b) =>
    b.addEventListener("click", async () => {
      try {
        await state.client.mcp.delete(b.dataset.d);
        toast("ok", "Deleted.");
        renderMcp(ctx);
      } catch (e) {
        toast("err", e instanceof Error ? e.message : String(e));
      }
    })
  );
}
