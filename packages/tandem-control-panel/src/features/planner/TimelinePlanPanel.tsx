import { Badge, PanelCard } from "../../ui/index.tsx";
import type { IntentBriefDraft } from "./IntentBriefPanel";
import { PlannerSubsection } from "./plannerPrimitives";

function safeString(value: unknown) {
  return String(value || "").trim();
}

function waveCountForHorizon(horizon: IntentBriefDraft["planningHorizon"]) {
  switch (horizon) {
    case "same_day":
      return 2;
    case "multi_day":
      return 3;
    case "weekly":
      return 2;
    case "monthly":
      return 3;
    case "mixed":
    default:
      return 3;
  }
}

function waveTitle(index: number, total: number, horizon: IntentBriefDraft["planningHorizon"]) {
  if (total === 1) {
    return "One-time delivery";
  }
  if (index === 0) {
    return "Setup and framing";
  }
  if (index === total - 1) {
    return horizon === "weekly" || horizon === "monthly" || horizon === "mixed"
      ? "Recurring follow-up"
      : "Review and handoff";
  }
  return "Core delivery";
}

function splitIntoWaves(steps: any[], horizon: IntentBriefDraft["planningHorizon"]) {
  const desiredCount = Math.max(1, Math.min(waveCountForHorizon(horizon), steps.length || 1));
  const chunkSize = Math.max(1, Math.ceil((steps.length || 1) / desiredCount));
  const waves: Array<{ index: number; title: string; steps: any[] }> = [];
  for (let index = 0; index < desiredCount; index += 1) {
    const slice = steps.slice(index * chunkSize, (index + 1) * chunkSize);
    if (!slice.length && steps.length) continue;
    waves.push({
      index,
      title: waveTitle(index, desiredCount, horizon),
      steps: slice,
    });
  }
  if (!waves.length) {
    waves.push({
      index: 0,
      title: waveTitle(0, 1, horizon),
      steps: [],
    });
  }
  return waves;
}

export function TimelinePlanPanel({
  brief,
  planPreview,
}: {
  brief: IntentBriefDraft;
  planPreview: any;
}) {
  const steps = Array.isArray(planPreview?.steps) ? planPreview.steps : [];
  const waves = splitIntoWaves(steps, brief.planningHorizon);
  const recurring =
    brief.planningHorizon === "weekly" ||
    brief.planningHorizon === "monthly" ||
    brief.planningHorizon === "mixed";

  return (
    <PanelCard
      title="Timeline"
      subtitle="Preview the mission as time waves and milestones instead of one flattened schedule."
    >
      <div className="grid gap-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge tone="info">{brief.planningHorizon.replace("_", " ")}</Badge>
          <Badge tone={recurring ? "ok" : "info"}>
            {recurring ? "one-time + recurring" : "one-time only"}
          </Badge>
          <Badge tone={steps.length ? "ok" : "warn"}>
            {steps.length ? `${steps.length} step${steps.length === 1 ? "" : "s"}` : "no steps yet"}
          </Badge>
        </div>

        <PlannerSubsection title="Timeline model">
          <div className="text-slate-200">
            {recurring
              ? "This horizon is treated as a mix of one-time setup work plus recurring follow-up waves."
              : "This horizon is treated as one-time work split into sequential execution waves."}
          </div>
        </PlannerSubsection>

        <div className="grid gap-2">
          {waves.map((wave) => {
            return (
              <PlannerSubsection
                key={`${wave.index}-${wave.title}`}
                title={`Milestone ${wave.index + 1}`}
                description={wave.title}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={wave.index === waves.length - 1 && recurring ? "ok" : "info"}>
                    {wave.title}
                  </Badge>
                  <span className="tcp-subtle text-xs">
                    {wave.steps.length
                      ? `${wave.steps.length} step${wave.steps.length === 1 ? "" : "s"}`
                      : "no assigned steps"}
                  </span>
                </div>

                {wave.steps.length ? (
                  <div className="mt-3 grid gap-2">
                    {wave.steps.map((step: any, index: number) => (
                      <div
                        key={safeString(step?.step_id || step?.stepId || `${wave.index}-${index}`)}
                        className="rounded-lg border border-white/10 bg-black/20 p-2"
                      >
                        <div className="text-sm font-medium text-slate-100">
                          {safeString(step?.objective) ||
                            safeString(step?.title) ||
                            "Untitled step"}
                        </div>
                        <div className="tcp-subtle mt-1 text-xs">
                          role: {safeString(step?.agent_role || step?.agentRole) || "n/a"}
                        </div>
                      </div>
                    ))}
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
