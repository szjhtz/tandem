# Advanced Swarm Builder / Mission Compiler

## Summary
- Reuse the existing `AutomationV2` DAG runtime as the executable target, not `MissionSpec`. The repo already supports dependency edges, bounded parallelism, upstream handoffs, retries, agent templates, and persisted node outputs through `crates/tandem-server/src/lib.rs`, `crates/tandem-server/src/http/workflow_planner.rs`, and `src/components/agent-automation/AgentAutomationPage.tsx`.
- Add a new backend-owned `MissionBlueprint` compiler layer that validates and compiles an authored mission into `AutomationV2Spec`, a derived `MissionSpec`/`WorkItem` preview, and per-node inherited brief previews.
- Keep the current 4-step beginner wizard unchanged. Add a second create-mode in `AgentAutomationPage` called `Advanced Swarm Builder`, backed by new compile/apply endpoints and a graph-first editor.
- Treat operator control and recovery as core product requirements, not optional polish:
  - hard stop / kill switch
  - mission token and budget guardrails
  - pause / continue / recover after failure
  - step-level editing and prompt repair
  - full runtime diagnostics and logs for human debugging
- First execution step: persist this plan as `docs/internal/advanced_swarm_builder_plan.md`.

## Repo-Grounded Assessment
- Reusable now: `AutomationV2Spec.agents + flow.nodes`, per-node `depends_on`/`input_refs`/`output_contract`, executor parallelism, agent-team template lookup, workflow-plan apply pipeline, and run checkpoint persistence.
- Missing now: a power-user authored mission contract, arbitrary graph validation, mission-wide brief inheritance in prompts, runtime approval gates with `approve | rework | cancel`, richer output contracts, and a compile-preview API for authored graphs.
- `MissionSpec`/`WorkItem` in `crates/tandem-orchestrator/src/model.rs` are too flat to be the primary execution target today. Use them as a derived summary contract for preview/interop, not execution.

## PM Semantics
- A plain DAG is necessary but not sufficient for advanced swarm orchestration. Dependencies tell the system what is legally runnable, but they do not tell the system what matters most, which stage of the mission is currently open, or how the operator mentally groups the work.
- Two nodes may both be runnable at the same time and still need different treatment:
  - one may be higher priority
  - one may belong to a later phase the operator does not want emphasized yet
  - one may belong to a different lane with separate team ownership or concurrency expectations
  - one may sit behind a milestone or promotion gate even if its direct dependencies are satisfied
- The authored mission model should therefore borrow explicit project-management semantics instead of relying only on graph edges.

## PM Distinctions
- `dependencies`: the hard legality rule. A node is not runnable until its upstream requirements are satisfied. This remains the source of truth for execution legality.
- `priority`: what matters most among already-runnable work. `P0 / P1 / P2 / P3` are priorities, not phases.
- `phase`: which stage of the mission the work belongs to. Phase is about mission progression, not urgency.
- `lane`: which team area, stream, or operational track the work belongs to. Lane is about grouping, ownership, and visualization.
- `milestone` / `gate`: a checkpoint or promotion boundary that controls advancement into later work. Milestones and gates can aggregate multiple upstream outcomes and represent “ready to move on” semantics that are richer than a single dependency edge.

## PM Semantics Recommendation
- Make `priority`, `phase`, `lane`, and `milestone` first-class authored fields in the mission/workstream model.
- Keep `AutomationV2Spec` as the execution target. These semantics should compile into runtime metadata, preview grouping, scheduling hints, and validation rules on top of the existing DAG runtime.
- Do not replace the runtime with a separate mission engine. Extend the authored model and compiler so the system can express project-management intent while keeping dependency legality grounded in `AutomationV2`.

