# Global Memory Model and Governance

## Summary

Memory is an always-on global runtime primitive. Records are primarily partitioned by `user_id` and can be tagged with optional metadata (`project_tag`, `channel_tag`, `host_tag`) for relevance filtering.

## Visibility Model

- `private`: default visibility for newly captured memory.
- `shared`: promoted memory intended for broader reuse.
- `demoted`: represented by `visibility=private` with `demoted=true`; excluded from normal recall until re-promoted.

## Partitioning and Isolation

Global memory is isolated by user identity first, then narrowed by optional tags:

- Required partition key: `user_id`
- Optional tags: `project_tag`, `channel_tag`, `host_tag`
- Run provenance: `run_id`, `session_id`, `source_type`, `tool_name`

This keeps cross-project learning possible for the same user while preventing cross-user leakage.

## Always-On Pipeline

Write path (automatic by default):

1. Capture candidates from run/event stream (`user`, `assistant`, `tool`, `approval`, `auth`, `todo/question`).
2. Scrub/redact secrets and sensitive payloads.
3. Deduplicate and persist to `memory.sqlite` (`memory_records` + FTS index).
4. Emit observability events:
   - `memory.write.attempted`
   - `memory.write.succeeded`
   - `memory.write.skipped`

Read path (automatic by default):

1. Before provider iterations, query global memory using active prompt context.
2. Score + filter by relevance/recency/visibility and tag fit.
3. Inject bounded memory context into prompt assembly.
4. Emit observability events:
   - `memory.search.performed`
   - `memory.context.injected`

## API Contracts

- `POST /memory/put`
- `POST /memory/search`
- `GET /memory` (supports `user_id`, `q`, `limit`, `offset`)
- `POST /memory/promote`
- `POST /memory/demote`
- `DELETE /memory/{id}`
- `GET /memory/audit`

## Safety Controls

- Secrets/tokens/credentials are redacted or blocked before persistence.
- Memory promotion is auditable and can be reverted with demotion.
- Retrieval uses score thresholds and budget limits to reduce prompt poisoning by irrelevant memory.
