# Tandem Engine vs. Opencode SDK: Parity Analysis

## Executive Summary

**Tandem Engine** is rapidly approaching parity with **Opencode SDK** and, with the upcoming **Memory Refactor**, will surpass it in long-term context capabilities.

| Feature        | Opencode (Node/TS)              | Tandem (Rust)                 | Status                                  |
| :------------- | :------------------------------ | :---------------------------- | :-------------------------------------- |
| **Runtime**    | Node.js + Vercel AI SDK         | Rust (Native)                 | ✅ **Superior** (Faster, lighter)       |
| **Agent Loop** | `ai` SDK (`generateObject`)     | Custom Rust Loop              | ✅ **Parity** (Functionally equivalent) |
| **Skills**     | Advanced (URL/External loading) | Basic (File-based)            | ⚠️ **Partial** (Needs loader upgrade)   |
| **Context**    | "Compaction" (LLM Summary)      | **Memory** (Vector + Summary) | 🚀 **Tandem Advantage** (Planned)       |
| **Tools**      | Standard (Read, Write, Bash)    | Standard + **Browser**        | 🚀 **Tandem Advantage** (Browser Plan)  |

## detailed Comparison

### 1. Architecture & Performance

- **Opencode**: Heavy dependency tree (`node_modules`), reliant on Vercel AI SDK abstractions. Good developer experience (DX) but heavier runtime (~100MB+ overhead).
- **Tandem**: Zero-dependency binary (excluding sidecars). Fast startup (<100ms). The migration to `tandem-memory` and `tandem-browser` sidecars keeps the core engine pristine.

### 2. Context Management

- **Opencode**: Uses **Compaction**. When context fills up, it triggers a "summarize" task to compress the history. It does **not** appear to use a vector database for semantic recall of past sessions.
- **Tandem**: Is implementing **Semantic Memory** (`sqlite-vec` + `fastembed`). This allows "recall" (`"How did we fix this last week?"`) which Opencode's linear compaction cannot easily do. Tandem will _also_ implement compaction (Session Summarization) for a hybrid approach.

### 3. Skill System

- **Opencode**: Has a robust `Skill` module that can scan `.agents`, `.claude`, and `.opencode` directories, and even download skills from URLs.
- **Tandem**: Now scans project + global ecosystem roots (`.tandem/skill`, `~/.tandem/skills`, `~/.agents/skills`, `~/.claude/skills`, plus appdata compatibility) with priority dedupe, and supports per-agent equipped skill filters.
- **Gap:** **Partial**. URL import/equip-unequip runtime commands remain to reach full parity.

### 4. Browser Automation

- **Opencode**: Uses `webfetch` (likely static HTML fetching via `fetch` or simple scraper).
- **Tandem**: The **Browser Automation Plan** (`chromiumoxide` sidecar) provides full "Headless Chrome" capabilities (clicking, typing, screenshots), enabling end-to-end testing agents that Opencode currently lacks.

## Recommendation

**Tandem is the "Pro" version.**
By controlling the entire stack in Rust, we own the "Brain" (Memory) and "Eyes" (Browser) in a way that a Node.js SDK wrapper cannot easily match without massive bloat.

**Priorities to achieve "Super-Parity":**

1.  **Execute Memory Refactor** (The "Killer Feature").
2.  **Upgrade `tandem-skills`** to scan external directories (Parity).
3.  **Build Browser Sidecar** (The "Differentiator").
