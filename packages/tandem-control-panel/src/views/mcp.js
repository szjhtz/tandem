export async function renderMcp(ctx) {
  const { state, byId, toast, escapeHtml } = ctx;
  const [servers, tools] = await Promise.all([
    state.client.mcp.list().catch(() => ({})),
    state.client.mcp.listTools().catch(() => []),
  ]);

  byId("view").innerHTML = `
    <div class="card">
      <h3>Add MCP Server</h3>
      <div class="grid cols-3 gap-sm">
        <input id="mcp-name" placeholder="name" value="arcade" />
        <input id="mcp-transport" placeholder="https://.../mcp or stdio:..." />
        <button id="mcp-add" class="primary">Add + Connect</button>
      </div>
    </div>
    <div class="card mt">
      <h3>Servers</h3>
      <div id="mcp-servers" class="list"></div>
    </div>
    <div class="card mt">
      <h3>MCP Tools (${tools.length})</h3>
      <pre class="code">${escapeHtml(tools.slice(0, 200).map((t) => t.id || JSON.stringify(t)).join("\n"))}</pre>
    </div>
  `;

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
