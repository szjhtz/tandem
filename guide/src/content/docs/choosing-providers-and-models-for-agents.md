---
title: Choosing Providers And Models For Agents
description: How agents should choose, configure, and validate providers and models for Tandem workflows, missions, and recurring automations.
---

Use this guide when an agent needs to decide:

- which provider should power a workflow, mission, or run
- which model should be the default
- when to keep the global default and when to override per agent or per stage
- how to verify readiness before creating or running work

This page is about **provider and model policy**, not prompt writing. For prompt structure, see [Prompting Workflows And Missions](./prompting-workflows-and-missions/).

## Core principle

Provider and model choice should be owned by **configuration and runtime policy**, not buried inside prompts.

That means:

- prompts describe the work
- model policy describes which model should do the work
- providers config describes what is available and authorized

Do not teach agents to hardcode provider decisions into natural-language prompts unless there is no structured model policy surface available.

## The default operating order

When an agent is setting up workflows or missions:

1. inspect provider readiness
2. choose the default provider/model for the overall system
3. add per-agent or per-stage overrides only where the task type justifies it
4. verify the engine can actually use the chosen provider
5. apply the workflow or mission

## What Tandem already exposes

The main structured provider surfaces are:

- config and environment variables in [Configuration](./configuration/)
- SDK provider APIs in:
  - [TypeScript SDK](./sdk/typescript/)
  - [Python SDK](./sdk/python/)
- model policy on V2 automations and agents
- provider/model selectors in the control panel

Useful SDK methods already documented:

- `client.providers.catalog()`
- `client.providers.setDefaults(...)`
- `client.providers.setApiKey(...)`
- `client.providers.authStatus()`

## First question: is the provider ready?

Before picking a provider or model, an agent should verify:

- the provider exists in the catalog
- the provider has valid credentials or local availability
- the model is compatible with the task
- the chosen engine instance is using the expected config

### TypeScript readiness example

```ts
const catalog = await client.providers.catalog();
const status = await client.providers.authStatus();

console.log(catalog.all);
console.log(status);
```

### Python readiness example

```python
catalog = await client.providers.catalog()
status = await client.providers.auth_status()

print(catalog)
print(status)
```

If readiness is unclear, do not silently guess. Use an available default or surface the gap explicitly.

## How to choose the default

Choose one default provider/model for the overall workflow or mission unless there is a strong reason not to.

A good default should be:

- available and authenticated
- stable for recurring runs
- affordable enough for the expected schedule volume
- strong enough for the most common task in the system

This default is the fallback for general-purpose work and for stages that do not need special routing.

## When to override per agent or per stage

Per-agent or per-stage overrides make sense when the workflow mixes very different task types.

Common examples:

- cheap monitoring or triage stages use a lower-cost fast model
- synthesis or planning stages use a stronger reasoning model
- verification or review stages use a stronger, stricter model
- simple formatting or notification stages fall back to a cheaper model

Do not over-fragment model policy unless the difference really matters. Too many overrides make systems harder to reason about and harder to debug.

## Practical heuristics by task type

### Monitoring, polling, or simple intake

Prefer:

- fast
- cheap
- stable

Good fit:

- recurring scans
- simple normalization
- lightweight routing
- status collection

### Planning, synthesis, and strategy

Prefer:

- stronger reasoning
- better synthesis quality
- tolerance for larger context

Good fit:

- plan generation
- multi-source synthesis
- stage coordination
- strategy and structured decision outputs

### Coding and debugging

Prefer:

- strong implementation quality
- good tool-use reliability
- solid long-context behavior where needed

Use stronger models for:

- repo-wide refactors
- debugging across multiple files
- test failure diagnosis

Use cheaper models for:

- rote transformations
- simple formatting
- low-risk repetitive edits

### Review, approval, and validation

Prefer:

- conservative, reliable models
- good instruction-following
- strong ability to compare outputs against explicit contracts

These stages are often worth a better model because a weak reviewer can let bad work through the system.

## Good policy shape for Tandem systems

For most workflows and missions:

- set one default provider/model for the mission or automation
- add targeted overrides only for genuinely different task families
- keep the model choice in `model_policy`, not in stage prose

### Example V2 automation shape

```json
{
  "agents": [
    {
      "agent_id": "monitor",
      "model_policy": {
        "default_model": {
          "provider_id": "openrouter",
          "model_id": "openai/gpt-4o-mini"
        }
      }
    },
    {
      "agent_id": "review",
      "model_policy": {
        "default_model": {
          "provider_id": "openrouter",
          "model_id": "anthropic/claude-3.5-sonnet"
        }
      }
    }
  ]
}
```

The prompt should still describe the work. It should not say things like “use OpenRouter” or “switch to Claude” unless there is no structured policy path.

## How an agent should think about cost

For long-running scheduled systems, provider/model choice is a system design decision, not a one-run preference.

Agents should consider:

- how often the workflow runs
- how many stages execute each run
- which stages are cheap versus expensive
- whether a stronger model is needed only on later decision or review stages

Recurring monitor loops should not default to the most expensive model if a cheaper model can do the job safely.

## How an agent should think about reliability

Prefer stable, known-good providers and models for:

- recurring schedules
- mission-critical handoffs
- approval or review gates
- workflows where repair/retry cost is high

Avoid “best model on paper” thinking if the provider is not configured, not authenticated, or not operationally stable in the current environment.

## What not to do

Avoid these mistakes:

- hardcoding provider choice inside prompts
- selecting a model before checking provider readiness
- using expensive models for every stage by default
- giving every node its own model policy for no reason
- changing model policy and prompt structure at the same time when debugging failures

That last point matters a lot. If both the prompt and model changed, it becomes hard to understand which change actually fixed or broke the workflow.

## Recommended agent workflow

When an agent is preparing a workflow or mission:

1. call provider catalog/auth readiness
2. pick a stable default provider/model
3. add only minimal necessary per-agent overrides
4. keep provider/model choices in policy fields
5. preview or compile
6. run once and inspect the result
7. only then enable recurrence

## Quick examples

### Set defaults with the TypeScript SDK

```ts
await client.providers.setDefaults("openrouter", "anthropic/claude-3.7-sonnet");
```

### Set defaults with the Python SDK

```python
await client.providers.set_defaults("openrouter", "anthropic/claude-3.7-sonnet")
```

### Set a key when the provider is present but not authorized

```ts
await client.providers.setApiKey("openrouter", process.env.OPENROUTER_API_KEY || "");
```

## How this fits the other agent guides

Use the guides in this order:

1. [Engine Authentication For Agents](./engine-authentication-for-agents/)
2. [Choosing Providers And Models For Agents](./choosing-providers-and-models-for-agents/)
3. [Prompting Workflows And Missions](./prompting-workflows-and-missions/)
4. [Creating And Running Workflows And Missions](./creating-and-running-workflows-and-missions/)
5. [Agent Workflow And Mission Quickstart](./agent-workflow-mission-quickstart/)

## See also

- [Configuration](./configuration/)
- [TypeScript SDK](./sdk/typescript/)
- [Python SDK](./sdk/python/)
- [Engine Authentication For Agents](./engine-authentication-for-agents/)
- [Prompting Workflows And Missions](./prompting-workflows-and-missions/)
- [Creating And Running Workflows And Missions](./creating-and-running-workflows-and-missions/)
- [Agent Workflow And Mission Quickstart](./agent-workflow-mission-quickstart/)
