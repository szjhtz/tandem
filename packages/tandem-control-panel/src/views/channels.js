export async function renderChannels(ctx) {
  const { state, byId, toast } = ctx;
  const status = await state.client.channels.status().catch(() => ({}));
  const channels = ["telegram", "discord", "slack"];

  byId("view").innerHTML = '<div class="card"><div class="row-between"><h3>Connected Channels</h3><i data-feather="message-circle" class="nav-icon" style="color: var(--accent-light);"></i></div><p class="muted">Link your agent to external messaging platforms below.</p><div id="channels-list" class="list mt"></div></div>';

  const list = byId("channels-list");
  list.innerHTML = channels
    .map((c) => {
      const s = status[c] || {};
      return `
        <div class="list-item static">
          <div class="row-between" style="margin-bottom: 1rem;">
            <strong style="text-transform: capitalize; font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem;"><i data-feather="${c === 'telegram' ? 'send' : c === 'discord' ? 'hash' : 'slack'}"></i> ${c}</strong>
            <span class="status-dot ${s.connected ? "ok" : "warn"}">${s.connected ? "Connected Active" : "Disconnected"}</span>
          </div>
          <div class="grid cols-chat gap-sm">
            <input id="${c}-token" placeholder="${c} Bot Token" type="password" />
            <div class="row-between w-full">
              <input id="${c}-users" placeholder="Allowed user handles (comma separated)" style="width: 100%;" />
              <div class="row">
                <button class="primary small" data-save="${c}"><i data-feather="save"></i> Save</button>
                <button class="danger small" data-del="${c}"><i data-feather="trash-2"></i></button>
              </div>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  if (window.feather) window.feather.replace();

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
