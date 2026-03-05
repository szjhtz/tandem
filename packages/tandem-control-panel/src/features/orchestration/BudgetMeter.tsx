import { useState } from "preact/hooks";
import type { BudgetUsage } from "./types";

function meterColor(percentage: number) {
  if (percentage >= 1) return "bg-rose-500";
  if (percentage >= 0.8) return "bg-amber-500";
  return "bg-emerald-500";
}

function meter(used: number, max: number) {
  if (!max || max <= 0) return 0;
  return Math.min(used / max, 1);
}

function MeterRow({
  label,
  used,
  max,
  unit,
}: {
  label: string;
  used: number;
  max: number;
  unit?: string;
}) {
  const ratio = meter(used, max);
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="tcp-subtle">{label}</span>
        <span className="font-mono text-[11px] text-slate-200">
          {used.toLocaleString()}
          {unit || ""} / {max.toLocaleString()}
          {unit || ""}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800/80">
        <div className={`h-full ${meterColor(ratio)}`} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

export function BudgetMeter({ budget }: { budget: BudgetUsage }) {
  const [expanded, setExpanded] = useState(false);
  const overall = Math.max(
    meter(budget.iterations_used, budget.max_iterations),
    meter(budget.tokens_used, budget.max_tokens),
    meter(budget.wall_time_secs, budget.max_wall_time_secs),
    meter(budget.subagent_runs_used, budget.max_subagent_runs)
  );

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/25 p-3">
      <button
        className="flex w-full items-center justify-between"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="text-sm font-medium">Budget + Tokens</div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-800/80">
            <div
              className={`h-full ${meterColor(overall)}`}
              style={{ width: `${overall * 100}%` }}
            />
          </div>
          <span className="tcp-subtle text-xs">{Math.round(overall * 100)}%</span>
        </div>
      </button>
      {expanded ? (
        <div className="mt-3 grid gap-3 border-t border-slate-700/60 pt-3">
          <MeterRow label="Iterations" used={budget.iterations_used} max={budget.max_iterations} />
          <MeterRow label="Tokens" used={budget.tokens_used} max={budget.max_tokens} />
          <MeterRow
            label="Wall time"
            used={budget.wall_time_secs}
            max={budget.max_wall_time_secs}
            unit="s"
          />
          <MeterRow
            label="Agent calls"
            used={budget.subagent_runs_used}
            max={budget.max_subagent_runs}
          />
          {budget.exceeded && budget.exceeded_reason ? (
            <div className="rounded border border-rose-500/40 bg-rose-950/30 p-2 text-xs text-rose-200">
              {budget.exceeded_reason}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
