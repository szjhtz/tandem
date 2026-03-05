import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { renderIcons } from "../app/icons.js";
import { normalizeMessages } from "../features/chat/messages";
import { saveStoredSessionId } from "../features/chat/session";
import { BudgetMeter } from "../features/orchestration/BudgetMeter";
import { TaskBoard } from "../features/orchestration/TaskBoard";
import type { BudgetUsage, OrchestrationTask, TaskState } from "../features/orchestration/types";
import { useRunRegistry } from "../features/orchestrator/runRegistry";
import {
  buildCursorToken,
  useOrchestratorEvents,
} from "../features/orchestrator/useOrchestratorEvents";
import { EmptyState, PageCard } from "./ui";
import type { AppPageProps } from "./pageTypes";

const DEFAULT_BUDGET: BudgetUsage = {
  max_iterations: 500,
  iterations_used: 0,
  max_tokens: 400000,
  tokens_used: 0,
  max_wall_time_secs: 3600,
  wall_time_secs: 0,
  max_subagent_runs: 2000,
  subagent_runs_used: 0,
  exceeded: false,
  exceeded_reason: "",
};

function normalizeTaskState(status: string): TaskState {
  const value = String(status || "")
    .trim()
    .toLowerCase();
  if (value === "in_progress" || value === "running") return "in_progress";
  if (value === "done" || value === "completed") return "done";
  if (value === "failed" || value === "error" || value === "cancelled" || value === "canceled")
    return "failed";
  if (value === "blocked") return "blocked";
  if (value === "runnable") return "runnable";
  return "pending";
}

function statusBadgeClass(status: string) {
  const s = String(status || "")
    .trim()
    .toLowerCase();
  if (s === "done" || s === "completed" || s === "active") return "tcp-badge-ok";
  if (s === "failed" || s === "error" || s === "cancelled" || s === "canceled")
    return "tcp-badge-err";
  if (s === "running" || s === "in_progress" || s === "runnable") return "tcp-badge-warn";
  return "tcp-badge-info";
}

function runLabelFromTimestamp(ts: unknown) {
  const ms = Number(ts || 0);
  if (!Number.isFinite(ms) || ms <= 0) return "Run";
  return `Run ${new Date(ms).toLocaleTimeString()}`;
}

function runTimestamp(run: any) {
  return Number(run?.updated_at_ms || run?.created_at_ms || 0);
}

function normalizeTasks(payload: any): OrchestrationTask[] {
  const blackboardTasks = Array.isArray(payload?.blackboard?.tasks) ? payload.blackboard.tasks : [];
  if (blackboardTasks.length) {
    return blackboardTasks.map((task: any, index: number) => ({
      id: String(task?.id || `task-${index}`),
      title: String(task?.payload?.title || task?.task_type || task?.id || `Task ${index + 1}`),
      description: String(task?.payload?.description || ""),
      dependencies: Array.isArray(task?.depends_on_task_ids)
        ? task.depends_on_task_ids.map((dep: unknown) => String(dep || "")).filter(Boolean)
        : [],
      state: normalizeTaskState(String(task?.status || "pending")),
      retry_count: Number(task?.retry_count || 0),
      error_message: String(task?.last_error || ""),
      runtime_status: "",
      runtime_detail: "",
      assigned_role: String(task?.assigned_agent || task?.lease_owner || ""),
      workflow_id: String(task?.workflow_id || ""),
      session_id: "",
    }));
  }
  const steps = Array.isArray(payload?.tasks) ? payload.tasks : [];
  return steps.map((step: any, index: number) => ({
    id: String(step?.taskId || step?.step_id || `step-${index}`),
    title: String(step?.title || step?.step_id || `Step ${index + 1}`),
    description: String(step?.description || ""),
    dependencies: Array.isArray(step?.dependsOn)
      ? step.dependsOn.map((dep: unknown) => String(dep || "")).filter(Boolean)
      : [],
    state: normalizeTaskState(String(step?.stepStatus || step?.status || "pending")),
    retry_count: Number(step?.retry_count || 0),
    error_message: String(step?.error_message || ""),
    runtime_status: String(step?.runtime_status || ""),
    runtime_detail: String(step?.runtime_detail || ""),
    assigned_role: String(step?.assignedAgent || ""),
    workflow_id: String(step?.workflowId || ""),
    session_id: String(step?.sessionId || step?.session_id || ""),
  }));
}

