export async function renderAgents(ctx) {
  const { state, byId, toast, escapeHtml } = ctx;
  const [routinesRaw, automationsRaw] = await Promise.all([
    state.client.routines.list().catch(() => ({ routines: [] })),
    state.client.automations.list().catch(() => ({ automations: [] })),
  ]);
  const routines = routinesRaw.routines || [];
  const automations = automationsRaw.automations || [];

  byId("view").innerHTML = `
    <div class="card">
      <h3>Create Routine</h3>
      <div class="grid cols-3 gap-sm">
        <input id="routine-name" placeholder="Routine name" />
        <input id="routine-cron" placeholder="Cron e.g. 0 * * * *" />
        <button id="create-routine" class="primary">Create</button>
      </div>
      <textarea id="routine-prompt" rows="3" placeholder="Entrypoint prompt"></textarea>
    </div>
    <div class="card mt">
      <h3>Routines (${routines.length})</h3>
      <div id="routine-list" class="list"></div>
    </div>
    <div class="card mt">
      <h3>Automations (${automations.length})</h3>
      <div class="list">${automations.map((r) => `<div class="list-item static">${escapeHtml(r.name || r.id)}<span class="muted">${escapeHtml(String(r.status || ""))}</span></div>`).join("") || '<p class="muted">No automations.</p>'}</div>
    </div>
  `;

  const routineList = byId("routine-list");
  routineList.innerHTML =
    routines
      .map(
        (r) => `
      <div class="list-item static row-between">
        <div>
          <div>${escapeHtml(r.name || r.id)}</div>
          <div class="muted">${escapeHtml(typeof r.schedule === "string" ? r.schedule : JSON.stringify(r.schedule || {}))}</div>
        </div>
        <div class="row">
          <button data-run="${r.id}" class="primary small">Run</button>
          <button data-del="${r.id}" class="danger small">Delete</button>
        </div>
      </div>`
      )
      .join("") || '<p class="muted">No routines.</p>';

  routineList.querySelectorAll("[data-run]").forEach((b) =>
    b.addEventListener("click", async () => {
      try {
        await state.client.routines.runNow(b.dataset.run);
        toast("ok", "Routine triggered.");
      } catch (e) {
        toast("err", e instanceof Error ? e.message : String(e));
      }
    })
  );

  routineList.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", async () => {
      try {
        await state.client.routines.delete(b.dataset.del);
        toast("ok", "Routine deleted.");
        renderAgents(ctx);
      } catch (e) {
        toast("err", e instanceof Error ? e.message : String(e));
      }
    })
  );

  byId("create-routine").addEventListener("click", async () => {
    try {
      const name = byId("routine-name").value.trim();
      const cron = byId("routine-cron").value.trim();
      const prompt = byId("routine-prompt").value.trim();
      if (!name || !prompt) throw new Error("Name and prompt are required.");
      await state.client.routines.create({
        name,
        entrypoint: prompt,
        schedule: cron ? { type: "cron", cron } : { type: "manual" },
      });
      toast("ok", "Routine created.");
      renderAgents(ctx);
    } catch (e) {
      toast("err", e instanceof Error ? e.message : String(e));
    }
  });
}
