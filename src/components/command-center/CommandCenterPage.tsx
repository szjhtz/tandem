import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui";
import { AgentCommandCenter } from "@/components/orchestrate/AgentCommandCenter";
import { onSidecarEventV2, type StreamEventEnvelopeV2 } from "@/lib/tauri";
import type { RunSnapshot, Task } from "@/components/orchestrate/types";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";

type QualityPreset = "speed" | "balanced" | "quality";
type SwarmStage = "idle" | "planning" | "awaiting_review" | "executing" | "completed" | "failed";
type TabId = "task-to-swarm" | "advanced";

interface CommandCenterPageProps {
  onOpenOrchestrator: (runId?: string | null) => void;
}

function stageFromSnapshot(snapshot: RunSnapshot | null): SwarmStage {
  if (!snapshot) return "idle";
  if (snapshot.status === "planning") return "planning";
  if (snapshot.status === "awaiting_approval") return "awaiting_review";
  if (snapshot.status === "executing" || snapshot.status === "paused") return "executing";
  if (snapshot.status === "completed") return "completed";
  if (snapshot.status === "failed" || snapshot.status === "cancelled") return "failed";
  return "idle";
}

export function CommandCenterPage({ onOpenOrchestrator }: CommandCenterPageProps) {
  const [tab, setTab] = useState<TabId>("task-to-swarm");
  const [objective, setObjective] = useState("");
  const [preset, setPreset] = useState<QualityPreset>("balanced");
  const [runId, setRunId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [eventFeed, setEventFeed] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stage = stageFromSnapshot(snapshot);

  useEffect(() => {
    let disposed = false;
    if (!runId) {
      setSnapshot(null);
      setTasks([]);
      return;
    }

    const poll = async () => {
      try {
        const [nextSnapshot, nextTasks] = await Promise.all([
          invoke<RunSnapshot>("orchestrator_get_run", { runId }),
          invoke<Task[]>("orchestrator_list_tasks", { runId }),
        ]);
        if (disposed) return;
        setSnapshot(nextSnapshot);
        setTasks(nextTasks);
      } catch {
        if (disposed) return;
      }
    };

    void poll();
    const timer = setInterval(() => void poll(), 1250);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [runId]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const setup = async () => {
      unlisten = await onSidecarEventV2((envelope: StreamEventEnvelopeV2) => {
        const payload = envelope?.payload;
        if (!payload || payload.type !== "raw") return;
        if (
          !payload.event_type.startsWith("agent_team.") &&
          !payload.event_type.startsWith("session.run.")
        ) {
          return;
        }
        const at = new Date().toLocaleTimeString();
        setEventFeed((prev) => [`${at} ${payload.event_type}`, ...prev].slice(0, 12));
      });
    };
    void setup();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const launchSwarm = async () => {
    if (!objective.trim()) {
      setError("Please enter an objective.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const configByPreset = {
        speed: { max_parallel_tasks: 6, llm_parallel: 4 },
        balanced: { max_parallel_tasks: 4, llm_parallel: 3 },
        quality: { max_parallel_tasks: 2, llm_parallel: 2 },
      } as const;
      const config = {
        max_total_tokens: 250_000,
        max_tokens_per_step: 25_000,
        max_steps: 0,
        max_parallel_tasks: configByPreset[preset].max_parallel_tasks,
        llm_parallel: configByPreset[preset].llm_parallel,
        fs_write_parallel: 1,
        shell_parallel: 1,
        network_parallel: 2,
      };
      const createdRunId = await invoke<string>("orchestrator_create_run", {
        objective: objective.trim(),
        config,
      });
      setRunId(createdRunId);
      await invoke("orchestrator_start", { runId: createdRunId });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  };

  const approvePlan = async () => {
    if (!runId) return;
    setIsLoading(true);
    setError(null);
    try {
      await invoke("orchestrator_approve", { runId });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  };

  const pendingTasks = useMemo(() => tasks.filter((task) => task.state !== "done").length, [tasks]);

  return (
    <div className="h-full w-full overflow-y-auto app-background p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-text">Command Center</h2>
              <p className="text-sm text-text-muted">
                Launch swarms from one objective, then drill into advanced operator controls.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant={tab === "task-to-swarm" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setTab("task-to-swarm")}
              >
                Task to Swarm
              </Button>
              <Button
                variant={tab === "advanced" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setTab("advanced")}
              >
                Advanced Controls
              </Button>
            </div>
          </div>
        </div>

        {tab === "task-to-swarm" ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2 rounded-lg border border-border bg-surface p-4 space-y-3">
              <div className="text-xs uppercase tracking-wide text-text-subtle">Objective</div>
              <textarea
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="Describe the task. The orchestrator will plan, delegate workers/reviewers/testers, then execute after your single approval."
                className="min-h-[120px] w-full rounded-lg border border-border bg-surface-elevated p-3 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
              />
              <div className="flex flex-wrap gap-2">
                {(["speed", "balanced", "quality"] as QualityPreset[]).map((nextPreset) => (
                  <button
                    key={nextPreset}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      preset === nextPreset
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border text-text-muted"
                    }`}
                    onClick={() => setPreset(nextPreset)}
                  >
                    {nextPreset}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => void launchSwarm()}
                  disabled={isLoading || !objective.trim()}
                >
                  {isLoading ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1 h-4 w-4" />
                  )}
                  Launch Swarm
                </Button>
                {runId ? (
                  <Button variant="secondary" onClick={() => onOpenOrchestrator(runId)}>
                    Edit in Orchestrator
                  </Button>
                ) : null}
              </div>
              {error ? (
                <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">
                  {error}
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
              <div className="text-xs uppercase tracking-wide text-text-subtle">Live Status</div>
              <div className="text-sm text-text">Stage: {stage.replace("_", " ")}</div>
              <div className="text-xs text-text-muted">Run: {runId || "none"}</div>
              <div className="text-xs text-text-muted">Tasks: {tasks.length}</div>
              <div className="text-xs text-text-muted">Pending: {pendingTasks}</div>
              {stage === "awaiting_review" ? (
                <Button size="sm" onClick={() => void approvePlan()} disabled={isLoading}>
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                  Approve & Execute
                </Button>
              ) : null}
              <div className="text-[11px] text-text-muted">
                Default safety: plan preview first, then one-click approval to execute.
              </div>
            </div>

            <div className="xl:col-span-3 rounded-lg border border-border bg-surface p-4">
              <div className="text-xs uppercase tracking-wide text-text-subtle mb-2">
                Activity Strip
              </div>
              {eventFeed.length === 0 ? (
                <div className="text-xs text-text-muted">
                  Waiting for orchestrator/agent-team events...
                </div>
              ) : (
                <div className="space-y-1 max-h-56 overflow-y-auto">
                  {eventFeed.map((line, idx) => (
                    <div
                      key={`${line}-${idx}`}
                      className="rounded border border-border bg-surface-elevated p-2 text-xs text-text"
                    >
                      {line}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-surface p-3 text-xs text-text-muted">
              Advanced Controls are for operator workflows: manual spawn, approval triage,
              mission/instance cancellation, and forensic exports.
            </div>
            <AgentCommandCenter />
          </div>
        )}
      </div>
    </div>
  );
}
