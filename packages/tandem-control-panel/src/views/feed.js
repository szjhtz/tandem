function eventTypeOf(data) {
  return data?.type || data?.event || "event";
}

function statusClassForEvent(type) {
  const t = String(type || "").toLowerCase();
  if (t.includes("fail") || t.includes("error")) return "err";
  if (t.includes("warn") || t.includes("retry")) return "warn";
  return "ok";
}

export async function renderFeed(ctx) {
  const { byId, escapeHtml, state, addCleanup, toast } = ctx;
  byId("view").innerHTML = `
    <div class="card">
      <div class="row-between">
        <h3 style="display:flex;align-items:center;gap:0.5rem;"><i data-feather="activity" style="color:var(--info-color);"></i> Global Live Feed</h3>
        <div class="row">
          <input id="feed-filter" placeholder="Filter events..." style="min-width: 250px;" />
          <button id="feed-clear" class="ghost small">Clear</button>
        </div>
      </div>
      <div id="feed-events" class="events feed-cards mt"></div>
    </div>
  `;

  if (window.feather) window.feather.replace();

  const host = byId("feed-events");
  const events = [];

  function renderEvents() {
    const term = byId("feed-filter").value.trim().toLowerCase();
    const filtered = events.filter((x) => {
      if (!term) return true;
      const hay = `${eventTypeOf(x.data)} ${JSON.stringify(x.data || {})}`.toLowerCase();
      return hay.includes(term);
    });

    host.innerHTML =
      filtered
        .map((x) => {
          const type = eventTypeOf(x.data);
          return `
          <div class="list-item static" style="margin-bottom:0.5rem;">
            <div class="row-between">
              <strong style="font-size: 0.95rem; color: white;">${escapeHtml(type)}</strong>
              <span class="status-dot ${statusClassForEvent(type)}">${new Date(x.at).toLocaleTimeString()}</span>
            </div>
            <div class="muted mt-sm" style="font-size: 0.8rem;">Session: <span style="color:var(--accent-light);font-family:var(--font-mono);">${escapeHtml(x.data?.sessionID || x.data?.sessionId || "N/A")}</span> &nbsp;|&nbsp; Run: <span style="color:var(--accent-light);font-family:var(--font-mono);">${escapeHtml(x.data?.runID || x.data?.runId || "N/A")}</span></div>
            <details class="mt-sm">
              <summary style="cursor:pointer;color:var(--text-muted);font-size:0.8rem;outline:none;">Payload</summary>
              <pre class="code mt-sm" style="background:rgba(0,0,0,0.3);padding:0.5rem;border-radius:8px;border:1px solid rgba(255,255,255,0.05);">${escapeHtml(JSON.stringify(x.data, null, 2))}</pre>
            </details>
          </div>
        `;
        })
        .join("") || '<p class="muted" style="text-align:center;padding:2rem;">Waiting for events...</p>';

    host.scrollTop = host.scrollHeight;
  }

  const evt = new EventSource("/api/engine/global/event", { withCredentials: true });
  evt.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      events.push({ at: Date.now(), data });
      while (events.length > 300) events.shift();
      if (state.route === "feed") renderEvents();
    } catch {
      // ignore
    }
  };

  evt.onerror = () => {
    evt.close();
    toast("err", "Live feed disconnected.");
  };

  byId("feed-filter").addEventListener("input", renderEvents);
  byId("feed-clear").addEventListener("click", () => {
    events.length = 0;
    renderEvents();
  });

  addCleanup(() => evt.close());
  renderEvents();
}
