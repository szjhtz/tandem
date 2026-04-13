const PLANNER_SELECTED_SESSION_STORAGE_PREFIX = "tcp.coding-planner.session.v1";
const PLANNER_COMPOSER_DRAFT_STORAGE_PREFIX = "tcp.coding-planner.composer.v1";

function safeString(value: unknown) {
  return String(value || "").trim();
}

function storageKey(prefix: string, projectSlug: string, sessionId = "") {
  const project = safeString(projectSlug) || "default";
  const session = safeString(sessionId);
  return session ? `${prefix}:${project}:${session}` : `${prefix}:${project}`;
}

export function plannerSelectedSessionKey(projectSlug: string) {
  return storageKey(PLANNER_SELECTED_SESSION_STORAGE_PREFIX, projectSlug);
}

export function loadSelectedPlannerSession(projectSlug: string) {
  try {
    return localStorage.getItem(plannerSelectedSessionKey(projectSlug)) || "";
  } catch {
    return "";
  }
}

export function saveSelectedPlannerSession(projectSlug: string, sessionId: string) {
  try {
    const key = plannerSelectedSessionKey(projectSlug);
    const next = safeString(sessionId);
    if (next) localStorage.setItem(key, next);
    else localStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
}

export function clearSelectedPlannerSession(projectSlug: string) {
  saveSelectedPlannerSession(projectSlug, "");
}

export function plannerComposerDraftKey(projectSlug: string, sessionId: string) {
  return storageKey(PLANNER_COMPOSER_DRAFT_STORAGE_PREFIX, projectSlug, sessionId);
}

export function loadPlannerComposerDraft(projectSlug: string, sessionId: string) {
  try {
    return sessionStorage.getItem(plannerComposerDraftKey(projectSlug, sessionId)) || "";
  } catch {
    return "";
  }
}

export function savePlannerComposerDraft(projectSlug: string, sessionId: string, value: string) {
  try {
    const key = plannerComposerDraftKey(projectSlug, sessionId);
    const next = safeString(value);
    if (next) sessionStorage.setItem(key, next);
    else sessionStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
}

export function clearPlannerComposerDraft(projectSlug: string, sessionId: string) {
  savePlannerComposerDraft(projectSlug, sessionId, "");
}
