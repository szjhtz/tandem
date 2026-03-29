import type { ReactNode } from "react";

type PlannerSubsectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

type PlannerMetric = {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
};

export function PlannerSubsection({
  title,
  description,
  children,
  className = "",
}: PlannerSubsectionProps) {
  return (
    <div className={`rounded-xl border border-white/10 bg-black/20 p-3 ${className}`.trim()}>
      <div className="text-xs uppercase tracking-wide text-slate-500">{title}</div>
      {description ? <div className="mt-1 text-xs text-slate-400">{description}</div> : null}
      <div className="mt-2">{children}</div>
    </div>
  );
}

export function PlannerMetricGrid({
  metrics,
  columns = "sm:grid-cols-2",
}: {
  metrics: PlannerMetric[];
  columns?: string;
}) {
  return (
    <div className={`grid gap-2 ${columns}`.trim()}>
      {metrics.map((metric) => (
        <PlannerSubsection key={metric.label} title={metric.label}>
          <div className="text-slate-100">{metric.value}</div>
          {metric.detail ? (
            <div className="mt-1 text-xs text-slate-400">{metric.detail}</div>
          ) : null}
        </PlannerSubsection>
      ))}
    </div>
  );
}
