import { Badge, PanelCard } from "../../ui/index.tsx";
import type { IntentBriefDraft } from "./IntentBriefPanel";
import { PlannerSubsection } from "./plannerPrimitives";

function safeString(value: unknown) {
  return String(value || "").trim();
}

function stageTone(active: boolean) {
  return active ? "ok" : "warn";
}

export function PlanFormationPanel({
  brief,
  planPreview,
  validationReport,
  overlapAnalysis,
}: {
  brief: IntentBriefDraft;
  planPreview: any;
  validationReport: any;
  overlapAnalysis: any;
}) {
  const steps = Array.isArray(planPreview?.steps) ? planPreview.steps : [];
  const intentParsed = !!safeString(brief.goal);
  const decompositionFormed = steps.length > 0;
  const overlapChecked = !!(
    overlapAnalysis?.matched_plan_id ||
    overlapAnalysis?.matchedPlanId ||
    overlapAnalysis
  );
  const validationComplete = !!validationReport;
  const chips = [
    { id: "intent-parsed", label: "intent parsed", active: intentParsed },
    { id: "decomposition", label: "decomposition formed", active: decompositionFormed },
    { id: "overlap", label: "overlap checked", active: overlapChecked },
    { id: "validation", label: "validation complete", active: validationComplete },
  ];

  return (
    <PanelCard
      title="Plan formation"
      subtitle="See the compiler move from intent to decomposition, checks, and review-ready structure."
    >
      <div className="grid gap-3 text-sm">
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <Badge key={chip.id} tone={stageTone(chip.active)}>
              {chip.label}
            </Badge>
          ))}
        </div>

        <PlannerSubsection title="Formation summary">
          <div className="text-slate-200">
            {decompositionFormed
              ? `The current draft has ${steps.length} planned step${steps.length === 1 ? "" : "s"} and is ready for downstream review.`
              : "The planner has not yet produced a step decomposition for this intent."}
          </div>
        </PlannerSubsection>

        <div className="grid gap-2">
          {steps.slice(0, 4).map((step: any, index: number) => {
            const stepId = safeString(step?.step_id || step?.stepId || `step-${index + 1}`);
            const label = safeString(step?.objective || step?.title || "Untitled step");
            const role = safeString(step?.agent_role || step?.agentRole || "n/a");
            return (
              <PlannerSubsection key={stepId} title={`Node ${index + 1}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-slate-100">{label}</span>
                </div>
                <div className="tcp-subtle mt-1 text-xs">agent: {role}</div>
                {index < Math.min(steps.length, 4) - 1 ? (
                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                    <span className="h-px flex-1 bg-white/10"></span>
                    <span>→</span>
                    <span className="h-px flex-1 bg-white/10"></span>
                  </div>
                ) : null}
              </PlannerSubsection>
            );
          })}
        </div>
      </div>
    </PanelCard>
  );
}
