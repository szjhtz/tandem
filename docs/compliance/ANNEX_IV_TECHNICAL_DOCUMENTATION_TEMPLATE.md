# Annex IV Technical Documentation Template

This template helps deployers prepare deployment-specific technical documentation for Tandem-assisted workflows. It is a starter template aligned to common Annex IV themes. It must be completed and reviewed for the specific deployment, role, and use case.

Each section marked `To be completed by deployer` requires deployment-specific information.

## 1. System Identification

- System name: To be completed by deployer.
- Tandem version or commit: To be completed by deployer.
- Deployment model: To be completed by deployer.
- Deployment owner: To be completed by deployer.
- Date prepared: To be completed by deployer.
- Review cadence: To be completed by deployer.

## 2. Intended Purpose

To be completed by deployer.

Describe:

- The workflow or business process supported by Tandem.
- Whether the workflow materially influences decisions about natural persons.
- Whether the workflow is high-risk under Annex III.
- Which actions are allowed, approval-gated, or prohibited.
- The expected human reviewer role.

## 3. System Architecture

Tandem operates as governed AI runtime infrastructure. Relevant runtime concepts include:

- Engine-owned run state.
- Workflow graphs and automation nodes.
- Tool and MCP connector scoping.
- Approval gates.
- Artifacts and validation metadata.
- Receipts and protected audit events.
- Tenant context and authority-chain foundations.

To be completed by deployer:

- Deployment diagram.
- Connected model providers.
- Connected MCP servers or external tools.
- Identity provider and access model.
- Network and hosting boundaries.
- Data stores and retention locations.

## 4. Model And Provider Inventory

To be completed by deployer.

| Provider | Model | Purpose | Data shared | Retention setting | Fallback model |
| -------- | ----- | ------- | ----------- | ----------------- | -------------- |
|          |       |         |             |                   |                |

Document how model changes are reviewed, approved, and rolled back.

## 5. Data Flow

To be completed by deployer.

Describe:

- Input sources.
- Prompt and context data.
- Tool outputs.
- Generated artifacts.
- Logs and receipts.
- Personal data or sensitive data categories.
- Cross-border transfer considerations.
- Redaction or minimization controls.

## 6. Human Oversight

To be completed by deployer.

Document:

- Which workflow steps require human review.
- Which actions require approval, rework, or cancellation.
- Who can approve protected actions.
- Whether dual control is required.
- Reviewer training or competence expectations.
- How reviewers interpret Tandem output and avoid automation bias.
- Emergency stop and escalation paths.

## 7. Logging And Record-Keeping

Tandem currently supports durable run state, automation attempt receipts, protected audit envelopes, approval history, artifact validation metadata, and selected audit stream events.

To be completed by deployer:

- Log retention period.
- Log storage location.
- Access controls.
- Export process.
- SIEM or governance record integration.
- Personal data handling.
- Incident evidence preservation process.

## 8. Accuracy, Robustness, And Cybersecurity

To be completed by deployer.

Document:

- Workflow-specific quality metrics.
- Acceptance thresholds.
- Validation checks.
- Human override process.
- Prompt-injection and malicious-document controls.
- Vulnerability management process.
- Incident response process.
- Provider outage fallback process.

## 9. Article 50 Transparency

To be completed by deployer.

Document:

- Which users interact directly with Tandem.
- Which generated content is shown to users or affected persons.
- How AI-generated or AI-assisted content is labeled.
- How generated drafts become reviewed or approved artifacts.
- How provenance is preserved in exports or final records.

## 10. Limitations And Residual Risks

To be completed by deployer.

Include:

- Known Tandem platform limitations.
- Deployment-specific risks.
- Controls owned by Tandem.
- Controls owned by the deployer.
- Accepted residual risks.
- Planned remediation dates.

## 11. Change History

To be completed by deployer.

| Date | Change | Reviewer | Approval |
| ---- | ------ | -------- | -------- |
|      |        |          |          |

## Related Tandem References

- [EU AI Act readiness brief](../EU_AI_ACT_COMPLIANCE.md)
- [AI Act control mapping](AI_ACT_CONTROL_MAPPING.md)
- [Deployer instructions](DEPLOYER_INSTRUCTIONS.md)
- [Limitations and responsibilities](LIMITATIONS_AND_RESPONSIBILITIES.md)
