import { Badge, PanelCard } from "../../ui/index.tsx";
import type { IntentBriefDraft } from "./IntentBriefPanel";
import { PlannerMetricGrid, PlannerSubsection } from "./plannerPrimitives";

function safeString(value: unknown) {
  return String(value || "").trim();
}

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

export function PlanSummaryPanel({
  planPreview,
  brief,
  planPackage,
  planPackageBundle,
}: {
  planPreview: any;
  brief: IntentBriefDraft;
  planPackage: any;
  planPackageBundle: any;
}) {
  const steps = Array.isArray(planPreview?.steps) ? planPreview.steps : [];
  const routines = Array.isArray(planPackage?.routine_graph) ? planPackage.routine_graph : [];
  const bundleSnapshot = asObject(
    planPackageBundle?.scope_snapshot || planPackageBundle?.scopeSnapshot
  );
  const outputRoots = asObject(bundleSnapshot.output_roots || bundleSnapshot.outputRoots);

  return (
    <PanelCard
      title="Plan summary"
      subtitle="Review the compiler draft and bundle snapshot before handing it off downstream."
    >
      {planPreview ? (
        <div className="grid gap-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge tone={planPackage ? "ok" : "warn"}>
              {planPackage ? "plan package ready" : "plan package pending"}
            </Badge>
            <Badge tone={planPackageBundle ? "ok" : "warn"}>
              {planPackageBundle ? "bundle ready" : "bundle pending"}
            </Badge>
            <Badge tone="info">{brief.targetSurface.replace("_", " ")}</Badge>
            <Badge tone="info">{brief.planningHorizon.replace("_", " ")}</Badge>
          </div>

          <PlannerMetricGrid
            metrics={[
              {
                label: "Plan title",
                value:
                  safeString(planPreview?.title) || safeString(planPreview?.plan_id) || "Draft",
              },
              {
                label: "Plan id",
                value: safeString(planPreview?.plan_id || planPreview?.planId) || "pending",
              },
              {
                label: "Routines",
                value: routines.length || "pending",
              },
              {
                label: "Steps",
                value: steps.length || "pending",
              },
            ]}
          />

          <PlannerSubsection title="Description">
            <div className="text-slate-200">
              {safeString(planPreview?.description) || "No description returned yet."}
            </div>
          </PlannerSubsection>

          <PlannerSubsection title="Bundle snapshot">
            <PlannerMetricGrid
              metrics={[
                {
                  label: "Bundle version",
                  value:
                    safeString(
                      planPackageBundle?.bundle_version || planPackageBundle?.bundleVersion
                    ) || "pending",
                },
                {
                  label: "Snapshot plan",
                  value: safeString(bundleSnapshot.plan_id || bundleSnapshot.planId) || "pending",
                },
                {
                  label: "Snapshot revision",
                  value:
                    safeString(bundleSnapshot.plan_revision || bundleSnapshot.planRevision) ||
                    "pending",
                },
                {
                  label: "Output roots",
                  value: (
                    <div className="text-xs text-slate-200">
                      {outputRoots.plan ? <div>plan: {safeString(outputRoots.plan)}</div> : null}
                      {outputRoots.history ? (
                        <div>history: {safeString(outputRoots.history)}</div>
                      ) : null}
                      {outputRoots.proof ? <div>proof: {safeString(outputRoots.proof)}</div> : null}
                      {outputRoots.drafts ? (
                        <div>drafts: {safeString(outputRoots.drafts)}</div>
                      ) : null}
                      {!outputRoots.plan &&
                      !outputRoots.history &&
                      !outputRoots.proof &&
                      !outputRoots.drafts ? (
                        <div className="tcp-subtle">No bundle roots available yet.</div>
                      ) : null}
                    </div>
                  ),
                },
              ]}
            />
          </PlannerSubsection>

          <PlannerSubsection title="Step graph">
            <div className="grid gap-2">
              {steps.length ? (
                steps.map((step: any, index: number) => (
                  <div
                    key={safeString(step?.step_id || step?.stepId || index)}
                    className="rounded-lg border border-white/10 bg-black/20 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="info">Step {index + 1}</Badge>
                      <span className="text-sm font-medium text-slate-100">
                        {safeString(step?.objective) || safeString(step?.title) || "Untitled step"}
                      </span>
                    </div>
                    <div className="tcp-subtle mt-2 text-xs">
                      role: {safeString(step?.agent_role || step?.agentRole) || "n/a"}
                    </div>
                    <div className="tcp-subtle mt-1 text-xs">
                      depends on:{" "}
                      {Array.isArray(step?.depends_on) && step.depends_on.length
                        ? step.depends_on.join(", ")
                        : "none"}
                    </div>
                  </div>
                ))
              ) : (
                <div className="tcp-subtle text-xs">No step graph has been returned yet.</div>
              )}
            </div>
          </PlannerSubsection>
        </div>
      ) : (
        <div className="tcp-subtle text-sm">
          No plan yet. Start with the intent brief and planner chat to generate a draft.
        </div>
      )}
    </PanelCard>
  );
}