## Engine Contracts
```rust
pub struct MissionBlueprint {
    pub mission_id: String,
    pub title: String,
    pub goal: String,
    pub success_criteria: Vec<String>,
    pub shared_context: Option<String>,
    pub workspace_root: String,
    pub orchestrator_template_id: Option<String>,
    pub phases: Vec<MissionPhaseBlueprint>,
    pub milestones: Vec<MissionMilestoneBlueprint>,
    pub team: MissionTeamBlueprint,
    pub workstreams: Vec<WorkstreamBlueprint>,
    pub review_stages: Vec<ReviewStage>,
    pub metadata: Option<Value>,
}

pub struct MissionPhaseBlueprint {
    pub phase_id: String,
    pub title: String,
    pub description: Option<String>,
    pub execution_mode: MissionPhaseExecutionMode, // soft | barrier
    pub opens_after: Vec<String>,
    pub metadata: Option<Value>,
}

pub enum MissionPhaseExecutionMode {
    Soft,
    Barrier,
}

pub struct MissionMilestoneBlueprint {
    pub milestone_id: String,
    pub title: String,
    pub kind: String, // checkpoint | promotion_gate | handoff
    pub phase_id: Option<String>,
    pub depends_on: Vec<String>,
    pub metadata: Option<Value>,
}

pub struct MissionTeamBlueprint {
    pub allowed_template_ids: Vec<String>,
    pub default_model_policy: Option<Value>,
    pub allowed_mcp_servers: Vec<String>,
    pub max_parallel_agents: Option<u32>,
    pub mission_budget: Option<tandem_orchestrator::BudgetLimit>,
    pub emergency_stop_enabled: bool,
    pub max_tokens_guardrail: Option<u64>,
    pub max_cost_guardrail_usd: Option<f64>,
    pub orchestrator_only_tool_calls: bool,
}

pub struct WorkstreamBlueprint {
    pub workstream_id: String,
    pub title: String,
    pub objective: String,
    pub role: String,
    pub template_id: Option<String>,
    pub prompt: String,
    pub model_override: Option<Value>,
    pub priority: String, // p0 | p1 | p2 | p3
    pub phase_id: Option<String>,
    pub lane: Option<String>,
    pub milestone: Option<String>,
    pub tool_allowlist_override: Vec<String>,
    pub mcp_servers_override: Vec<String>,
    pub depends_on: Vec<String>,
    pub input_refs: Vec<crate::AutomationFlowInputRef>,
    pub output_contract: OutputContractBlueprint,
    pub retry_policy: Option<Value>,
    pub timeout_ms: Option<u64>,
    pub editable_after_failure: bool,
    pub metadata: Option<Value>,
}

pub struct ReviewStage {
    pub stage_id: String,
    pub stage_kind: ReviewStageKind, // review | test | approval
    pub title: String,
    pub target_ids: Vec<String>,
    pub role: Option<String>,
    pub template_id: Option<String>,
    pub prompt: String,
    pub checklist: Vec<String>,
    pub model_override: Option<Value>,
    pub gate: Option<HumanApprovalGate>,
}

pub struct OutputContractBlueprint {
    pub kind: String,
    pub schema: Option<Value>,
    pub summary_guidance: Option<String>,
}

pub struct HumanApprovalGate {
    pub required: bool,
    pub decisions: Vec<ApprovalDecision>, // approve | rework | cancel
    pub rework_targets: Vec<String>,
    pub instructions: Option<String>,
}

pub struct MissionRecoveryPolicy {
    pub allow_continue_after_failure: bool,
    pub allow_step_repair: bool,
    pub allow_prompt_edits_after_failure: bool,
    pub preserve_successful_upstream_outputs: bool,
}
```

```ts
export interface MissionBlueprint {
  mission_id?: string; title: string; goal: string; success_criteria: string[];
  shared_context?: string; workspace_root: string; orchestrator_template_id?: string;
  phases?: MissionPhaseBlueprint[]; milestones?: MissionMilestoneBlueprint[];
  team: MissionTeamBlueprint; workstreams: WorkstreamBlueprint[];
  review_stages: ReviewStage[]; metadata?: JsonObject;
}
export interface MissionPhaseBlueprint {
  phase_id: string; title: string; description?: string;
  execution_mode: "soft" | "barrier"; opens_after?: string[]; metadata?: JsonObject;
}
export interface MissionMilestoneBlueprint {
  milestone_id: string; title: string; kind: "checkpoint" | "promotion_gate" | "handoff";
  phase_id?: string; depends_on?: string[]; metadata?: JsonObject;
}
export interface MissionTeamBlueprint {
  allowed_template_ids?: string[]; default_model_policy?: JsonObject;
  allowed_mcp_servers?: string[]; max_parallel_agents?: number;
  mission_budget?: AgentTeamBudgetLimit; orchestrator_only_tool_calls?: boolean;
}
export interface WorkstreamBlueprint {
  workstream_id: string; title: string; objective: string; role: string;
  template_id?: string; prompt: string; model_override?: JsonObject;
  priority?: "p0" | "p1" | "p2" | "p3"; phase_id?: string; lane?: string; milestone?: string;
  tool_allowlist_override?: string[]; mcp_servers_override?: string[];
  depends_on?: string[]; input_refs?: Array<{ from_step_id: string; alias: string }>;
  output_contract: OutputContractBlueprint; retry_policy?: JsonObject; timeout_ms?: number;
  metadata?: JsonObject;
}
export interface ReviewStage {
  stage_id: string; stage_kind: "review" | "test" | "approval"; title: string;
  target_ids: string[]; role?: string; template_id?: string; prompt: string;
  checklist?: string[]; model_override?: JsonObject; gate?: HumanApprovalGate;
}
export interface MissionCompilePreview {
  blueprint: MissionBlueprint; automation: AutomationV2Spec;
  mission_spec: MissionSpecPreview; work_items: WorkItemPreview[];
  node_previews: CompiledNodePreview[]; validation: ValidationMessage[];
}
```

