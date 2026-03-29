const PLANNER_DRAFT_STORAGE_PREFIX = "tcp.intent-planner.v1";
const PLANNER_NAMED_DRAFT_STORAGE_PREFIX = "tcp.intent-planner.saved.v1";
const PLANNER_DRAFT_HISTORY_STORAGE_PREFIX = "tcp.intent-planner.history.v1";

function safeString(value: unknown) {
  return String(value || "").trim();
}

export function plannerDraftStorageKey(identityName: string) {
  return `${PLANNER_DRAFT_STORAGE_PREFIX}:${safeString(identityName) || "default"}`;
}

export function namedPlannerDraftStoragePrefix(identityName: string) {
  return `${PLANNER_NAMED_DRAFT_STORAGE_PREFIX}:${safeString(identityName) || "default"}`;
}

export function plannerDraftHistoryStorageKey(identityName: string) {
  return `${PLANNER_DRAFT_HISTORY_STORAGE_PREFIX}:${safeString(identityName) || "default"}`;
}

export function loadPlannerDraft<T = Record<string, unknown>>(storageKey: string): T | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as T;
  } catch {
    return null;
  }
}

export function savePlannerDraft(storageKey: string, draft: Record<string, unknown>) {
  if (typeof localStorage === "undefined") return null;
  const updatedAtMs = Date.now();
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...draft,
        updatedAtMs,
      })
    );
    return updatedAtMs;
  } catch {
    return null;
  }
}

function summarizePlannerDraft(storageKey: string, parsed: any) {
  const validationReport = parsed.validationReport || {};
  const overlapAnalysis = parsed.overlapAnalysis || {};
  const messages = Array.isArray(parsed.planningConversation?.messages)
    ? parsed.planningConversation.messages
    : Array.isArray(parsed.conversation?.messages)
      ? parsed.conversation.messages
      : [];
  return {
    storageKey,
    name:
      safeString(parsed.name || parsed.title || parsed.brief?.goal || parsed.goal) ||
      "Untitled planner draft",
    updatedAtMs: Number(parsed.updatedAtMs || 0) || 0,
    planId: safeString(
      parsed.planPackage?.plan_id || parsed.planPreview?.plan_id || parsed.plan?.plan_id
    ),
    planRevision: safeString(
      parsed.planPackage?.plan_revision ||
        parsed.planPackageBundle?.scope_snapshot?.plan_revision ||
        parsed.planPackageBundle?.scopeSnapshot?.planRevision
    ),
    briefGoal: safeString(parsed.brief?.goal || parsed.goal),
    targetSurface: safeString(parsed.brief?.targetSurface || parsed.targetSurface),
    planningHorizon: safeString(parsed.brief?.planningHorizon || parsed.planningHorizon),
    messageCount: messages.length,
    blockerCount: Number(validationReport.blocker_count || validationReport.blockerCount || 0) || 0,
    warningCount: Number(validationReport.warning_count || validationReport.warningCount || 0) || 0,
    hasOverlapMatch: !!safeString(
      overlapAnalysis.matched_plan_id ||
        overlapAnalysis.matchedPlanId ||
        overlapAnalysis.match_layer
    ),
  };
}

function slugify(value: unknown) {
  return safeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function saveNamedPlannerDraft(
  storagePrefix: string,
  draftName: string,
  draft: Record<string, unknown>
) {
  if (typeof localStorage === "undefined") return null;
  const updatedAtMs = Date.now();
  const slug = slugify(draftName) || "draft";
  const storageKey = `${storagePrefix}:${slug}:${updatedAtMs}`;
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...draft,
        name: safeString(draftName) || "Untitled planner draft",
        updatedAtMs,
      })
    );
    return { storageKey, updatedAtMs };
  } catch {
    return null;
  }
}

export type PlannerDraftSummary = {
  storageKey: string;
  name: string;
  updatedAtMs: number;
  planId: string;
  planRevision: string;
  briefGoal: string;
  targetSurface: string;
  planningHorizon: string;
  messageCount: number;
  blockerCount: number;
  warningCount: number;
  hasOverlapMatch: boolean;
};

