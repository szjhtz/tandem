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
