export async function renderChannels(ctx) {
  const { state, byId, toast, escapeHtml, api, setRoute } = ctx;
  const [status, config] = await Promise.all([
    state.client.channels.status().catch(() => ({})),
    state.client.channels.config().catch(() => ({})),
  ]);
  const channels = ["telegram", "discord", "slack"];
  const readField = (obj, snake, camel, fallback = undefined) => {
    if (!obj || typeof obj !== "object") return fallback;
    if (obj[snake] !== undefined) return obj[snake];
    if (obj[camel] !== undefined) return obj[camel];
    return fallback;
  };
  const usersCsv = (raw) => (Array.isArray(raw) && raw.length ? raw.join(", ") : "*");
  const discordHasToken = !!readField(config.discord || {}, "has_token", "hasToken", false);

  byId("view").innerHTML = `
    <div class="tcp-card">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 class="tcp-title">Moved To Settings</h3>
          <p class="tcp-subtle">Channels is now managed under Settings.</p>
        </div>
        <button id="channels-open-settings" class="tcp-btn"><i data-lucide="settings"></i> Open Settings</button>
      </div>
    </div>
    <div class="tcp-card">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="tcp-title">Channels</h3>
        <i data-lucide="messages-square"></i>
      </div>
      ${
        !discordHasToken
          ? `<div class="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
               <div class="font-semibold">Discord Quick Setup</div>
               <div class="mt-1">1) Create bot and copy token. 2) Enable Message Content Intent. 3) Invite bot with channel send/read permissions. 4) Save then click Verify Discord.</div>
             </div>`
          : ""
      }
      <div id="channels-list" class="tcp-list"></div>
    </div>
  `;
  byId("channels-open-settings")?.addEventListener("click", () => setRoute("settings"));

  const list = byId("channels-list");
  list.innerHTML = channels
    .map((c) => {
      const s = status[c] || {};
      const lastError = readField(s, "last_error", "lastError", "");
      return `
        <div class="tcp-list-item">
          <div class="mb-3 flex items-center justify-between">
            <strong class="capitalize">${c}</strong>
            <span class="${s.connected ? "tcp-badge-ok" : "tcp-badge-warn"}">${s.connected ? "connected" : "not connected"}</span>
          </div>
          <div class="grid gap-3 lg:grid-cols-4">
            <input id="${c}-token" class="tcp-input" placeholder="bot token" />
            <input id="${c}-users" class="tcp-input" placeholder="allowed users (comma, * for all)" />
            ${
              c === "discord"
                ? `<input id="${c}-guild" class="tcp-input" placeholder="guild id (optional)" />`
                : c === "slack"
                  ? `<input id="${c}-channel" class="tcp-input" placeholder="channel id (required for slack)" />`
                  : `<select id="${c}-style" class="tcp-select">
                      <option value="default">style: default</option>
                      <option value="compact">style: compact</option>
                      <option value="friendly">style: friendly</option>
                      <option value="ops">style: ops</option>
                    </select>`
            }
            <div class="flex gap-2">
              <button class="tcp-btn-primary" data-save="${c}"><i data-lucide="save"></i> Save</button>
              ${c === "discord" ? `<button class="tcp-btn" data-verify="${c}">Verify Discord</button>` : ""}
              <button class="tcp-btn-danger" data-del="${c}"><i data-lucide="trash-2"></i></button>
            </div>
          </div>
          <div class="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
            ${c === "telegram" || c === "discord" ? `<label class="inline-flex items-center gap-2"><input id="${c}-mention" type="checkbox" /> mention only</label>` : ""}
            ${c === "discord" ? `<span>Tip: use <code>@bot /help</code> style commands (Discord app slash commands are not registered).</span>` : ""}
          </div>
          ${c === "discord" ? `<div id="${c}-verify-result" class="mt-2 text-xs text-slate-300"></div>` : ""}
          ${lastError ? `<div class="mt-2 text-xs text-rose-300">last error: ${escapeHtml(String(lastError))}</div>` : ""}
        </div>
      `;
    })
    .join("");

  channels.forEach((c) => {
    const cfg = config[c] || {};
    const users = readField(cfg, "allowed_users", "allowedUsers", ["*"]);
    const mentionOnly = !!readField(
      cfg,
      "mention_only",
      "mentionOnly",
      c === "discord"
    );
    const guildId = readField(cfg, "guild_id", "guildId", "");
    const channelId = readField(cfg, "channel_id", "channelId", "");
    const styleProfile = String(readField(cfg, "style_profile", "styleProfile", "default") || "default");
    const hasToken = !!readField(cfg, "has_token", "hasToken", false);

    const tokenEl = byId(`${c}-token`);
    if (tokenEl && hasToken) tokenEl.placeholder = "token configured (leave blank to keep)";
    const usersEl = byId(`${c}-users`);
    if (usersEl) usersEl.value = usersCsv(users);
    const mentionEl = byId(`${c}-mention`);
    if (mentionEl) mentionEl.checked = mentionOnly;
    const guildEl = byId(`${c}-guild`);
    if (guildEl) guildEl.value = guildId || "";
    const channelEl = byId(`${c}-channel`);
    if (channelEl) channelEl.value = channelId || "";
    const styleEl = byId(`${c}-style`);
    if (styleEl) styleEl.value = styleProfile;
  });

  const buildPayload = (ch) => {
    const token = byId(`${ch}-token`).value.trim();
    const users = byId(`${ch}-users`).value.trim();
    const payload = {
      bot_token: token,
      allowed_users: users ? users.split(",").map((v) => v.trim()).filter(Boolean) : ["*"],
    };
    if (ch === "telegram" || ch === "discord") {
      payload.mention_only = !!byId(`${ch}-mention`)?.checked;
    }
    if (ch === "telegram") {
      payload.style_profile = String(byId(`${ch}-style`)?.value || "default");
    }
    if (ch === "discord") {
      payload.guild_id = byId(`${ch}-guild`)?.value?.trim() || null;
    }
    if (ch === "slack") {
      payload.channel_id = byId(`${ch}-channel`)?.value?.trim() || null;
    }
    return payload;
  };

  list.querySelectorAll("[data-save]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const ch = btn.dataset.save;
      const payload = buildPayload(ch);
      try {
        await state.client.channels.put(ch, payload);
        toast("ok", `${ch} saved.`);
        renderChannels(ctx);
      } catch (e) {
        toast("err", e instanceof Error ? e.message : String(e));
      }
    })
  );

  list.querySelectorAll("[data-verify]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const ch = btn.dataset.verify;
      const target = byId(`${ch}-verify-result`);
      if (target) {
        target.className = "mt-2 text-xs text-slate-300";
        target.textContent = "Verifying Discord configuration...";
      }
      try {
        const result = await api(`/api/engine/channels/${encodeURIComponent(ch)}/verify`, {
          method: "POST",
          body: JSON.stringify(buildPayload(ch)),
        });
        const checks = readField(result, "checks", "checks", {});
        const hints = readField(result, "hints", "hints", []);
        const ok = !!readField(result, "ok", "ok", false);
        const tokenAuth = !!readField(checks, "token_auth_ok", "tokenAuthOk", false);
        const gatewayOk = !!readField(checks, "gateway_ok", "gatewayOk", false);
        const messageIntent = !!readField(
          checks,
          "message_content_intent_ok",
          "messageContentIntentOk",
          false
        );
        const hintText = Array.isArray(hints) && hints.length > 0 ? String(hints[0]) : "";
        const line = ok
          ? "Verification passed: token/auth, gateway, and Message Content intent are OK."
          : `Verification failed: token=${tokenAuth ? "ok" : "fail"}, gateway=${gatewayOk ? "ok" : "fail"}, message_intent=${messageIntent ? "ok" : "fail"}. ${hintText}`;
        if (target) {
          target.className = `mt-2 text-xs ${ok ? "text-emerald-300" : "text-amber-200"}`;
          target.innerHTML = escapeHtml(line);
        }
        toast(ok ? "ok" : "warn", ok ? "Discord verify passed." : "Discord verify failed.");
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (target) {
          target.className = "mt-2 text-xs text-rose-300";
          target.textContent = `Verify request failed: ${message}`;
        }
        toast("err", message);
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
