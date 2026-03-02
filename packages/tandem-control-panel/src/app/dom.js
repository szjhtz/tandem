export function byId(id) {
  return document.getElementById(id);
}

export function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function toClock(ts) {
  return new Date(ts).toLocaleTimeString();
}

export function toDateTime(ts) {
  return new Date(ts).toLocaleString();
}

function createConfirmModalNode({ title, message, confirmLabel, cancelLabel, danger }) {
  const root = document.createElement("div");
  root.className = "tcp-confirm-overlay";
  root.innerHTML = `
    <div class="tcp-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="tcp-confirm-title">
      <h3 id="tcp-confirm-title" class="tcp-confirm-title">${escapeHtml(title)}</h3>
      <p class="tcp-confirm-message">${escapeHtml(message)}</p>
      <div class="tcp-confirm-actions">
        <button type="button" class="tcp-btn" data-confirm-cancel>${escapeHtml(cancelLabel)}</button>
        <button type="button" class="${danger ? "tcp-btn-danger" : "tcp-btn-primary"}" data-confirm-ok>${escapeHtml(confirmLabel)}</button>
      </div>
    </div>
  `;
  return root;
}

export function confirmActionModal(options = {}) {
  const title = String(options.title || "Confirm action");
  const message = String(options.message || "Are you sure?");
  const confirmLabel = String(options.confirmLabel || "Confirm");
  const cancelLabel = String(options.cancelLabel || "Cancel");
  const danger = options.danger !== false;
  const existing = document.querySelector(".tcp-confirm-overlay");
  if (existing) existing.remove();
  const node = createConfirmModalNode({ title, message, confirmLabel, cancelLabel, danger });
  document.body.appendChild(node);
  const cancelBtn = node.querySelector("[data-confirm-cancel]");
  const confirmBtn = node.querySelector("[data-confirm-ok]");
  if (confirmBtn instanceof HTMLElement) confirmBtn.focus();
  return new Promise((resolve) => {
    const cleanup = (result) => {
      document.removeEventListener("keydown", onKeyDown);
      node.remove();
      resolve(result);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cleanup(false);
      }
      if (event.key === "Enter") {
        event.preventDefault();
        cleanup(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    node.addEventListener("click", (event) => {
      if (event.target === node) cleanup(false);
    });
    cancelBtn?.addEventListener("click", () => cleanup(false));
    confirmBtn?.addEventListener("click", () => cleanup(true));
  });
}
