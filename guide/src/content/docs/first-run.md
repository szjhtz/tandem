---
title: First Run Checklist
---

Use this checklist after CLI binary install or source build.

## 1. Verify engine connectivity

Run the master CLI first, then open TUI or the direct engine runtime.

```bash
tandem doctor
tandem status
tandem service status
tandem engine status
tandem panel init   # optional if the control-panel add-on is installed
tandem panel open   # optional if the control-panel add-on is installed
tandem-engine serve --hostname 127.0.0.1 --port 39731
```

```bash
tandem-tui
```

## 2. Configure provider

Pick a provider and set credentials through the TUI setup flow or environment/config.

Common environment variables:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `OPENROUTER_API_KEY`

See [Configuration](./configuration/) for full config precedence.

## 3. Open workspace

Grant access to your target project directory and keep scope explicit.

## 4. Validate tools and approval flow

Run one safe prompt and confirm request/permission handling works as expected.

Example prompt:

```text
Summarize this repository and list the top 3 areas to improve.
```

## 5. Troubleshoot quickly

- TUI commands: [TUI Commands](./reference/tui-commands/)
- Engine CLI: [Engine Commands](./reference/engine-commands/)
