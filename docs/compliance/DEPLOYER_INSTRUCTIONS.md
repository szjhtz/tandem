# Deployer Instructions For Regulated Workflows

This document provides starter operating guidance for organizations deploying Tandem in regulated, security-sensitive, or high-impact AI workflows. It should be adapted to the specific deployment and reviewed by the deployer's compliance, security, and legal teams.

## Operating Principles

- Treat Tandem as governed runtime infrastructure, not an autonomous decision maker.
- Keep humans responsible for regulated, customer-impacting, or system-of-record actions.
- Review generated artifacts before relying on them.
- Preserve execution evidence, approval decisions, and generated artifacts according to the deployer's retention policy.
- Configure protected actions to require approval or remain blocked.

## Human Review

Human reviewers should check:

- Whether the generated artifact answers the assigned task.
- Whether cited sources and evidence are sufficient.
- Whether limitations and uncertainty are clearly stated.
- Whether the output could materially affect a natural person.
- Whether the proposed next action is allowed, approval-gated, or prohibited.
- Whether the output should be approved, sent back for rework, or cancelled.

Reviewers should not approve output solely because it appears fluent or confident.

## Approval, Rework, And Cancel

Use approval decisions consistently:

- `Approve`: The reviewer accepts the specific artifact or action for the stated purpose.
- `Rework`: The reviewer requires changes before the workflow can proceed.
- `Cancel`: The reviewer stops the workflow or action because it should not proceed.

Approval should be specific to the action, artifact, workflow, tenant, and context. A general approval should not be reused for unrelated protected actions.

## Protected Actions

Deployers should treat the following as protected actions by default:

- Credit decisions or credit-limit changes.
- Money movement, refunds, reversals, payouts, wires, or ledger mutations.
- Account freezes, unfreezes, closures, or customer restrictions.
- Adverse-action notices or other regulated customer communications.
- Regulatory filings or formal regulator responses.
- Risk-rating changes or system-of-record updates.
- Publication of final audit packets or attestations.

Protected actions should require explicit human approval and runtime policy checks. If the workflow is not configured for safe execution, keep the action blocked and use Tandem only to prepare evidence or a draft.

## Artifact Review

Before using a Tandem-generated artifact externally or in a system of record, reviewers should confirm:

- The artifact is labeled as AI-generated or AI-assisted where required.
- The artifact has a run ID or traceable provenance.
- The artifact's citations or source references are accurate enough for the use case.
- The validation status is acceptable.
- The artifact does not include secrets or unnecessary personal data.
- The artifact's limitations are suitable for the audience.

## Log Retention

Deployers should define retention before production use:

- Keep run records, approval decisions, tool-call evidence, and generated artifacts for the period required by applicable law and internal policy.
- For AI Act deployer monitoring obligations, consider a minimum six-month baseline where applicable unless another law or policy requires a different period.
- Limit access to logs that may contain personal data, sensitive business data, or security-relevant information.
- Export evidence to the deployer's governance, SIEM, or records system where required.

## Incident Escalation

Escalate when:

- Tandem output may have contributed to an incorrect regulated action.
- A protected action executed without expected approval.
- A user reports misleading, unsafe, discriminatory, or unsupported output.
- A connector or model provider behaves unexpectedly.
- Logs, receipts, or artifacts needed for review are missing.
- Sensitive data or secrets appear in generated output or logs.

Incident review should preserve run IDs, artifacts, approvals, tool-call evidence, timestamps, model/provider details, and reviewer decisions.

## When Not To Use Autonomous Execution

Do not configure Tandem to autonomously perform:

- Credit approvals, denials, or credit-limit changes.
- Money movement or account restrictions.
- Final regulatory filings.
- Final adverse-action notices.
- Final system-of-record risk-rating changes.
- Biometric identification or categorization workflows without specialized legal, security, and oversight review.

In these cases, Tandem can still assist with investigation, drafting, evidence preparation, and review packets.