### Derived Runtime Metadata
- The compiler should derive runtime metadata for each node and for the mission as a whole:
  - `mission.phases`
  - `mission.active_phase`
  - `node.priority`
  - `node.phase_id`
  - `node.lane`
  - `node.milestone`
  - `node.phase_execution_mode`
- This metadata should feed:
  - compile preview grouping
  - operator diagnostics
  - scheduler tie-breaking among runnable nodes
  - validation and warning generation
- The runtime metadata should remain advisory unless it encodes a barrier/gate rule. Dependencies still decide legality.

## Compile Flow
- Add `tandem-workflows` compiler/validator functions: `validate_mission_blueprint`, `compile_mission_blueprint`, `derive_mission_spec_preview`.
- Compiler ownership decision:
  - authored mission normalization, validation, graph checks, PM-semantics expansion, and `AutomationV2Spec` compilation should live in `tandem-workflows`
  - server code should remain responsible for apply-time concerns only:
    - persistence
    - run-now behavior
    - side effects
    - HTTP/Tauri boundary shaping
  - this keeps the compiler reusable and testable without moving execution out of the existing server/runtime
- Compile target is `AutomationV2Spec`. Each workstream or review/test stage becomes an `AutomationFlowNode`.
- Compile per-workstream model/template/tool/MCP overrides by emitting a dedicated `AutomationV2AgentProfile` per lane/stage when overrides differ. This avoids adding node-level model execution and reuses the current runtime.
- Add PM-semantics compilation rules on top of the DAG:
  - dependencies stay the hard legality rule
  - phase controls which slice of the mission is considered open
  - priority influences scheduling order among already-runnable work
  - lane supports grouping, per-lane concurrency policy, and visualization
  - milestone/gates control promotion into later stages and operator checkpointing
- Phases should support both sequencing modes:
  - `soft`: downstream phases can start early when dependencies are satisfied, but scheduling and UI should still bias toward the current phase
  - `barrier`: later phases remain closed until the barrier condition is satisfied, even if some node-level dependencies would otherwise make work runnable
- Additive runtime extensions:
  - enrich `AutomationFlowOutputContract` with `schema` and `summary_guidance`
  - add optional `stage_kind`, `gate`, and `metadata` to `AutomationFlowNode`
  - add `AwaitingApproval` to `AutomationRunStatus`
  - extend `AutomationRunCheckpoint` with `awaiting_gate`, `blocked_nodes`, gate decision history, failure diagnostics, and resumable node state
- Prompt rendering in `crates/tandem-server/src/lib.rs` must inject: mission title, mission goal, success criteria, shared context, mission-wide constraints, current dependency status, relevant upstream outputs, local assignment, assigned role/template, allowed scope, and output contract guidance.
- Human approval nodes are zero-execution gate nodes. When runnable, the executor sets `AwaitingApproval` and exposes a gate request. `approve` marks the node complete, `rework` resets configured targets plus downstream descendants back to pending and clears stale outputs, `cancel` terminates the run.
- Reviewer/tester stages are normal nodes assigned to reviewer/tester templates. Their outputs feed the approval gate or downstream fan-in stages.
- Persist the authored blueprint in `automation.metadata.builder_kind = "mission_blueprint"` and `automation.metadata.mission_blueprint` so advanced automations can reopen in the advanced editor.
- Add explicit operator control semantics:
  - emergency kill switch to stop all active sessions/lanes immediately
  - automatic stop when token/cost/runtime guardrails are breached
  - continue/resume after pause or recoverable failure
  - edit-and-rerun an individual failed step without rebuilding the whole mission from scratch
  - patch a failed step prompt/template/model assignment and recompile only affected downstream nodes
- Expose operator diagnostics:
  - per-step logs and transcripts
  - node outputs and failure reasons
  - token/cost usage by run and by step where available
  - gate history and recovery history
  - blocked-node and dependency-state visibility

## Scheduler / Orchestrator Guidance
- Legality and preference must remain separate:
  - legality comes from `depends_on`, explicit gates, and barrier-phase rules
  - preference comes from priority, current phase, lane policy, and milestone posture
- The orchestrator should evaluate nodes in this order:
  1. filter by legality
  2. filter by open/closed phase rules
  3. prioritize by priority class among the remaining runnable nodes
  4. apply lane-aware concurrency or balancing rules
  5. surface milestone/gate checkpoints to the operator when promotion is required
- Priority should never override an unsatisfied dependency.
- Phase should never be treated as the same concept as priority.
- Lane should not make a node legal on its own; it is a grouping and scheduling aid.
- Milestone/gate semantics should be visible in compile preview and run diagnostics so the operator can understand why later work is still blocked even when some low-level dependencies appear complete.

