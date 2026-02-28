export async function renderSettings(ctx) {
  const { byId, state, escapeHtml } = ctx;
  byId("view").innerHTML = `
    <div class="card">
      <h3>Provider Setup Wizard</h3>
      <p class="muted">Step 1: pick a provider and model. Step 2: add key (if required). Step 3: run model test.</p>
      <div class="row-wrap mt-sm">
        <span class="status-dot ${state.providerReady ? "ok" : "warn"}">ready: ${state.providerReady ? "yes" : "no"}</span>
        <span class="status-dot ${state.providerDefault ? "ok" : "warn"}">default: ${escapeHtml(state.providerDefault || "none")}</span>
        <span class="status-dot ${state.providerConnected.length > 0 ? "ok" : "warn"}">connected: ${state.providerConnected.length}</span>
      </div>
      ${state.providerError ? `<p class="warn">Provider check error: ${escapeHtml(state.providerError)}</p>` : ""}
      <div id="provider-settings" class="mt-sm"></div>
    </div>
    <div class="card mt"><h3>Session</h3><p>Use Logout to clear your current portal session token binding.</p></div>
  `;
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
          .map((p) => `<button class="provider-pill ${p.id === selectedProvider ? "active" : ""}" data-provider="${p.id}">${escapeHtml(providerHints[p.id]?.label || p.name || p.id)}</button>`)
          .join("")}
      </div>
      <div class="grid cols-2 gap-sm mt-sm">
        <select id="provider-model">${models.map((m) => `<option ${m === selectedModel ? "selected" : ""}>${escapeHtml(m)}</option>`).join("")}</select>
        <input id="provider-key" type="password" placeholder="${escapeHtml(providerHints[selectedProvider]?.placeholder || "API key (optional)")}" />
      </div>
      <div class="row-wrap mt-sm">
        <button id="provider-test" class="ghost">Test Model Run</button>
      </div>
      <div class="row-end mt-sm">
        <button id="provider-save" class="primary">Save Provider</button>
      </div>
    `;

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