export function listNamedPlannerDrafts(storagePrefix: string): PlannerDraftSummary[] {
  if (typeof localStorage === "undefined") return [];
  const drafts: PlannerDraftSummary[] = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const storageKey = localStorage.key(index);
      if (!storageKey || !storageKey.startsWith(`${storagePrefix}:`)) continue;
      const raw = localStorage.getItem(storageKey);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") continue;
      drafts.push(summarizePlannerDraft(storageKey, parsed));
    }
  } catch {
    return [];
  }
  return drafts.sort((left, right) => right.updatedAtMs - left.updatedAtMs);
}

export function deleteNamedPlannerDraft(storageKey: string) {
  clearPlannerDraft(storageKey);
}

export type PlannerDraftHistoryEntry = PlannerDraftSummary & {
  entryId: string;
};

function plannerDraftFingerprint(draft: Record<string, unknown>) {
  return JSON.stringify({
    goal: safeString((draft.brief as any)?.goal || draft.goal),
    planId: safeString((draft.planPreview as any)?.plan_id || (draft.plan as any)?.plan_id),
    planRevision: safeString(
      (draft.planPackage as any)?.plan_revision ||
        (draft.planPackageBundle as any)?.scope_snapshot?.plan_revision
    ),
    changeSummary: Array.isArray(draft.planningChangeSummary)
      ? draft.planningChangeSummary
      : Array.isArray(draft.changeSummary)
        ? draft.changeSummary
        : [],
    conversationLength: Array.isArray((draft.planningConversation as any)?.messages)
      ? (draft.planningConversation as any).messages.length
      : Array.isArray((draft.conversation as any)?.messages)
        ? (draft.conversation as any).messages.length
        : 0,
    plannerError: safeString(draft.plannerError),
  });
}

export function appendPlannerDraftHistory(
  historyKey: string,
  draft: Record<string, unknown>,
  maxEntries = 24
) {
  if (typeof localStorage === "undefined") return null;
  const updatedAtMs = Date.now();
  const nextEntry = {
    ...draft,
    entryId: `${updatedAtMs}`,
    updatedAtMs,
    fingerprint: plannerDraftFingerprint(draft),
  };
  try {
    const existing = loadPlannerDraft<any[]>(historyKey) || [];
    const latest = Array.isArray(existing) ? existing[0] : null;
    if (latest?.fingerprint && latest.fingerprint === nextEntry.fingerprint) {
      return latest.entryId || null;
    }
    const limited = [nextEntry, ...(Array.isArray(existing) ? existing : [])].slice(0, maxEntries);
    localStorage.setItem(historyKey, JSON.stringify(limited));
    return nextEntry.entryId;
  } catch {
    return null;
  }
}

export function listPlannerDraftHistory(historyKey: string): PlannerDraftHistoryEntry[] {
  const history = loadPlannerDraft<any[]>(historyKey);
  if (!Array.isArray(history)) return [];
  return history
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({
      entryId: safeString(entry.entryId) || `${Number(entry.updatedAtMs || 0) || 0}`,
      ...summarizePlannerDraft(historyKey, entry),
    }))
    .sort((left, right) => right.updatedAtMs - left.updatedAtMs);
}

export function loadPlannerDraftHistoryEntry<T = Record<string, unknown>>(
  historyKey: string,
  entryId: string
): T | null {
  const history = loadPlannerDraft<any[]>(historyKey);
  if (!Array.isArray(history)) return null;
  const match = history.find((entry) => safeString(entry?.entryId) === safeString(entryId));
  return match && typeof match === "object" ? (match as T) : null;
}

export function deletePlannerDraftHistoryEntry(historyKey: string, entryId: string) {
  if (typeof localStorage === "undefined") return;
  try {
    const history = loadPlannerDraft<any[]>(historyKey);
    if (!Array.isArray(history)) return;
    const next = history.filter((entry) => safeString(entry?.entryId) !== safeString(entryId));
    localStorage.setItem(historyKey, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function clearPlannerDraft(storageKey: string) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // ignore
  }
}
