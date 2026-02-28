function toList(value) {
  return Array.isArray(value) ? value : [];
}

function idOf(record) {
  return record?.id || record?.instanceID || record?.missionID || record?.templateID || "(unknown)";
}

function statusOf(record) {
  return record?.status || record?.state || record?.phase || "unknown";
}

function matchFilter(record, term) {
  if (!term) return true;
  const hay = JSON.stringify(record || {}).toLowerCase();
  return hay.includes(term);
}

function renderRecordCards(rows, emptyText, escapeHtml, titleKey = "id") {
  if (!rows.length) return `<p class="muted">${emptyText}</p>`;
  return rows
    .map((row) => {
      const mainId = escapeHtml(row?.[titleKey] || idOf(row));
      const status = escapeHtml(statusOf(row));
      return `
        <article class="entity-card">
          <div class="row-between">
            <strong>${mainId}</strong>
            <span class="status-dot">${status}</span>
          </div>
          <div class="muted">role: ${escapeHtml(row?.role || row?.ownerRole || "n/a")}</div>
          <div class="muted">mission: ${escapeHtml(row?.missionID || row?.missionId || row?.mission || "n/a")}</div>
          <details class="mt-sm">
            <summary>Details</summary>
            <pre class="code">${escapeHtml(JSON.stringify(row, null, 2))}</pre>
          </details>
        </article>
      `;
    })
    .join("");
}

export async function renderTeams(ctx) {
  const { state, byId, toast, escapeHtml } = ctx;
  const [templatesRaw, instancesRaw, missionsRaw, approvalsRaw] = await Promise.all([
    state.client.agentTeams.listTemplates().catch(() => ({ templates: [] })),
    state.client.agentTeams.listInstances().catch(() => ({ instances: [] })),
    state.client.agentTeams.listMissions().catch(() => ({ missions: [] })),
    state.client.agentTeams.listApprovals().catch(() => ({ spawnApprovals: [] })),
  ]);

  const templates = toList(templatesRaw.templates);
  const instances = toList(instancesRaw.instances);
  const missions = toList(missionsRaw.missions);
  const approvals = toList(approvalsRaw.spawnApprovals);

  byId("view").innerHTML = `
    <div class="card">
      <h3>Spawn Agent Team Instance</h3>
      <div class="grid cols-4 gap-sm">
        <input id="team-mission" placeholder="missionID" />
        <input id="team-role" placeholder="role" value="worker" />
        <input id="team-template" placeholder="templateID" value="worker-default" />
        <button id="team-spawn" class="primary">Spawn</button>
      </div>
    </div>

    <div class="card mt">
      <div class="row-between">
        <h3>Teams & Missions</h3>
        <input id="teams-filter" placeholder="Filter instances/missions/templates" />
      </div>

      <div class="grid cols-2 gap mt-sm">
        <section>
          <div class="row-between"><h4>Approvals (${approvals.length})</h4></div>
          <div id="team-approvals" class="list"></div>
        </section>
        <section>
          <div class="row-between"><h4>Instances (${instances.length})</h4></div>
          <div id="team-instances" class="entity-grid"></div>
        </section>
      </div>

      <div class="grid cols-2 gap mt">
        <section>
          <div class="row-between"><h4>Missions (${missions.length})</h4></div>
          <div id="team-missions" class="entity-grid"></div>
        </section>
        <section>
          <div class="row-between"><h4>Templates (${templates.length})</h4></div>
          <div id="team-templates" class="entity-grid"></div>
        </section>
      </div>
    </div>
  `;

  byId("team-spawn").addEventListener("click", async () => {
    try {
      await state.client.agentTeams.spawn({
        missionID: byId("team-mission").value.trim(),
        role: byId("team-role").value.trim() || "worker",
        templateID: byId("team-template").value.trim() || "worker-default",
        source: "ui_action",
        justification: "spawn from control panel",
      });
      toast("ok", "Spawn requested.");
      renderTeams(ctx);
    } catch (e) {
      toast("err", e instanceof Error ? e.message : String(e));
    }
  });

  function renderFiltered() {
    const term = byId("teams-filter").value.trim().toLowerCase();

    const filteredInstances = instances.filter((rec) => matchFilter(rec, term));
    const filteredMissions = missions.filter((rec) => matchFilter(rec, term));
    const filteredTemplates = templates.filter((rec) => matchFilter(rec, term));

    byId("team-instances").innerHTML = renderRecordCards(filteredInstances, "No instances.", escapeHtml, "instanceID");
    byId("team-missions").innerHTML = renderRecordCards(filteredMissions, "No missions.", escapeHtml, "missionID");
    byId("team-templates").innerHTML = renderRecordCards(filteredTemplates, "No templates.", escapeHtml, "templateID");
  }

  const approvalList = byId("team-approvals");
  approvalList.innerHTML =
    approvals
      .map((a) => {
        const approvalID = escapeHtml(a.approvalID || a.id || "");
        return `
          <div class="list-item static row-between">
            <div>
              <div><strong>${approvalID || "approval"}</strong></div>
              <div class="muted">mission: ${escapeHtml(a.missionID || a.missionId || "n/a")}</div>
            </div>
            <div class="row">
              <button data-ap="${approvalID}" class="primary small">Approve</button>
              <button data-den="${approvalID}" class="danger small">Deny</button>
            </div>
          </div>`;
      })
      .join("") || '<p class="muted">No pending spawn approvals.</p>';

  approvalList.querySelectorAll("[data-ap]").forEach((b) =>
    b.addEventListener("click", async () => {
      try {
        await state.client.agentTeams.approveSpawn(b.dataset.ap, "approved in portal");
        toast("ok", "Approved.");
        renderTeams(ctx);
      } catch (e) {
        toast("err", e instanceof Error ? e.message : String(e));
      }
    })
  );

  approvalList.querySelectorAll("[data-den]").forEach((b) =>
    b.addEventListener("click", async () => {
      try {
        await state.client.agentTeams.denySpawn(b.dataset.den, "denied in portal");
        toast("ok", "Denied.");
        renderTeams(ctx);
      } catch (e) {
        toast("err", e instanceof Error ? e.message : String(e));
      }
    })
  );

  byId("teams-filter").addEventListener("input", renderFiltered);
  renderFiltered();
}
