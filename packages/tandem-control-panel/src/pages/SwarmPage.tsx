import { useQuery } from "@tanstack/react-query";
import { PageCard } from "./ui";
import type { AppPageProps } from "./pageTypes";

export function SwarmPage({ api, navigate }: AppPageProps) {
  const statusQuery = useQuery({
    queryKey: ["swarm", "status"],
    queryFn: () => api("/api/swarm/status"),
    refetchInterval: 5000,
  });

  const runsQuery = useQuery({
    queryKey: ["swarm", "runs"],
    queryFn: () => api("/api/swarm/runs?limit=20"),
    refetchInterval: 7000,
  });

  const runs = Array.isArray(runsQuery.data?.runs) ? runsQuery.data.runs : [];

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <PageCard
        title="Swarm Monitor"
        subtitle="Lightweight runtime diagnostics for blackboard and workers"
        actions={
          <button className="tcp-btn-primary" onClick={() => navigate("orchestrator")}>
            Open Orchestrator
          </button>
        }
      >
        <div className="grid gap-2 text-xs md:grid-cols-2">
          <div className="rounded-lg border border-slate-700/60 bg-slate-900/30 p-2">
            <div className="font-medium">Status</div>
            <div className="tcp-subtle">{String(statusQuery.data?.status || "idle")}</div>
          </div>
          <div className="rounded-lg border border-slate-700/60 bg-slate-900/30 p-2">
            <div className="font-medium">Executor</div>
            <div className="tcp-subtle">{String(statusQuery.data?.executorState || "idle")}</div>
          </div>
          <div className="rounded-lg border border-slate-700/60 bg-slate-900/30 p-2">
            <div className="font-medium">Mode</div>
            <div className="tcp-subtle">
              {String(statusQuery.data?.executorMode || "context_steps")}
            </div>
          </div>
          <div className="rounded-lg border border-slate-700/60 bg-slate-900/30 p-2">
            <div className="font-medium">Run ID</div>
            <div className="tcp-subtle break-all">{String(statusQuery.data?.runId || "none")}</div>
          </div>
        </div>
      </PageCard>

      <PageCard title="Recent Swarm Runs" subtitle="Quick status list">
        <div className="grid max-h-[58vh] gap-2 overflow-auto">
          {runs.length ? (
            runs.slice(0, 20).map((run: any, index: number) => {
              const runId = String(run?.run_id || run?.runId || `run-${index}`);
              return (
                <button
                  key={runId}
                  className="tcp-list-item text-left"
                  onClick={() => navigate("orchestrator")}
                >
                  <div className="mb-1 text-sm font-medium">{String(run?.objective || runId)}</div>
                  <div className="tcp-subtle text-xs">{runId}</div>
                  <div className="mt-1 text-xs text-slate-300">
                    status: {String(run?.status || "unknown")}
                  </div>
                </button>
              );
            })
          ) : (
            <div className="tcp-subtle rounded-xl border border-slate-700/60 bg-slate-900/20 p-3">
              No runs yet.
            </div>
          )}
        </div>
      </PageCard>
    </div>
  );
}
