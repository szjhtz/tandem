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
        <h3>Global Live Feed</h3>
        <div class="row">
          <input id="feed-filter" placeholder="Filter by event type or payload" />
          <button id="feed-clear" class="ghost small">Clear</button>
        </div>
      </div>
      <div id="feed-events" class="events feed-cards mt-sm"></div>
    </div>
  `;

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
          <article class="event-card">
            <div class="row-between">
              <div><strong>${escapeHtml(type)}</strong></div>
              <span class="status-dot ${statusClassForEvent(type)}">${new Date(x.at).toLocaleTimeString()}</span>
            </div>
            <div class="muted">session: ${escapeHtml(x.data?.sessionID || x.data?.sessionId || "n/a")} run: ${escapeHtml(x.data?.runID || x.data?.runId || "n/a")}</div>
            <details class="mt-sm">
              <summary>Payload</summary>
              <pre class="code">${escapeHtml(JSON.stringify(x.data, null, 2))}</pre>
            </details>
          </article>
        `;
        })
        .join("") || '<p class="muted">No events yet.</p>';

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
