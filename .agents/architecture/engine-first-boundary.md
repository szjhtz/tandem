---
description: keep product logic in the engine and keep GUI/TUI clients thin
---

> [!IMPORTANT]
> Tandem is engine-first.
> If a feature involves business logic, state transitions, enforcement, durable
> state, orchestration behavior, dedupe, matching, policy, or cross-client
> consistency, implement it in the engine, not in the GUI frontends or TUI.

## Default Rule

- The engine is the source of truth.
- Desktop, control panel, and TUI are clients of the engine.
- Frontends should be thin: render state, collect input, call engine APIs, and
  display engine events/results.

## Put It In The Engine When

- More than one client needs the behavior.
- The behavior must be consistent across desktop, web, TUI, SDK, or automation.
- The behavior should survive restart or reconnect.
- The behavior changes workflow state, approval state, run state, or stored
  records.
- The behavior enforces permissions, policy, readiness, safety, or capability
  checks.
- The behavior performs matching, dedupe, triage, routing, normalization, or
  issue/incident lifecycle decisions.
- The behavior emits canonical events that other clients may consume.

## Keep It In The Client When

- It is presentation-only.
- It is layout, navigation, filtering, sorting for display, local selection
  state, or hotkeys.
- It is a device-local integration such as clipboard, notifications, native
  file pickers, window behavior, or local-only UX affordances.
- It can vary by client without changing system behavior.

## Anti-Patterns

- Re-implementing engine rules in React, Tauri, or TUI code.
- Letting a frontend infer canonical status from partial local state when the
  engine can return or stream it.
- Putting dedupe, approval, matching, or publish decision logic in a client.
- Building a feature in one client first with the intention to "move it into the
  engine later".
- Creating frontend-only state machines for behavior that should be shared by
  all clients.

## Preferred Delivery Pattern

1. Add or update engine state, API, and events first.
2. Put validation and decision logic in the engine.
3. Expose the result through stable engine contracts.
4. Make each client a thin adapter over those contracts.
5. Add parity checks when a feature is consumed by multiple clients.

## Litmus Test

Ask: if we ship another client tomorrow, would we need to copy this logic?

- If yes, it belongs in the engine.
- If no, and it is only UX/presentation, it can live in the client.

## Tandem-Specific Reminder

- `crates/tandem-server` and engine-owned runtime modules should contain the
  feature logic.
- `packages/tandem-control-panel`, `src-tauri`, and `crates/tandem-tui` should
  stay focused on rendering, input handling, and calling engine endpoints.
- Prefer adding engine endpoints/events over adding client-side workaround
  logic.

## Related Docs

- `docs/design/ENGINE_VS_UI.md`
- `docs/ENGINE_COMMUNICATION.md`
- `docs/ENGINE_PROTOCOL_MATRIX.md`
