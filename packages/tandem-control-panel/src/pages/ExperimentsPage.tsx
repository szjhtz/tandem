import { AnimatedPage, Badge, PageHeader, PanelCard } from "../ui/index.tsx";
import { OptimizationCampaignsPanel } from "./OptimizationCampaignsPanel";
import { SpawnApprovals } from "../features/automations/SpawnApprovals";
import type { AppPageProps } from "./pageTypes";

export function ExperimentsPage({ client, toast, navigate }: AppPageProps) {
  return (
    <AnimatedPage className="grid gap-4">
      <PageHeader
        eyebrow="Opt-in surface"
        title="Experiments"
        subtitle="This page stays hidden by default. Turn it on from Settings > Navigation when you want access to the experimental automation surfaces."
        badges={
          <>
            <Badge tone="warn">Hidden by default</Badge>
            <Badge tone="ghost">Settings required</Badge>
          </>
        }
        actions={
          <button type="button" className="tcp-btn-primary" onClick={() => navigate("settings")}>
            Open Settings
          </button>
        }
      />

      <PanelCard
        title="Why this is separate"
        subtitle="These tools are useful, but they are not the main entry point for new users."
      >
        <div className="grid gap-3 text-sm text-slate-200">
          <p>
            Keep the Automations page focused on the core loop: create, schedule, review, and run.
          </p>
          <p className="tcp-subtle">
            Experiments is where we park the exploratory surfaces until they have a clearer home.
          </p>
        </div>
      </PanelCard>

      <PanelCard
        title="Optimization campaigns"
        subtitle="Shadow evals, optimization runs, and the related workflow tooling."
      >
        <OptimizationCampaignsPanel client={client} toast={toast} />
      </PanelCard>

      <PanelCard
        title="Teams and approvals"
        subtitle="Pending spawn approvals and active team instances."
      >
        <SpawnApprovals client={client} toast={toast} />
      </PanelCard>
    </AnimatedPage>
  );
}
