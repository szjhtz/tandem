export async function renderSettings(ctx) {
  const { byId, state, escapeHtml } = ctx;
  byId("view").innerHTML = `
    <div class="card">
      <div class="row-between">
        <h3 style="display:flex;align-items:center;gap:0.5rem;"><i data-feather="settings" style="color:var(--accent-light);"></i> Provider Setup Wizard</h3>
        <span class="status-pill ${state.providerReady ? "ok" : "warn"}">${state.providerReady ? "Ready" : "Not Configured"}</span>
      </div>
      <p class="muted mb">Step 1: Pick a provider and model. Step 2: Add key (if required). Step 3: Run model test.</p>
      <div class="row-wrap mt-sm mb">
        <span class="status-dot ${state.providerDefault ? "ok" : "warn"}">Default: <strong style="color:white;margin-left:4px;">${escapeHtml(state.providerDefault || "none")}</strong></span>
        <span class="status-dot ${state.providerConnected.length > 0 ? "info" : "warn"}">Connected: <strong style="color:white;margin-left:4px;">${state.providerConnected.length}</strong></span>
      </div>
      ${state.providerError ? `<p class="warn" style="padding:0.75rem;background:rgba(245,158,11,0.1);border-radius:8px;border:1px solid rgba(245,158,11,0.3);"><i data-feather="alert-triangle"></i> Provider check error: ${escapeHtml(state.providerError)}</p>` : ""}
      <div id="provider-settings" class="mt"></div>
    </div>
    <div class="card mt">
      <h3 style="display:flex;align-items:center;gap:0.5rem;"><i data-feather="shield" style="color:var(--warn-color);"></i> Session Authorization</h3>
      <p class="muted">Your session token binding is active. Use Logout in the sidebar to clear your current portal session.</p>
    </div>
  `;
  if (window.feather) window.feather.replace();
  await renderProvidersBlock(ctx, byId("provider-settings"));
}

async function renderProvidersBlock(ctx, container) {
  const { state, toast, escapeHtml, providerHints, refreshProviderStatus } = ctx;
  const catalog = await state.client.providers.catalog();
  const config = await state.client.providers.config();
  let selectedProvider = catalog.default || config.default || catalog.all?.[0]?.id || "";
  let selectedModel = "";

  const getModels = () => {
    const entry = (catalog.all || []).find((p) => p.id === selectedProvider);
    return Object.keys(entry?.models || {});
  };

  const syncModel = () => {
    const models = getModels();
    const cfg = config.providers?.[selectedProvider] || {};
    selectedModel = cfg.defaultModel || cfg.default_model || models[0] || "";
  };
  syncModel();

  const render = () => {
    const models = getModels();
    container.innerHTML = `
      <div class="grid cols-2 gap-sm">
        ${(catalog.all || [])
        .map((p) => `<button class="primary" style="${p.id === selectedProvider ? "" : "background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.1);color:var(--text-muted);box-shadow:none;"}" data-provider="${p.id}">${escapeHtml(providerHints[p.id]?.label || p.name || p.id)}</button>`)
        .join("")}
      </div>
      <div class="grid cols-2 gap-sm mt">
        <select id="provider-model" style="height:100%;">${models.map((m) => `<option ${m === selectedModel ? "selected" : ""}>${escapeHtml(m)}</option>`).join("")}</select>
        <input id="provider-key" type="password" placeholder="${escapeHtml(providerHints[selectedProvider]?.placeholder || "API key (optional)")}" />
      </div>
      <div class="row-between mt">
        <button id="provider-test" class="ghost"><i data-feather="zap"></i> Test Model</button>
        <button id="provider-save" class="primary"><i data-feather="save"></i> Save Provider Configuration</button>
      </div>
    `;
    if (window.feather) window.feather.replace(container);

    container.querySelectorAll("[data-provider]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedProvider = btn.dataset.provider;
        syncModel();
        render();
      });
    });

    container.querySelector("#provider-model").addEventListener("change", (e) => {
      selectedModel = e.target.value;
    });

    container.querySelector("#provider-save").addEventListener("click", async () => {
      const key = container.querySelector("#provider-key").value.trim();
      try {
        if (key) await state.client.providers.setApiKey(selectedProvider, key);
        await state.client.providers.setDefaults(selectedProvider, selectedModel);
        await refreshProviderStatus();
        toast("ok", "Provider configuration saved.");
        renderSettings(ctx);
      } catch (e) {
        toast("err", e instanceof Error ? e.message : String(e));
      }
    });

    container.querySelector("#provider-test").addEventListener("click", async () => {
      try {
        const sid = await state.client.sessions.create({ title: `Provider test ${new Date().toISOString()}` });
        const { runId } = await state.client.sessions.promptAsync(sid, "Reply with exactly: READY");
        let sawResponse = false;
        for await (const event of state.client.stream(sid, runId)) {
          if (event.type === "session.response") {
            const delta = String(event.properties?.delta || "").trim();
            if (delta) sawResponse = true;
          }
          if (event.type === "run.complete" || event.type === "run.failed" || event.type === "session.run.finished") break;
        }
        if (!sawResponse) throw new Error("No model tokens received. Check provider key/model selection.");
        await refreshProviderStatus();
        toast("ok", "Model run test succeeded.");
      } catch (e) {
        toast("err", e instanceof Error ? e.message : String(e));
      }
    });
  };

  render();
}
