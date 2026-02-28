export async function renderChannels(ctx) {
  const { state, byId, toast } = ctx;
  const status = await state.client.channels.status().catch(() => ({}));
  const channels = ["telegram", "discord", "slack"];

  byId("view").innerHTML = '<div class="card"><h3>Channels</h3><div id="channels-list" class="list"></div></div>';

  const list = byId("channels-list");
  list.innerHTML = channels
    .map((c) => {
      const s = status[c] || {};
      return `
        <div class="list-item static">
          <div class="row-between">
            <strong>${c}</strong>
            <span class="status-dot ${s.connected ? "ok" : "warn"}">${s.connected ? "connected" : "not connected"}</span>
          </div>
          <div class="grid cols-3 gap-sm mt-sm">
            <input id="${c}-token" placeholder="bot token" />
            <input id="${c}-users" placeholder="allowed users (comma)" />
            <div class="row">
              <button class="primary small" data-save="${c}">Save</button>
              <button class="danger small" data-del="${c}">Delete</button>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  list.querySelectorAll("[data-save]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const ch = btn.dataset.save;
      const token = byId(`${ch}-token`).value.trim();
      const users = byId(`${ch}-users`).value.trim();
      try {
        await state.client.channels.put(ch, {
          bot_token: token,
          allowed_users: users ? users.split(",").map((v) => v.trim()).filter(Boolean) : ["*"],
        });
        toast("ok", `${ch} saved.`);
        renderChannels(ctx);
      } catch (e) {
        toast("err", e instanceof Error ? e.message : String(e));
      }
    })
  );

  list.querySelectorAll("[data-del]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const ch = btn.dataset.del;
      try {
        await state.client.channels.delete(ch);
        toast("ok", `${ch} deleted.`);
        renderChannels(ctx);
      } catch (e) {
        toast("err", e instanceof Error ? e.message : String(e));
      }
    })
  );
}
