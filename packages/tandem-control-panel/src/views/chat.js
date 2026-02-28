export async function renderChat(ctx) {
  const { state, byId, toast, escapeHtml } = ctx;
  const list = await state.client.sessions.list({ pageSize: 50 }).catch(() => ({ sessions: [] }));
  const sessions = list.sessions || [];
  if (!state.currentSessionId) state.currentSessionId = sessions[0]?.id || "";

  byId("view").innerHTML = `
    <div class="grid cols-chat gap">
      <div class="card">
        <div class="row-between">
          <h3>Sessions</h3>
          <button id="new-session" class="primary small">New</button>
        </div>
        <div id="session-list" class="list"></div>
      </div>
      <div class="card">
        <h3>Chat</h3>
        <div id="messages" class="messages"></div>
        <div class="row mt-sm">
          <textarea id="chat-input" rows="3" placeholder="Ask anything..."></textarea>
        </div>
        <div class="row-end mt-sm">
          <button id="send-chat" class="primary">Send</button>
        </div>
      </div>
    </div>
  `;

  const listEl = byId("session-list");

  function renderSessions() {
    listEl.innerHTML = sessions
      .map((s) => `<button class="list-item ${s.id === state.currentSessionId ? "active" : ""}" data-sid="${s.id}">${escapeHtml(s.title || s.id.slice(0, 8))}</button>`)
      .join("");

    listEl.querySelectorAll("[data-sid]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        state.currentSessionId = btn.dataset.sid;
        renderSessions();
        await renderMessages();
      });
    });
  }

  async function renderMessages() {
    if (!state.currentSessionId) {
      byId("messages").innerHTML = '<p class="muted">Create a session to begin.</p>';
      return;
    }

    const messages = await state.client.sessions.messages(state.currentSessionId).catch(() => []);
    byId("messages").innerHTML = messages
      .map((m) => {
        const role = escapeHtml(m?.info?.role || "unknown");
        const text = escapeHtml((m.parts || []).map((p) => p.text || "").join("\n"));
        return `<div class="msg"><div class="msg-role">${role}</div><pre>${text}</pre></div>`;
      })
      .join("");

    byId("messages").scrollTop = byId("messages").scrollHeight;
  }

  byId("new-session").addEventListener("click", async () => {
    try {
      const sid = await state.client.sessions.create({ title: `Session ${new Date().toLocaleTimeString()}` });
      const rec = await state.client.sessions.get(sid);
      sessions.unshift(rec);
      state.currentSessionId = sid;
      renderSessions();
      renderMessages();
    } catch (e) {
      toast("err", e instanceof Error ? e.message : String(e));
    }
  });

  byId("send-chat").addEventListener("click", async () => {
    const input = byId("chat-input");
    const prompt = input.value.trim();
    if (!prompt || !state.currentSessionId) return;
    input.value = "";

    try {
      const { runId } = await state.client.sessions.promptAsync(state.currentSessionId, prompt);
      let responseText = "";
      const placeholder = document.createElement("div");
      placeholder.className = "msg";
      placeholder.innerHTML = '<div class="msg-role">assistant</div><pre id="streaming-msg"></pre>';
      byId("messages").appendChild(placeholder);
      const pre = placeholder.querySelector("#streaming-msg");

      for await (const event of state.client.stream(state.currentSessionId, runId)) {
        if (event.type === "session.response") {
          const delta = String(event.properties?.delta || "");
          responseText += delta;
          pre.textContent = responseText;
          byId("messages").scrollTop = byId("messages").scrollHeight;
        }
        if (event.type === "run.complete" || event.type === "run.failed" || event.type === "session.run.finished") break;
      }

      await renderMessages();
    } catch (e) {
      toast("err", e instanceof Error ? e.message : String(e));
      await renderMessages();
    }
  });

  renderSessions();
  await renderMessages();
}