export function OrchestratorPage({ api, toast, navigate }: AppPageProps) {
  const queryClient = useQueryClient();
  const reducedMotion = !!useReducedMotion();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [composeMode, setComposeMode] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const [workspaceBrowserOpen, setWorkspaceBrowserOpen] = useState(false);
  const [workspaceBrowserDir, setWorkspaceBrowserDir] = useState("");
  const [workspaceBrowserSearch, setWorkspaceBrowserSearch] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [maxTasks, setMaxTasks] = useState("4");
  const [maxAgents, setMaxAgents] = useState("3");
  const [workflowId, setWorkflowId] = useState("swarm.blackboard.default");
  const [revisionFeedback, setRevisionFeedback] = useState("");
  useEffect(() => {
    setComposeMode(true);
    clearSelectedRunId();
  }, []);

  const statusQuery = useQuery({
    queryKey: ["swarm", "status"],
    queryFn: () => api("/api/orchestrator/status"),
    refetchInterval: 5000,
  });

  const runsQuery = useQuery({
    queryKey: ["swarm", "runs", workspaceRoot],
    queryFn: () =>
      api(`/api/orchestrator/runs?workspace=${encodeURIComponent(workspaceRoot || "")}`),
    refetchInterval: 6000,
    enabled: !!statusQuery.data,
  });

  const runs = Array.isArray(runsQuery.data?.runs) ? runsQuery.data.runs : [];
  const runRegistry = useRunRegistry(runs, String(statusQuery.data?.runId || "").trim());
  const selectedRunId = runRegistry.selectedRunId;
  const setSelectedRunId = runRegistry.setSelectedRunId;
  const clearSelectedRunId = runRegistry.clearSelectedRunId;
  const advanceCursor = runRegistry.advanceCursor;
  const runId = composeMode ? "" : String(selectedRunId || "").trim();
  const orderedRuns = runRegistry.orderedRuns;
  const cursorToken = useMemo(
    () => buildCursorToken(runRegistry.cursorsByRunId),
    [runRegistry.cursorsByRunId]
  );
  const streamWorkspace = String(workspaceRoot || statusQuery.data?.workspaceRoot || "").trim();
  const subscriptionRunIds = useMemo(() => {
    const ids: string[] = [];
    if (selectedRunId) ids.push(selectedRunId);
    for (const run of orderedRuns) {
      const status = String(run?.status || "")
        .trim()
        .toLowerCase();
      if (["completed", "failed", "cancelled"].includes(status)) continue;
      const id = String(run?.run_id || run?.runId || "").trim();
      if (!id || ids.includes(id)) continue;
      ids.push(id);
      if (ids.length >= 6) break;
    }
    return ids;
  }, [orderedRuns, selectedRunId]);
  const lastInvalidateAt = useRef(0);
  const onStreamEnvelope = useCallback(
    (envelope: any) => {
      const kind = String(envelope?.kind || "")
        .trim()
        .toLowerCase();
      const eventRunId = String(envelope?.run_id || envelope?.runId || "").trim();
      const seq = Number(envelope?.seq || 0);
      if (eventRunId && seq > 0 && (kind === "context_run_event" || kind === "blackboard_patch")) {
        advanceCursor(eventRunId, kind, seq);
      }
      const now = Date.now();
      if (now - lastInvalidateAt.current < 900) return;
      lastInvalidateAt.current = now;
      void queryClient.invalidateQueries({ queryKey: ["swarm", "runs"] });
      if (runId) void queryClient.invalidateQueries({ queryKey: ["swarm", "run", runId] });
    },
    [advanceCursor, queryClient, runId]
  );
  useOrchestratorEvents({
    workspace: streamWorkspace,
    runIds: subscriptionRunIds,
    cursorToken,
    onEnvelope: onStreamEnvelope,
  });

  const runQuery = useQuery({
    queryKey: ["swarm", "run", runId],
    queryFn: () => api(`/api/orchestrator/run/${encodeURIComponent(runId)}`),
    refetchInterval: 4000,
    enabled: !!runId,
  });
  const workspaceBrowserQuery = useQuery({
    queryKey: ["swarm", "workspace-browser", workspaceBrowserDir],
    enabled: workspaceBrowserOpen && !!workspaceBrowserDir,
    queryFn: () =>
      api(`/api/orchestrator/workspaces/list?dir=${encodeURIComponent(workspaceBrowserDir)}`),
  });

  const runStatus = String(
    runQuery.data?.runStatus || runQuery.data?.run?.status || statusQuery.data?.status || "idle"
  )
    .trim()
    .toLowerCase();

  const tasks = useMemo(() => normalizeTasks(runQuery.data), [runQuery.data]);
  const budget = useMemo(
    () => ({ ...DEFAULT_BUDGET, ...(runQuery.data?.budget || {}) }),
    [runQuery.data?.budget]
  );
  const workspaceDirectories = Array.isArray(workspaceBrowserQuery.data?.directories)
    ? workspaceBrowserQuery.data.directories
    : [];
  const workspaceSearchQuery = String(workspaceBrowserSearch || "")
    .trim()
    .toLowerCase();
  const filteredWorkspaceDirectories = useMemo(() => {
    if (!workspaceSearchQuery) return workspaceDirectories;
    return workspaceDirectories.filter((entry: any) => {
      const name = String(entry?.name || entry?.path || "")
        .trim()
        .toLowerCase();
      return name.includes(workspaceSearchQuery);
    });
  }, [workspaceDirectories, workspaceSearchQuery]);
  const workspaceParentDir = String(workspaceBrowserQuery.data?.parent || "").trim();
  const workspaceCurrentBrowseDir = String(
    workspaceBrowserQuery.data?.dir || workspaceBrowserDir || ""
  ).trim();

  const latestOutput = useMemo(() => {
    const events = Array.isArray(runQuery.data?.events) ? runQuery.data.events : [];
    let latest: any = null;
    let latestTs = 0;
    for (const evt of events) {
      const type = String(evt?.type || "")
        .trim()
        .toLowerCase();
      if (!["step_completed", "task_completed"].includes(type)) continue;
      const payload = evt?.payload && typeof evt.payload === "object" ? evt.payload : {};
      const sessionId = String(payload?.session_id || "").trim();
      if (!sessionId) continue;
      const ts = Number(evt?.ts_ms || 0);
      if (!latest || ts >= latestTs) {
        latest = { sessionId, event: evt };
        latestTs = ts;
      }
    }
    return latest;
  }, [runQuery.data?.events]);
  const planSource = useMemo(() => {
    const events = Array.isArray(runQuery.data?.events) ? runQuery.data.events : [];
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const row = events[i];
      const type = String(row?.type || "")
        .trim()
        .toLowerCase();
      if (type === "plan_seeded_llm") return "llm";
      if (type === "plan_seeded_local") return "fallback_local";
      if (type === "plan_failed_llm_required") return "llm_failed";
    }
    return "unknown";
  }, [runQuery.data?.events]);

  const outputSessionQuery = useQuery({
    queryKey: ["swarm", "run-output-session", String(latestOutput?.sessionId || "")],
    queryFn: () =>
      api(`/api/engine/session/${encodeURIComponent(String(latestOutput?.sessionId || ""))}`),
    refetchInterval: 6000,
    enabled: !!latestOutput?.sessionId,
  });

  const latestAssistantOutput = useMemo(() => {
    const messages = normalizeMessages(outputSessionQuery.data, "Assistant");
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === "assistant" && String(messages[i]?.text || "").trim())
        return String(messages[i]?.text || "").trim();
    }
    return "";
  }, [outputSessionQuery.data]);

  const startMutation = useMutation({
    mutationFn: () => {
      const objective = String(prompt || "").trim();
      const root = String(workspaceRoot || "").trim();
      if (!objective) throw new Error("Enter a prompt first.");
      if (!root) throw new Error("Set workspace path first.");
      return api("/api/orchestrator/start", {
        method: "POST",
        body: JSON.stringify({
          objective,
          workspaceRoot: root,
          maxTasks: Number(maxTasks || 4),
          maxAgents: Number(maxAgents || 3),
          workflowId: String(workflowId || "swarm.blackboard.default").trim(),
          requireLlmPlan: true,
        }),
      });
    },
    onSuccess: async (payload: any) => {
      const nextRunId = String(payload?.runId || "").trim();
      if (nextRunId) setSelectedRunId(nextRunId);
      setComposeMode(false);
      toast("ok", "Planning started.");
      await queryClient.invalidateQueries({ queryKey: ["swarm"] });
    },
    onError: (error) => toast("err", error instanceof Error ? error.message : String(error)),
  });

  const actionMutation = useMutation({
    mutationFn: ({ path, body }: { path: string; body: any }) =>
      api(path, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: async (payload: any, vars) => {
      if (vars.path === "/api/orchestrator/request_revision") {
        const nextRunId = String(payload?.runId || "").trim();
        if (nextRunId) {
          setSelectedRunId(nextRunId);
          setRevisionFeedback("");
        }
        toast("ok", "Reworked plan created.");
      }
      if (vars.path === "/api/orchestrator/approve") toast("ok", "Execution started.");
      await queryClient.invalidateQueries({ queryKey: ["swarm"] });
    },
    onError: (error) => toast("err", error instanceof Error ? error.message : String(error)),
  });
  const discardMutation = useMutation({
    mutationFn: async (targetRunId: string) => {
      const id = String(targetRunId || "").trim();
      if (!id) throw new Error("Missing run id.");
      await api("/api/orchestrator/cancel", {
        method: "POST",
        body: JSON.stringify({ runId: id }),
      }).catch(() => null);
      await api("/api/orchestrator/runs/hide", {
        method: "POST",
        body: JSON.stringify({ runIds: [id] }),
      }).catch(() => null);
      return id;
    },
    onSuccess: async () => {
      clearSelectedRunId();
      setComposeMode(true);
      setRevisionFeedback("");
      setPrompt("");
      toast("ok", "Discarded pending plan. You can start a new prompt now.");
      await queryClient.invalidateQueries({ queryKey: ["swarm"] });
    },
    onError: (error) => toast("err", error instanceof Error ? error.message : String(error)),
  });
  const goToStartView = useCallback(() => {
    setComposeMode(true);
    clearSelectedRunId();
    setHistoryOpen(false);
    setRevisionFeedback("");
  }, [clearSelectedRunId]);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    renderIcons(root);
  }, [composeMode, historyOpen, orderedRuns, runId, runStatus]);

  const noRunYet = !runId;
  const isPlanning = runStatus === "planning" || runStatus === "queued";
  const isAwaitingApproval = runStatus === "awaiting_approval";
  const isTerminal = ["completed", "failed", "cancelled"].includes(runStatus);
  const canPause = runStatus === "running";
  const canResume = runStatus === "paused";
  const canCancel = [
    "queued",
    "planning",
    "awaiting_approval",
    "running",
    "paused",
    "blocked",
  ].includes(runStatus);
  const historyPanel = (
    <>
      <motion.aside
        className={`chat-sessions-panel ${historyOpen ? "open" : ""}`}
        initial={false}
        animate={
          reducedMotion
            ? { x: historyOpen ? 0 : "-104%" }
            : { x: historyOpen ? 0 : "-104%", transition: { duration: 0.18, ease: "easeOut" } }
        }
      >
        <div className="chat-sessions-header">
          <h3 className="chat-sessions-title">
            <i data-lucide="history"></i>
            History
          </h3>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="tcp-btn h-8 px-2.5 text-xs"
              onClick={() => {
                void queryClient.invalidateQueries({ queryKey: ["swarm", "runs"] });
              }}
            >
              <i data-lucide="refresh-cw"></i>
            </button>
          </div>
        </div>
        <div className="chat-session-list">
          <AnimatePresence>
            {orderedRuns.map((run: any, index: number) => {
              const id = String(run?.run_id || run?.runId || `run-${index}`);
              const active = id === runId;
              return (
                <motion.div
                  key={id}
                  className="chat-session-row"
                  initial={reducedMotion ? false : { opacity: 0, y: 6 }}
                  animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
                  exit={reducedMotion ? undefined : { opacity: 0, y: -6 }}
                >
                  <button
                    type="button"
                    className={`chat-session-btn ${active ? "active" : ""}`}
                    onClick={() => {
                      setComposeMode(false);
                      setSelectedRunId(id);
                      setHistoryOpen(false);
                    }}
                  >
                    <span className="mb-0.5 inline-flex items-center gap-1 text-xs font-medium">
                      <i data-lucide="history"></i>
                      <span>{runLabelFromTimestamp(runTimestamp(run))}</span>
                    </span>
                    <span className="tcp-subtle line-clamp-2 block text-[11px]">
                      {String(run?.objective || "").trim() || "No objective"}
                    </span>
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {!orderedRuns.length ? <p className="chat-rail-empty px-1 py-2">No runs yet.</p> : null}
        </div>
      </motion.aside>
      <AnimatePresence>
        {historyOpen ? (
          <motion.button
            type="button"
            className="chat-scrim open"
            aria-label="Close history"
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={reducedMotion ? undefined : { opacity: 1 }}
            exit={reducedMotion ? undefined : { opacity: 0 }}
            onClick={() => setHistoryOpen(false)}
          />
        ) : null}
      </AnimatePresence>
    </>
  );

  if (noRunYet) {
    const canSend =
      String(prompt || "").trim().length > 0 && String(workspaceRoot || "").trim().length > 0;
    return (
      <>
        <div ref={rootRef} className="chat-layout min-w-0 min-h-0 h-full flex-1">
          {historyPanel}
          <div className="chat-workspace min-h-0 min-w-0">
            <PageCard
              title={
                <span className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    className="chat-icon-btn h-8 w-8"
                    title="History"
                    onClick={() => setHistoryOpen((prev) => !prev)}
                  >
                    <i data-lucide="history"></i>
                  </button>
                  <span>Orchestrator</span>
                </span>
              }
              subtitle="Describe the goal. The planner will build a task board."
              className="flex h-full min-h-0 flex-col"
            >
              <div className="grid min-h-0 flex-1 w-full content-start gap-3">
                <textarea
                  className="tcp-input min-h-[360px] md:min-h-[52vh]"
                  placeholder="What do you want the agents to build?"
                  value={prompt}
                  onInput={(e) => setPrompt((e.target as HTMLTextAreaElement).value)}
                />
                <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                  <input
                    className="tcp-input"
                    readOnly
                    placeholder="No workspace selected. Use Browse."
                    value={workspaceRoot}
                  />
                  <button
                    className="tcp-btn"
                    onClick={() => {
                      const seed = String(
                        workspaceRoot || statusQuery.data?.workspaceRoot || "/"
                      ).trim();
                      setWorkspaceBrowserDir(seed || "/");
                      setWorkspaceBrowserSearch("");
                      setWorkspaceBrowserOpen(true);
                    }}
                  >
                    Browse
                  </button>
                </div>
                <div className="tcp-subtle text-xs">Selected folder: {workspaceRoot || "none"}</div>
                {!workspaceRoot ? (
                  <div className="rounded-lg border border-amber-400/40 bg-amber-950/20 p-2 text-xs text-amber-200">
                    Select a workspace folder before sending.
                  </div>
                ) : null}
                <button
                  className="tcp-btn"
                  type="button"
                  onClick={() => setShowAdvanced((prev) => !prev)}
                >
                  {showAdvanced ? "Hide Advanced" : "Show Advanced"}
                </button>
                {showAdvanced ? (
                  <div className="grid gap-2 rounded-lg border border-slate-700/60 bg-slate-900/20 p-2 md:grid-cols-3">
                    <input
                      className="tcp-input"
                      type="number"
                      min="1"
                      value={maxTasks}
                      onInput={(e) => setMaxTasks((e.target as HTMLInputElement).value)}
                      title="max tasks"
                    />
                    <input
                      className="tcp-input"
                      type="number"
                      min="1"
                      max="16"
                      value={maxAgents}
                      onInput={(e) => setMaxAgents((e.target as HTMLInputElement).value)}
                      title="max agents"
                    />
                    <input
                      className="tcp-input"
                      value={workflowId}
                      onInput={(e) => setWorkflowId((e.target as HTMLInputElement).value)}
                      title="workflow id"
                    />
                    <div className="tcp-subtle md:col-span-3 text-xs">
                      Workflow id controls task routing template. Keep default unless you have a
                      custom workflow.
                    </div>
                  </div>
                ) : null}
                <button
                  className="tcp-btn-primary"
                  onClick={() => startMutation.mutate()}
                  disabled={startMutation.isPending || !canSend}
                >
                  Send
                </button>
              </div>
            </PageCard>
          </div>
        </div>
        {workspaceBrowserOpen ? (
          <div className="tcp-confirm-overlay">
            <div className="tcp-confirm-dialog max-w-2xl">
              <h3 className="tcp-confirm-title">Select Workspace Folder</h3>
              <p className="tcp-confirm-message">Current: {workspaceCurrentBrowseDir || "n/a"}</p>
              <div className="mb-2 flex flex-wrap gap-2">
                <button
                  className="tcp-btn"
                  onClick={() => {
                    if (!workspaceParentDir) return;
                    setWorkspaceBrowserDir(workspaceParentDir);
                  }}
                  disabled={!workspaceParentDir}
                >
                  Up
                </button>
                <button
                  className="tcp-btn-primary"
                  onClick={() => {
                    if (!workspaceCurrentBrowseDir) return;
                    setWorkspaceRoot(workspaceCurrentBrowseDir);
                    setWorkspaceBrowserOpen(false);
                    setWorkspaceBrowserSearch("");
                    toast("ok", `Workspace selected: ${workspaceCurrentBrowseDir}`);
                  }}
                >
                  Select This Folder
                </button>
                <button
                  className="tcp-btn"
                  onClick={() => {
                    setWorkspaceBrowserOpen(false);
                    setWorkspaceBrowserSearch("");
                  }}
                >
                  Close
                </button>
              </div>
              <div className="mb-2">
                <input
                  className="tcp-input"
                  placeholder="Type to filter folders..."
                  value={workspaceBrowserSearch}
                  onInput={(e) => setWorkspaceBrowserSearch((e.target as HTMLInputElement).value)}
                />
              </div>
              <div className="max-h-[360px] overflow-auto rounded-lg border border-slate-700/60 bg-slate-900/20 p-2">
                {filteredWorkspaceDirectories.length ? (
                  filteredWorkspaceDirectories.map((entry: any) => (
                    <button
                      key={String(entry?.path || entry?.name)}
                      className="tcp-list-item mb-1 w-full text-left"
                      onClick={() => setWorkspaceBrowserDir(String(entry?.path || ""))}
                    >
                      {String(entry?.name || entry?.path || "")}
                    </button>
                  ))
                ) : (
                  <EmptyState
                    text={
                      workspaceSearchQuery
                        ? "No folders match your search."
                        : "No subdirectories in this folder."
                    }
                  />
                )}
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <div ref={rootRef} className="chat-layout min-w-0 min-h-0 h-full flex-1">
        {historyPanel}
        <div className="chat-workspace min-h-0 min-w-0">
          <div className="grid h-full min-h-[calc(100vh-240px)] min-w-0 gap-4 xl:grid-cols-[1.05fr_1fr]">
            <PageCard
              title={
                <span className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    className="chat-icon-btn h-8 w-8"
                    title="History"
                    onClick={() => setHistoryOpen((prev) => !prev)}
                  >
                    <i data-lucide="history"></i>
                  </button>
                  <button
                    type="button"
                    className="chat-icon-btn h-8 w-8"
                    title="Back to start"
                    onClick={goToStartView}
                  >
                    <i data-lucide="arrow-left-to-line"></i>
                  </button>
                  <span>Orchestration Run</span>
                </span>
              }
              subtitle="Plan review and execution"
              className="flex h-full min-h-0 flex-col"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                <span className={statusBadgeClass(runStatus)}>{runStatus || "unknown"}</span>
                <span className="inline-flex items-center gap-1 tcp-subtle">
                  <i data-lucide="history"></i>
                  <span>
                    {runLabelFromTimestamp(
                      runQuery.data?.run?.updated_at_ms || runQuery.data?.run?.created_at_ms
                    )}
                  </span>
                </span>
                <span className="tcp-subtle">id: {runId}</span>
                <span className="tcp-subtle">plan: {planSource}</span>
              </div>

              {isPlanning ? (
                <div className="mb-3 rounded-xl border border-slate-700/60 bg-slate-900/25 p-3">
                  <div className="mb-1 text-sm font-medium">Planner is formulating a plan...</div>
                  <div className="tcp-subtle text-xs">Waiting for tasks to be generated.</div>
                </div>
              ) : null}

              {isAwaitingApproval ? (
                <div className="mb-3 rounded-xl border border-amber-500/40 bg-amber-950/20 p-3">
                  <div className="mb-2 text-sm font-medium text-amber-200">Plan Ready</div>
                  <div className="mb-2 text-xs text-amber-100/90">
                    Review the kanban. Request a rework or execute.
                  </div>
                  <textarea
                    className="tcp-input mb-2 min-h-[80px]"
                    placeholder="Feedback to rework the plan..."
                    value={revisionFeedback}
                    onInput={(e) => setRevisionFeedback((e.target as HTMLTextAreaElement).value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="tcp-btn"
                      disabled={!revisionFeedback.trim()}
                      onClick={() =>
                        actionMutation.mutate({
                          path: "/api/orchestrator/request_revision",
                          body: {
                            runId,
                            feedback: revisionFeedback,
                            maxTasks: Number(maxTasks || 4),
                            maxAgents: Number(maxAgents || 3),
                            workflowId,
                          },
                        })
                      }
                    >
                      Rework Plan
                    </button>
                    <button
                      className="tcp-btn-primary"
                      onClick={() =>
                        actionMutation.mutate({
                          path: "/api/orchestrator/approve",
                          body: { runId },
                        })
                      }
                    >
                      Execute Plan
                    </button>
                    <button
                      className="tcp-btn-danger"
                      disabled={discardMutation.isPending}
                      onClick={() => discardMutation.mutate(runId)}
                    >
                      Discard Plan
                    </button>
                  </div>
                </div>
              ) : null}

              {!isPlanning && !isAwaitingApproval ? (
                <div className="mb-3 flex flex-wrap gap-2">
                  {canPause ? (
                    <button
                      className="tcp-btn"
                      onClick={() =>
                        actionMutation.mutate({ path: "/api/orchestrator/pause", body: { runId } })
                      }
                    >
                      Pause
                    </button>
                  ) : null}
                  {canResume ? (
                    <button
                      className="tcp-btn"
                      onClick={() =>
                        actionMutation.mutate({ path: "/api/orchestrator/resume", body: { runId } })
                      }
                    >
                      Resume
                    </button>
                  ) : null}
                  {canCancel ? (
                    <button
                      className="tcp-btn-danger"
                      onClick={() =>
                        actionMutation.mutate({ path: "/api/orchestrator/cancel", body: { runId } })
                      }
                    >
                      Cancel
                    </button>
                  ) : null}
                  <button className="tcp-btn" onClick={goToStartView}>
                    New Prompt
                  </button>
                </div>
              ) : null}
              {isTerminal ? (
                <div className="mb-3 rounded-lg border border-slate-700/60 bg-slate-900/25 p-2 text-xs tcp-subtle">
                  This run is {runStatus}. Start a new prompt to continue.
                </div>
              ) : null}

              <div className="grid max-h-[260px] min-h-0 gap-2 overflow-auto">
                {orderedRuns.length ? (
                  orderedRuns.map((run: any, index: number) => {
                    const id = String(run?.run_id || run?.runId || `run-${index}`);
                    const active = id === runId;
                    return (
                      <button
                        key={id}
                        className={`tcp-list-item text-left ${active ? "border-amber-400/70" : ""}`}
                        onClick={() => {
                          setComposeMode(false);
                          setSelectedRunId(id);
                        }}
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1 text-sm font-medium">
                            <i data-lucide="history"></i>
                            <span>{runLabelFromTimestamp(runTimestamp(run))}</span>
                          </span>
                          <span className={statusBadgeClass(String(run?.status || "unknown"))}>
                            {String(run?.status || "unknown")}
                          </span>
                        </div>
                        <div className="tcp-subtle line-clamp-2 text-xs">
                          {String(run?.objective || "").trim() || "No objective"}
                        </div>
                        <div
                          className="tcp-subtle mt-1 text-[11px]"
                          style={{ overflowWrap: "anywhere" }}
                        >
                          {id}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <EmptyState text="No runs yet." />
                )}
              </div>
            </PageCard>

            <PageCard
              title="Kanban + Budget"
              subtitle="Tasks activate after execute"
              className="flex h-full min-h-0 flex-col"
            >
              <div className="mb-3">
                <BudgetMeter budget={budget} />
              </div>

              <TaskBoard
                tasks={tasks}
                currentTaskId={String(runQuery.data?.run?.current_step_id || "")}
                onRetryTask={(task) =>
                  actionMutation.mutate({
                    path: "/api/orchestrator/retry",
                    body: { runId, stepId: task.id },
                  })
                }
                onTaskClick={(task) => {
                  if (!task.session_id) return;
                  saveStoredSessionId(task.session_id);
                  navigate("chat");
                }}
              />

              <div className="mt-3 rounded-xl border border-slate-700/60 bg-slate-900/30 p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="font-medium">Latest Output</div>
                  {latestOutput?.sessionId ? (
                    <button
                      className="tcp-btn h-7 px-2 text-xs"
                      onClick={() => {
                        saveStoredSessionId(String(latestOutput.sessionId));
                        navigate("chat");
                      }}
                    >
                      Open Session
                    </button>
                  ) : null}
                </div>
                {latestOutput?.sessionId ? (
                  <div className="tcp-code max-h-40 overflow-auto whitespace-pre-wrap break-words">
                    {latestAssistantOutput || "No assistant output text yet."}
                  </div>
                ) : (
                  <div className="tcp-subtle text-xs">No completed step output session yet.</div>
                )}
              </div>
            </PageCard>
          </div>
        </div>
      </div>
      {workspaceBrowserOpen ? (
        <div className="tcp-confirm-overlay">
          <div className="tcp-confirm-dialog max-w-2xl">
            <h3 className="tcp-confirm-title">Select Workspace Folder</h3>
            <p className="tcp-confirm-message">Current: {workspaceCurrentBrowseDir || "n/a"}</p>
            <div className="mb-2 flex flex-wrap gap-2">
              <button
                className="tcp-btn"
                onClick={() => {
                  if (!workspaceParentDir) return;
                  setWorkspaceBrowserDir(workspaceParentDir);
                }}
                disabled={!workspaceParentDir}
              >
                Up
              </button>
              <button
                className="tcp-btn-primary"
                onClick={() => {
                  if (!workspaceCurrentBrowseDir) return;
                  setWorkspaceRoot(workspaceCurrentBrowseDir);
                  setWorkspaceBrowserOpen(false);
                  setWorkspaceBrowserSearch("");
                  toast("ok", `Workspace selected: ${workspaceCurrentBrowseDir}`);
                }}
              >
                Select This Folder
              </button>
              <button
                className="tcp-btn"
                onClick={() => {
                  setWorkspaceBrowserOpen(false);
                  setWorkspaceBrowserSearch("");
                }}
              >
                Close
              </button>
            </div>
            <div className="mb-2">
              <input
                className="tcp-input"
                placeholder="Type to filter folders..."
                value={workspaceBrowserSearch}
                onInput={(e) => setWorkspaceBrowserSearch((e.target as HTMLInputElement).value)}
              />
            </div>
            <div className="max-h-[360px] overflow-auto rounded-lg border border-slate-700/60 bg-slate-900/20 p-2">
              {filteredWorkspaceDirectories.length ? (
                filteredWorkspaceDirectories.map((entry: any) => (
                  <button
                    key={String(entry?.path || entry?.name)}
                    className="tcp-list-item mb-1 w-full text-left"
                    onClick={() => setWorkspaceBrowserDir(String(entry?.path || ""))}
                  >
                    {String(entry?.name || entry?.path || "")}
                  </button>
                ))
              ) : (
                <EmptyState
                  text={
                    workspaceSearchQuery
                      ? "No folders match your search."
                      : "No subdirectories in this folder."
                  }
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
