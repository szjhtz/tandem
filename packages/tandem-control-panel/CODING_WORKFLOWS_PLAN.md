# Coding Workflows Control Panel Plan

This document turns the new coding-workflows section into a concrete control-panel roadmap.

The goal is to make the panel the operator-facing window into Tandem-backed coding runs across many projects, without turning the panel into a second executor.

## Goals

- show multiple project bindings in one workspace
- show the full board state for the active project
- keep only `todo` items actionable for intake
- show active runs, workers, worktrees, and integration health
- keep GitHub/MCP auth and refresh logic server-side
- keep the panel read-only for board state until we deliberately add actions

## What Exists Today

The control panel already has:

- a `CodingWorkflowsPage`
- health and swarm status queries
- MCP server and tool visibility
- a run-centric board projection
- a dedicated control-panel Docker path

This plan extends those pieces into a stable project dashboard.

## Core UI Surfaces

### 1. Workspace Overview

Show:

- engine health
- active project
- active run count
- MCP connectivity
- worker/swarm health
- last refresh time

This should be the default landing state for the coding section.

### 2. Project Switcher

Show:

- all bound projects
- active project marker
- per-project counts
- sync freshness
- stale indicators

The first version can still focus on one active project, but the backing model must support many projects.

### 3. Board View

Show the full project board lanes:

- `todo`
- `in_progress`
- `review`
- `blocked`
- `done`

Rules:

- only `todo` is intake-ready
- the other lanes are visible context
- the UI should show linked run information and sync state per item

### 4. Run / Worker View

Show:

- active runs
- assigned workers
- worktree path or worktree summary
- current phase
- blocker state
- result summary

This view is for inspection first, action second.

### 5. Integrations View

Show:

- GitHub MCP status
- connected tools
- engine connection status
- provider/model selection
- sync failures or stale cache indicators

## Data Model

The panel should read from a backend model shaped around:

- `Workspace`
- `ProjectBinding`
- `BoardSnapshot`
- `Run`
- `TaskItem`
- `WorkerAssignment`

The UI should not talk to GitHub MCP directly.

The backend should own:

- board refresh
- MCP authentication
- stale snapshot detection
- run/task claim and sync state

## Refresh Policy

Use cached snapshots with explicit refresh behavior:

- refresh on initial page load
- refresh after claim or sync actions
- refresh on manual request
- optionally refresh the active project on a slow interval

Do not:

- poll GitHub directly from the browser
- re-send the PAT from the UI on every tick
- refresh inactive projects as aggressively as the active project

The UI should always show:

- `last_synced`
- stale/fresh state
- whether data is live or cached

## Engine Boundary

The control panel should treat Tandem as the executor.

Tandem owns:

- managed worktrees
- worker execution
- task transitions
- MCP-backed remote sync
- blackboard/run artifacts

The control panel owns:

- visibility
- project selection
- refresh requests
- operator decisions
- future manual launch actions

## State And Capacity Rules

The panel should display the scheduler state clearly when capacity is full.

Recommended behavior:

- if the system is at capacity, show that new claims are blocked
- if a worker fails, keep the run visible with a partial-failure marker
- if the snapshot is stale, show it instead of hiding it
- if the active project changes, make the board state switch with it

## Implementation Phases

### Phase 1

Make the current page read-only and project-aware:

- active project selector
- board summary
- run summary
- integrations status

### Phase 2

Add a backend snapshot cache so the UI reads Tandem state instead of querying GitHub directly.

### Phase 3

Add multi-project navigation and stale/fresh indicators.

### Phase 4

Add worker drill-down and worktree summaries.

### Phase 5

Add operator actions only where they are clearly safe:

- refresh project
- activate project
- open run details
- inspect worker logs

Leave task claiming and worktree execution to Tandem.

## Success Criteria

The control panel is successful when:

- a user can see all bound projects
- the active project board is readable
- only `todo` items are actionable
- the operator can see current runs, workers, and blockers
- refreshes are server-side and cached
- the panel remains a view into Tandem, not a second runtime
