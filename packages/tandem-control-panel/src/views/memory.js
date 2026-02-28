export async function renderMemory(ctx) {
  const { state, byId, toast, escapeHtml } = ctx;
  const data = await state.client.memory.list({ limit: 100 }).catch(() => ({ items: [] }));
  const items = data.items || [];

  byId("view").innerHTML = `
    <div class="card">
      <div class="row-between mb">
        <h3 style="display:flex;align-items:center;gap:0.5rem;"><i data-feather="database" style="color:var(--info-color);"></i> Semantic Memory</h3>
        <span class="status-pill ok">${items.length} records</span>
      </div>
      <div class="grid cols-3 gap-sm">
        <input id="mem-query" placeholder="Search knowledge..." />
        <button id="mem-search" class="primary"><i data-feather="search"></i> Search</button>
        <button id="mem-refresh" class="ghost"><i data-feather="refresh-ccw"></i></button>
      </div>
      <div id="mem-results" class="list mt"></div>
    </div>
  `;

  if (window.feather) window.feather.replace();

  const renderRows = (rows) => {
    byId("mem-results").innerHTML =
      rows
        .map(
          (m) => `
      <div class="list-item static row-between">
        <div>
          <strong style="color:var(--accent-light);font-family:var(--font-mono);font-size:0.8rem;">${escapeHtml(m.id || "(no id)")}</strong>
          <div class="muted mt-sm" style="font-size:0.85rem;line-height:1.4;">${escapeHtml((m.text || m.content || "").slice(0, 140))}</div>
        </div>
        <button data-del="${escapeHtml(m.id || "")}" class="danger small"><i data-feather="trash-2"></i></button>
      </div>
    `
        )
        .join("") || '<p class="muted" style="text-align:center;padding:2rem;">No semantic memory records found.</p>';
    if (window.feather) window.feather.replace(byId("mem-results"));

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
