# `.agents` Guide

Local agent instructions for this repo live here.

## Start Here

- Read `architecture/engine-first-boundary.md` before implementing cross-client features.
- Tandem is engine-first: shared logic belongs in the engine, and clients should stay thin.

## Architecture

- `architecture/engine-first-boundary.md`
  Rules for keeping business logic, state transitions, policy, orchestration, dedupe, and cross-client behavior in the engine instead of the GUI/TUI clients.

## Workflows

- `workflows/add-http-test.md`
  How to add HTTP handler tests to `tandem-server` without bloating the wrong files.

- `workflows/add-rust-test.md`
  How to place Rust tests in focused test files instead of growing large source files.

## Decision Rule

Before adding logic to a client, ask:

- Does this need to behave the same in control panel, desktop, TUI, SDK, or automation?
- Does this need durable state, canonical events, or engine enforcement?

If yes, put it in the engine first and have the client consume that contract.
