# Tandem Engine CLI Guide

This guide documents `tandem-engine` using bash commands (macOS/Linux/WSL).

## Quick Start

```bash
tandem-engine --help
tandem-engine serve --hostname 127.0.0.1 --port 39731
tandem-engine run "Summarize this repository"
```

## Command Overview

### `serve`

Starts the HTTP/SSE runtime used by desktop and TUI clients.

```bash
tandem-engine serve --hostname 127.0.0.1 --port 39731
```

Useful options:

- `--hostname` (alias: `--host`)
- `--port`
- `--state-dir`
- `--provider`
- `--model`
- `--api-key`
- `--config`
- `TANDEM_ENGINE_HOST` (env override)
- `TANDEM_ENGINE_PORT` (env override)

### `run`

Runs one prompt and prints the model response.

```bash
tandem-engine run "Write a status update" --provider openrouter --model openai/gpt-4o-mini
```

### `parallel` (Concurrent Tasks)

Runs multiple prompts concurrently and prints a JSON summary.

```bash
cat > tasks.json << 'JSON'
{
  "tasks": [
    { "id": "science", "prompt": "Explain why the sky appears blue in 5 bullet points", "provider": "openrouter" },
    { "id": "writing", "prompt": "Write a concise professional status update for a weekly team sync", "provider": "openrouter" },
    { "id": "planning", "prompt": "Create a simple 3-step plan to learn Rust over 4 weeks", "provider": "openrouter" }
  ]
}
JSON

tandem-engine parallel --json @tasks.json --concurrency 3
```

### Web Research From CLI

Prompt-driven:

```bash
tandem-engine run "Summarize this repository https://github.com/frumu-ai/tandem"
```

Direct tools:

```bash
tandem-engine tool --json '{"tool":"webfetch_document","args":{"url":"https://github.com/frumu-ai/tandem","return":"both","mode":"auto"}}'
tandem-engine tool --json '{"tool":"websearch","args":{"query":"frumu tandem engine architecture","limit":5}}'
```

### `tool`

Executes a built-in tool call.

Input formats:

- raw JSON string
- `@path/to/file.json`
- `-` (stdin)

```bash
tandem-engine tool --json '{"tool":"workspace_list_files","args":{"path":"."}}'
tandem-engine tool --json @payload.json
cat payload.json | tandem-engine tool --json -
```

Payload shape:

```json
{
  "tool": "workspace_list_files",
  "args": {
    "path": "."
  }
}
```

### `providers`

Lists supported provider IDs.

```bash
tandem-engine providers
```

### `chat`

Reserved for future interactive REPL support.

## Serve + API Workflow

Start engine:

```bash
tandem-engine serve --hostname 127.0.0.1 --port 39731
```

In a second terminal:

```bash
# 1) Create session
SID="$(curl -s -X POST 'http://127.0.0.1:39731/session' -H 'content-type: application/json' -d '{}' | jq -r '.id')"

# 2) Build message payload
MSG='{"parts":[{"type":"text","text":"Give me 3 practical Rust learning tips."}]}'

# 3) Append message
curl -s -X POST "http://127.0.0.1:39731/session/$SID/message" -H 'content-type: application/json' -d "$MSG" >/dev/null

# 4) Start async run and get stream path
RUN_JSON="$(curl -s -X POST "http://127.0.0.1:39731/session/$SID/prompt_async?return=run" -H 'content-type: application/json' -d "$MSG")"
ATTACH_PATH="$(echo "$RUN_JSON" | jq -r '.attachEventStream')"
echo "$RUN_JSON" | jq .

# 5) Stream events
curl -N "http://127.0.0.1:39731${ATTACH_PATH}"
```

Synchronous one-shot response:

```bash
RESP="$(curl -s -X POST "http://127.0.0.1:39731/session/$SID/prompt_sync" -H 'content-type: application/json' -d "$MSG")"
echo "$RESP" | jq .
```

Extract latest assistant text from response history:

```bash
echo "$RESP" | jq -r '[.[] | select(.info.role=="assistant")][-1].parts[] | select(.type=="text") | .text'
```

## State Directory Resolution

When `--state-dir` is omitted:

1. `--state-dir`
2. `TANDEM_STATE_DIR`
3. Shared Tandem canonical path
4. Local fallback `.tandem`

## Troubleshooting

- `unsupported provider ...`: run `tandem-engine providers`
- `tool is required in input json`: include non-empty `tool`
- `invalid hostname or port`: verify `--hostname` / `--port`

For Windows users, run these commands in WSL for the same behavior.
