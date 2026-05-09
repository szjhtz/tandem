import {
  ExecutionProfile,
  artifactValidationIsExperimental,
  artifactValidationRelaxedClasses,
  executionProfileDescription,
  executionProfileLabel,
} from "./AutomationsRunHelpers";

interface ProfilePillProps {
  profile: string | null | undefined;
  requested?: string | null | undefined;
  className?: string;
}

const PILL_CLASS_BY_PROFILE: Record<ExecutionProfile, string> = {
  strict: "tcp-badge-info",
  guided: "tcp-badge-success",
  yolo: "tcp-badge-warning",
};

function normalizeProfile(value: string | null | undefined): ExecutionProfile {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (raw === "yolo" || raw === "guided") return raw;
  return "strict";
}

export function ExecutionProfilePill({ profile, requested, className }: ProfilePillProps) {
  const effective = normalizeProfile(profile);
  const requestedNormalized = requested ? normalizeProfile(requested) : null;
  const classes = ["tcp-badge", PILL_CLASS_BY_PROFILE[effective], className]
    .filter(Boolean)
    .join(" ");
  const label = executionProfileLabel(effective);
  const description = executionProfileDescription(effective);
  const overrideNote =
    requestedNormalized && requestedNormalized !== effective
      ? ` (requested ${executionProfileLabel(requestedNormalized)})`
      : "";
  return (
    <span className={classes} title={`${description}${overrideNote}`}>
      {label}
    </span>
  );
}

interface ExperimentalBadgeProps {
  validation: any;
  className?: string;
}

export function ExperimentalArtifactBadge({ validation, className }: ExperimentalBadgeProps) {
  if (!artifactValidationIsExperimental(validation)) return null;
  const relaxed = artifactValidationRelaxedClasses(validation);
  const profile = String(
    validation?.execution_profile || validation?.executionProfile || ""
  ).toLowerCase();
  const profileLabel = executionProfileLabel(profile);
  const titleParts = [`${profileLabel} run accepted this artifact under relaxed validation.`];
  if (relaxed.length > 0) {
    titleParts.push(
      `Relaxed: ${relaxed
        .map((row) => (row.detail ? `${row.class}: ${row.detail}` : row.class))
        .join("; ")}`
    );
  }
  const original = String(
    validation?.original_validator_outcome || validation?.originalValidatorOutcome || ""
  );
  const effective = String(validation?.effective_outcome || validation?.effectiveOutcome || "");
  if (original && effective) {
    titleParts.push(`Original ${original} → effective ${effective}.`);
  }
  return (
    <span
      className={["tcp-badge", "tcp-badge-warning", className].filter(Boolean).join(" ")}
      title={titleParts.join(" ")}
    >
      Experimental
    </span>
  );
}

interface RelaxationSummaryProps {
  validation: any;
  className?: string;
}

export function RelaxationOutcomeSummary({ validation, className }: RelaxationSummaryProps) {
  const relaxed = artifactValidationRelaxedClasses(validation);
  if (relaxed.length === 0) return null;
  const original = String(
    validation?.original_validator_outcome || validation?.originalValidatorOutcome || ""
  );
  const effective = String(validation?.effective_outcome || validation?.effectiveOutcome || "");
  return (
    <div className={["tcp-relaxation-summary", className].filter(Boolean).join(" ")}>
      {original && effective ? (
        <div className="tcp-text-muted">
          Validator outcome: <strong>{original}</strong> &rarr; <strong>{effective}</strong>
        </div>
      ) : null}
      <ul className="tcp-list-tight">
        {relaxed.map((row, idx) => (
          <li key={`${row.class}-${idx}`}>
            <code>{row.class}</code>
            {row.detail ? <span className="tcp-text-muted">: {row.detail}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
