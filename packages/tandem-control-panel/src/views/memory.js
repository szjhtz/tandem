export async function renderMemory(ctx) {
  const { state, byId, toast, escapeHtml } = ctx;
  const data = await state.client.memory.list({ limit: 100 }).catch(() => ({ items: [] }));
  const items = data.items || [];

  byId("view").innerHTML = `
    <div class="card">
      <h3>Memory</h3>
      <div class="grid cols-3 gap-sm">
        <input id="mem-query" placeholder="Search query" />
        <button id="mem-search" class="primary">Search</button>
        <button id="mem-refresh" class="ghost">Refresh</button>
      </div>
      <div id="mem-results" class="list mt-sm"></div>
    </div>
  `;

  const renderRows = (rows) => {
    byId("mem-results").innerHTML =
      rows
        .map(
          (m) => `
      <div class="list-item static row-between">
        <div><strong>${escapeHtml(m.id || "(no id)")}</strong><div class="muted">${escapeHtml((m.text || m.content || "").slice(0, 140))}</div></div>
        <button data-del="${escapeHtml(m.id || "")}" class="danger small">Delete</button>
      </div>
    `
        )
        .join("") || '<p class="muted">No memory records.</p>';

    byId("mem-results").querySelectorAll("[data-del]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const id = btn.dataset.del;
        if (!id) return;
        try {
          await state.client.memory.delete(id);
          toast("ok", "Memory deleted.");
          renderMemory(ctx);
        } catch (e) {
          toast("err", e instanceof Error ? e.message : String(e));
        }
      })
    );
  };

  renderRows(items);

  byId("mem-refresh").addEventListener("click", () => renderMemory(ctx));
  byId("mem-search").addEventListener("click", async () => {
    const q = byId("mem-query").value.trim();
    if (!q) return renderRows(items);
    try {
      const result = await state.client.memory.search({ query: q, limit: 50 });
      renderRows(result.results || []);
    } catch (e) {
      toast("err", e instanceof Error ? e.message : String(e));
    }
  });
}
