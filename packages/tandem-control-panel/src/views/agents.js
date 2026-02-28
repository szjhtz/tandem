export async function renderAgents(ctx) {
  const { state, byId, toast, escapeHtml } = ctx;
  const [routinesRaw, automationsRaw] = await Promise.all([
    state.client.routines.list().catch(() => ({ routines: [] })),
    state.client.automations.list().catch(() => ({ automations: [] })),
  ]);
  const routines = routinesRaw.routines || [];
  const automations = automationsRaw.automations || [];

  byId("view").innerHTML = `
    <div class="grid cols-chat gap">
      <div class="card">
        <div class="row-between">
          <h3>Create Routine</h3>
          <i data-feather="plus-circle" class="nav-icon" style="color: var(--accent-light);"></i>
        </div>
        <p class="muted">Schedule automatic task executions using standard cron expressions.</p>
        <div class="form-stack mt">
          <label>Routine Name</label>
          <input id="routine-name" placeholder="e.g. Daily Data Backup" />
          <label>Cron Schedule</label>
          <input id="routine-cron" placeholder="0 0 * * * (Leave empty for manual trigger)" />
          <label>Entrypoint Prompt</label>
          <textarea id="routine-prompt" rows="3" placeholder="Describe the task for the agent to complete..."></textarea>
          <button id="create-routine" class="primary mt-sm"><i data-feather="save"></i> Create</button>
        </div>
      </div>
      <div class="grid gap">
        <div class="card">
          <div class="row-between">
            <h3>Active Routines</h3>
            <span class="status-pill ok">${routines.length}</span>
          </div>
          <div id="routine-list" class="list mt"></div>
        </div>
        <div class="card">
          <div class="row-between">
            <h3>Automations</h3>
            <span class="status-pill warn">${automations.length}</span>
          </div>
          <div class="list mt">${automations.map((r) => `<div class="list-item static"><div class="row-between"><strong>${escapeHtml(r.name || r.id)}</strong><span class="muted">${escapeHtml(String(r.status || ""))}</span></div></div>`).join("") || '<p class="muted">No running automations.</p>'}</div>
        </div>
      </div>
    </div>
  `;

  if (window.feather) window.feather.replace();

  const routineList = byId("routine-list");
  routineList.innerHTML =
    routines
      .map(
        (r) => `
      <div class="list-item static row-between">
        <div>
          <div style="font-weight: 500; font-size: 0.95rem; color: white;">${escapeHtml(r.name || r.id)}</div>
          <div class="muted mt-sm" style="font-family: var(--font-mono); font-size: 0.75rem;">${escapeHtml(typeof r.schedule === "string" ? r.schedule : JSON.stringify(r.schedule || {}))}</div>
        </div>
        <div class="row">
          <button data-run="${r.id}" class="primary small"><i data-feather="play"></i> Run</button>
          <button data-del="${r.id}" class="danger small"><i data-feather="trash-2"></i></button>
        </div>
      </div>`
      )
      .join("") || '<p class="muted">No routines configured.</p>';

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