## Implementation Plan
- `crates/tandem-workflows/src/lib.rs`: export a new `mission_builder` module with the blueprint structs, compile preview structs, validation messages, graph validation, compiler, and derived `MissionSpec`/`WorkItem` preview mapping.
- `crates/tandem-server/src/http/router.rs`, new `mission_builder.rs`, and new `routes_mission_builder.rs`: add `mission-builder/compile-preview`, `mission-builder/apply`, and `mission-builder/get` endpoints; keep `workflow_planner` unchanged.
- `crates/tandem-server/src/lib.rs`: extend `AutomationV2` contracts, executor gate handling, prompt inheritance, and rework graph reset logic.
- `crates/tandem-server/src/http/routines_automations.rs`: add run gate decision endpoints, stop/continue/recovery endpoints, and expose gate/failure state in run responses.
- `src-tauri/src/sidecar.rs`, `src-tauri/src/commands.rs`, and `src-tauri/src/lib.rs`: add Tauri commands for compile-preview/apply/get and gate decisions.
- `src/lib/tauri.ts`: add `MissionBlueprint`, `MissionCompilePreview`, new invoke wrappers, richer `AutomationV2` node/run types, and gate/recovery/kill-switch request types.
- `src/components/agent-automation/AgentAutomationPage.tsx`: add `Simple | Advanced Swarm Builder` mode switch, hydrate advanced drafts from metadata, and extend the runs tab to surface `AwaitingApproval`, failure diagnostics, stop controls, and recovery actions.
- New frontend files under `src/components/agent-automation/`: `AdvancedMissionBuilder.tsx`, `MissionBuilderGraph.tsx`, `MissionBuilderWorkstreamEditor.tsx`, and `MissionBuilderCompileTab.tsx`. Tabs: Mission, Team, Workstreams, Dependencies, Review & Gates, Compile.
- `docs/internal/advanced_swarm_builder_plan.md`: this file is the design source for implementation.
- Add PM-semantics ownership across compiler and UI:
  - authored fields for `priority`, `phase_id`, `lane`, and `milestone`
  - mission-level phase and milestone definitions
  - compile-time validation for bad phase refs, invalid milestone structure, and illegal barrier sequencing
  - compile preview grouping by phase/lane/priority
  - scheduler metadata that influences execution order without violating dependencies

## Test Plan
- Rust unit tests in `tandem-workflows`: duplicate IDs, unknown refs, cycle detection, unreachable nodes, invalid gate targets, missing templates, bad phase references, invalid milestone structure, illegal barrier-phase sequencing, and compile output mapping.
- Server HTTP tests: compile-preview returns warnings/errors, apply stores advanced metadata, existing simple workflow-plans still apply, gate decision endpoints enforce `approve | rework | cancel`, stop/recovery endpoints preserve valid state, and PM-semantics metadata round-trips cleanly.
- Executor tests in `tandem-server`: mission-wide prompt inheritance, parallel branch execution, approval node blocks downstream nodes, `rework` resets target and descendants, `cancel` terminates cleanly, kill switch stops active work, token/cost guardrails stop runaway runs, resume continues correctly, priority influences runnable-node ordering without violating dependencies, soft phases bias scheduling without closing legality, barrier phases block promotion correctly, and legacy automations without phase/priority fields still run unchanged.
- TS/node tests: draft reducers, dependency graph helpers, compile preview normalization, run gate UI state, PM-semantics grouping in preview state, and failure-recovery editor behavior.
- Manual acceptance run: create one mission with multiple lanes across phases, mark concurrent runnable work with different priorities, verify the compile preview groups by phase/lane, confirm barrier sequencing holds later work closed, then force one stage failure, patch the failed step prompt, continue from the failed stage, and complete after approval.

## Assumptions and Defaults
- UI label: `Advanced Swarm Builder`; backend contract name: `MissionBlueprint`.
- V1 “orchestrator” is a dedicated orchestrator template/profile plus mission-wide brief injection and orchestrator-owned fan-in/review nodes, not a separate long-lived runtime outside `AutomationV2`.
- Existing beginner wizard and `workflow_planner` endpoints remain fully intact.
- Approval gates are human-only in v1 and support exactly `approve`, `rework`, and `cancel`.
- Default launch flow is `compile preview -> create draft -> optional immediate run_now`.
- Recovery should prefer preserving successful upstream outputs and rerunning only the failed/edited subtree unless the operator explicitly requests a full restart.
- PM semantics are additive scheduling and understanding aids layered on top of dependency legality; they do not replace `depends_on` as the execution legality rule.
- `P0 / P1 / P2 / P3` are priority labels, not phases.
- Phases should default to `soft` unless the authored mission explicitly asks for `barrier` behavior.
