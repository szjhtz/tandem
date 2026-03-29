import { Badge, PanelCard } from "../../ui/index.tsx";
import { PlannerMetricGrid } from "./plannerPrimitives";

function safeString(value: unknown) {
  return String(value || "").trim();
}

export function PlanOverlapPanel({ overlapAnalysis }: { overlapAnalysis: any }) {
  const matchedPlanId = safeString(
    overlapAnalysis?.matched_plan_id || overlapAnalysis?.matchedPlanId
  );
  const matchedPlanRevision = safeString(
    overlapAnalysis?.matched_plan_revision || overlapAnalysis?.matchedPlanRevision
  );
  const decision = safeString(overlapAnalysis?.decision || "").replace(/_/g, " ");
  const matchLayer = safeString(
    overlapAnalysis?.match_layer || overlapAnalysis?.matchLayer
  ).replace(/_/g, " ");
  const similarityScore = overlapAnalysis?.similarity_score ?? overlapAnalysis?.similarityScore;
  const requiresConfirmation = !!(
    overlapAnalysis?.requires_user_confirmation || overlapAnalysis?.requiresUserConfirmation
  );

  return (
    <PanelCard
      title="Overlap"
      subtitle="Match the current draft against prior plans and decide how it should evolve."
    >
      <div className="grid gap-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge tone={matchedPlanId ? "ok" : "warn"}>
            {matchedPlanId ? "prior match found" : "no prior match"}
          </Badge>
          {decision ? <Badge tone="info">{decision}</Badge> : null}
          {matchLayer ? <Badge tone="info">{matchLayer}</Badge> : null}
          <Badge tone={requiresConfirmation ? "warn" : "ok"}>
            {requiresConfirmation ? "confirmation needed" : "no confirmation needed"}
          </Badge>
        </div>

        <PlannerMetricGrid
          metrics={[
            {
              label: "Matched plan",
              value: matchedPlanId || "none",
            },
            {
              label: "Matched revision",
              value: matchedPlanRevision || "none",
            },
            {
              label: "Similarity",
              value: typeof similarityScore === "number" ? similarityScore.toFixed(2) : "n/a",
            },
            {
              label: "Reason",
              value: safeString(overlapAnalysis?.reason) || "No overlap reason provided.",
            },
          ]}
        />
      </div>
    </PanelCard>
  );
}
