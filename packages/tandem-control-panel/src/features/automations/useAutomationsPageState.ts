import { useEffect, useState } from "react";

export type ActiveTab = "create" | "calendar" | "list" | "running";
export type CreateMode = "simple" | "advanced" | "composer";

const AUTOMATIONS_STUDIO_HANDOFF_KEY = "tandem.automations.studioHandoff";
const AUTOMATION_COMPOSER_FEATURE_KEY = "tandem.automations.composer.enabled";

function findComposerEnabledFromUrl() {
  if (typeof window === "undefined") return false;
  try {
    const current = new URL(window.location.href);
    const q = current.searchParams.get("composer");
    if (!q) return false;
    const enabled = q.trim().toLowerCase();
    return enabled === "1" || enabled === "true" || enabled === "on" || enabled === "yes";
  } catch {
    return false;
  }
}

function composerEnabledFromStorage() {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(AUTOMATION_COMPOSER_FEATURE_KEY) === "1";
  } catch {
    return false;
  }
}

function initialCreateMode(isComposerEnabled: boolean) {
  if (!isComposerEnabled) return "simple" as const;
  if (typeof window === "undefined") return "simple" as const;
  try {
    const fromHash = window.location.hash.includes("composer=true");
    if (fromHash) return "composer" as const;
  } catch {
    // no-op
  }
  return "simple" as const;
}

export function useAutomationsPageState() {
  const [tab, setTab] = useState<ActiveTab>(() =>
    findComposerEnabledFromUrl() ? "create" : "calendar"
  );
  const [createMode, setCreateMode] = useState<CreateMode>(() =>
    initialCreateMode(composerEnabledFromStorage() || findComposerEnabledFromUrl())
  );
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [advancedEditAutomation, setAdvancedEditAutomation] = useState<any | null>(null);
  const isComposerEnabled = composerEnabledFromStorage() || findComposerEnabledFromUrl();

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(AUTOMATIONS_STUDIO_HANDOFF_KEY);
      if (!raw) return;
      sessionStorage.removeItem(AUTOMATIONS_STUDIO_HANDOFF_KEY);
      const handoff = JSON.parse(raw || "{}");
      if (handoff?.tab === "running") setTab("running");
      const runId = String(handoff?.runId || "").trim();
      if (runId) setSelectedRunId(runId);
    } catch {
      return;
    }
  }, []);

  return {
    tab,
    setTab,
    createMode,
    setCreateMode,
    selectedRunId,
    setSelectedRunId,
    advancedEditAutomation,
    setAdvancedEditAutomation,
    composerEnabled: isComposerEnabled,
  };
}
