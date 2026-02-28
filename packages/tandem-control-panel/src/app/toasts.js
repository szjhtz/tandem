import { byId, escapeHtml } from "./dom.js";

export function createToasts(state) {
  function resolveHost() {
    let host = byId("toasts");
    if (!host) {
      host = document.createElement("div");
      host.id = "toasts";
      host.className = "toasts";
      document.body.appendChild(host);
    }
    return host;
  }

  function render() {
    const host = resolveHost();
    host.innerHTML = state.toasts
      .map((t) => `<div class="toast toast-${t.kind}">${escapeHtml(t.text)}</div>`)
      .join("");
  }

  function toast(kind, text) {
    const id = Math.random().toString(36).slice(2);
    state.toasts.push({ id, kind, text });
    state.toasts = state.toasts.slice(-4);
    render();

    setTimeout(() => {
      state.toasts = state.toasts.filter((t) => t.id !== id);
      render();
    }, 3500);
  }

  return { toast, renderToasts: render };
}
