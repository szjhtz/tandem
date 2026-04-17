import { useEffect } from "react";

type UseSelectedRunLifecycleArgs = {
  enabled: boolean;
  availableSessionIds: string[];
  queryClient: any;
  selectedRunId: string;
  selectedContextRunId: string;
  onSelectRunId: (runId: string) => void;
  setSelectedSessionId: (value: string | ((current: string) => string)) => void;
  setSelectedSessionFilterId: (value: string | ((current: string) => string)) => void;
  setRunEvents: (value: any[]) => void;
  setSelectedLogSource: (value: "all" | "automations" | "context" | "global") => void;
  setSelectedBoardTaskId: (value: string) => void;
  setSessionEvents: (value: any[]) => void;
  setSessionLogPinnedToBottom: (value: boolean) => void;
};

export function useSelectedRunLifecycle({
  enabled,
  availableSessionIds,
  queryClient,
  selectedRunId,
  selectedContextRunId,
  onSelectRunId,
  setSelectedSessionId,
  setSelectedSessionFilterId,
  setRunEvents,
  setSelectedLogSource,
  setSelectedBoardTaskId,
  setSessionEvents,
  setSessionLogPinnedToBottom,
}: UseSelectedRunLifecycleArgs) {
  useEffect(() => {
    if (!enabled) return;
    setSelectedSessionId((current) => {
      if (current && availableSessionIds.includes(current)) return current;
      return availableSessionIds[0] || "";
    });
  }, [availableSessionIds, enabled, setSelectedSessionId]);

  useEffect(() => {
    if (!enabled) return;
    setSelectedSessionFilterId((current) => {
      if (current === "all") return current;
      if (current && availableSessionIds.includes(current)) return current;
      return "all";
    });
  }, [availableSessionIds, enabled, setSelectedSessionFilterId]);

  useEffect(() => {
    if (!enabled) return;
    setRunEvents([]);
    setSelectedLogSource("all");
    setSelectedBoardTaskId("");
    setSessionEvents([]);
    setSessionLogPinnedToBottom(true);
  }, [
    selectedRunId,
    selectedContextRunId,
    setRunEvents,
    setSelectedLogSource,
    setSelectedBoardTaskId,
    setSessionEvents,
    setSessionLogPinnedToBottom,
    enabled,
  ]);

  useEffect(() => {
    if (!enabled || !selectedRunId) return;
    const refreshSelectedRun = () => {
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["automations", "run", selectedRunId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["automations", "run", "events", selectedRunId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["automations", "run", "artifacts", selectedRunId],
        }),
        selectedContextRunId
          ? queryClient.invalidateQueries({
              queryKey: ["automations", "run", "context", selectedContextRunId],
            })
          : Promise.resolve(),
        selectedContextRunId
          ? queryClient.invalidateQueries({
              queryKey: ["automations", "run", "context", selectedContextRunId, "blackboard"],
            })
          : Promise.resolve(),
        selectedContextRunId
          ? queryClient.invalidateQueries({
              queryKey: ["automations", "run", "context", selectedContextRunId, "events"],
            })
          : Promise.resolve(),
        selectedContextRunId
          ? queryClient.invalidateQueries({
              queryKey: ["automations", "run", "context", selectedContextRunId, "patches"],
            })
          : Promise.resolve(),
        queryClient.invalidateQueries({
          queryKey: ["automations", "run", "session", selectedRunId],
        }),
      ]);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      refreshSelectedRun();
    };
    window.addEventListener("focus", refreshSelectedRun);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", refreshSelectedRun);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, queryClient, selectedContextRunId, selectedRunId]);

  useEffect(() => {
    if (!enabled || !selectedRunId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onSelectRunId("");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, onSelectRunId, selectedRunId]);
}
