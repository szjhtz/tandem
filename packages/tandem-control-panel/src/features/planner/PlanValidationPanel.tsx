import { Badge, PanelCard } from "../../ui/index.tsx";
import { PlannerMetricGrid, PlannerSubsection } from "./plannerPrimitives";

function safeString(value: unknown) {
  return String(value || "").trim();
}

export function PlanValidationPanel({ validationReport }: { validationReport: any }) {
  const issues = Array.isArray(validationReport?.issues) ? validationReport.issues : [];
  const blockers = issues.filter((issue: any) => issue?.blocking);
  const warnings = issues.filter((issue: any) => !issue?.blocking);

  return (
    <PanelCard
      title="Validation"
      subtitle="Compiler checks that gate preview, apply, and activation."
    >
      <div className="grid gap-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge tone={validationReport ? "ok" : "warn"}>
            {validationReport ? "report ready" : "report pending"}
          </Badge>
          <Badge
            tone={
              Number(validationReport?.ready_for_apply || validationReport?.readyForApply)
                ? "ok"
                : "warn"
            }
          >
            {Number(validationReport?.ready_for_apply || validationReport?.readyForApply)
              ? "ready for apply"
              : "apply blocked"}
          </Badge>
          <Badge
            tone={
              Number(validationReport?.ready_for_activation || validationReport?.readyForActivation)
                ? "ok"
                : "warn"
            }
          >
            {Number(validationReport?.ready_for_activation || validationReport?.readyForActivation)
              ? "ready for activation"
              : "activation blocked"}
          </Badge>
        </div>

        <PlannerMetricGrid
          metrics={[
            {
              label: "Blockers",
              value: Number(blockers.length || validationReport?.blocker_count || 0),
            },
            {
              label: "Warnings",
              value: Number(warnings.length || validationReport?.warning_count || 0),
            },
          ]}
        />

        {issues.length ? (
          <div className="grid gap-2">
            {issues.slice(0, 4).map((issue: any, index: number) => (
              <div
                key={`${safeString(issue?.code)}-${index}`}
                className="rounded-lg border border-white/10 bg-black/20 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={issue?.blocking ? "err" : "warn"}>
                    {issue?.blocking ? "blocking" : "warning"}
                  </Badge>
                  <span className="text-sm font-medium text-slate-100">
                    {safeString(issue?.code) || "validation issue"}
                  </span>
                </div>
                <div className="tcp-subtle mt-2 text-xs">
                  {safeString(issue?.path) || "unknown path"}
                </div>
                <div className="mt-1 text-slate-200">{safeString(issue?.message)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="tcp-subtle text-xs">
            {validationReport
              ? "No validation issues were reported for the current draft."
              : "Validation results will appear after the planner generates a draft."}
          </div>
        )}

        {validationReport?.validation_state ? (
          <PlannerSubsection title="Validation state">
            <div className="text-slate-100">
              {safeString(
                validationReport.validation_state.state || validationReport.validationState?.state
              ) || "pending"}
            </div>
          </PlannerSubsection>
        ) : null}
      </div>
    </PanelCard>
  );
}
