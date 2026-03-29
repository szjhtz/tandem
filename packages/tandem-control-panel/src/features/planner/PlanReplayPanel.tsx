import { Badge, PanelCard } from "../../ui/index.tsx";
import { PlannerMetricGrid, PlannerSubsection } from "./plannerPrimitives";

function safeString(value: unknown) {
  return String(value || "").trim();
}

function normalizeRows(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

export function PlanReplayPanel({ planPackageReplay }: { planPackageReplay: any }) {
  const compatible = !!planPackageReplay?.compatible;
  const issues = normalizeRows(planPackageReplay?.issues);
  const diffSummary = normalizeRows(
    planPackageReplay?.diff_summary || planPackageReplay?.diffSummary
  );
  const scopePreserved = !!planPackageReplay?.scope_metadata_preserved;
  const handoffPreserved = !!planPackageReplay?.handoff_rules_preserved;
  const credentialsPreserved = !!planPackageReplay?.credential_isolation_preserved;

  return (
    <PanelCard
      title="Replay"
      subtitle="Compare the current draft against the baseline revision and review what changed."
    >
      <div className="grid gap-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge tone={planPackageReplay ? (compatible ? "ok" : "warn") : "warn"}>
            {planPackageReplay
              ? compatible
                ? "replay compatible"
                : "replay drift"
              : "replay pending"}
          </Badge>
          <Badge tone={scopePreserved ? "ok" : "warn"}>
            {scopePreserved ? "scope preserved" : "scope changed"}
          </Badge>
          <Badge tone={handoffPreserved ? "ok" : "warn"}>
            {handoffPreserved ? "handoff preserved" : "handoff changed"}
          </Badge>
          <Badge tone={credentialsPreserved ? "ok" : "warn"}>
            {credentialsPreserved ? "credentials preserved" : "credentials changed"}
          </Badge>
        </div>

        <PlannerMetricGrid
          metrics={[
            {
              label: "Previous plan",
              value: safeString(planPackageReplay?.previous_plan_id) || "baseline",
              detail: safeString(planPackageReplay?.previous_plan_revision)
                ? `revision ${safeString(planPackageReplay?.previous_plan_revision)}`
                : "revision 1",
            },
            {
              label: "Current plan",
              value: safeString(planPackageReplay?.next_plan_id) || "current draft",
              detail: safeString(planPackageReplay?.next_plan_revision)
                ? `revision ${safeString(planPackageReplay?.next_plan_revision)}`
                : "latest revision",
            },
            {
              label: "Issues",
              value: issues.length || 0,
            },
            {
              label: "Diffs",
              value: diffSummary.length || 0,
            },
          ]}
        />

        {diffSummary.length ? (
          <PlannerSubsection title="Replay deltas">
            <div className="grid gap-2">
              {diffSummary.slice(0, 6).map((entry: any, index: number) => (
                <div
                  key={`${safeString(entry?.path)}-${index}`}
                  className="rounded-lg border border-white/10 bg-black/20 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={entry?.preserved ? "ok" : "warn"}>
                      {entry?.preserved ? "preserved" : "changed"}
                    </Badge>
                    <span className="text-sm font-medium text-slate-100">
                      {safeString(entry?.path) || "unknown path"}
                    </span>
                  </div>
                  {entry?.previous_value !== undefined ? (
                    <div className="mt-2 text-xs text-slate-400">
                      previous: {JSON.stringify(entry.previous_value)}
                    </div>
                  ) : null}
                  {entry?.next_value !== undefined ? (
                    <div className="mt-1 text-xs text-slate-300">
                      next: {JSON.stringify(entry.next_value)}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </PlannerSubsection>
        ) : null}

        {issues.length ? (
          <PlannerSubsection title="Replay issues">
            <div className="grid gap-2">
              {issues.slice(0, 6).map((issue: any, index: number) => (
                <div
                  key={`${safeString(issue?.code)}-${index}`}
                  className="rounded-lg border border-white/10 bg-black/20 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={issue?.blocking ? "err" : "warn"}>
                      {issue?.blocking ? "blocking" : "warning"}
                    </Badge>
                    <span className="text-sm font-medium text-slate-100">
                      {safeString(issue?.code) || "replay issue"}
                    </span>
                  </div>
                  <div className="tcp-subtle mt-2 text-xs">
                    {safeString(issue?.path) || "unknown path"}
                  </div>
                  <div className="mt-1 text-slate-200">{safeString(issue?.message)}</div>
                </div>
              ))}
            </div>
          </PlannerSubsection>
        ) : (
          <div className="tcp-subtle text-xs">
            {planPackageReplay
              ? "No replay issues were reported for the current draft."
              : "Replay results will appear after the planner generates or revises a draft."}
          </div>
        )}
      </div>
    </PanelCard>
  );
}
