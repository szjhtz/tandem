# Shared Resources (Blackboard)

## Summary

Shared resources provide durable, revisioned coordination across agents and clients.

## Namespaces

- `run/*`
- `mission/*`
- `project/*`
- `team/*`

## Resource Model

- `key`: hierarchical namespace key
- `value`: JSON document
- `rev`: monotonic revision
- `updated_at`, `updated_by`
- optional `ttl_ms`

## Concurrency

- Optimistic concurrency via `if_match_rev`.
- Lease-assisted lock ownership can reuse `/global/lease/*`.

### Claims and leases

Task claims are recorded as revisioned JSON resources. A typical claim carries:

- `task_id`
- `owner_id`
- `lease_id`
- `lease_expires_at`
- `rev`
- `claimed_at`
- `retries`

Ownership is deterministic. Another worker cannot claim the same task unless the lease expires, the claim is released, or the task is transitioned by policy.

### Runnable filtering

Workers should only claim tasks that are `runnable`. `blocked` tasks remain unclaimable until dependencies or gates are satisfied. The workboard drives this progression and emits updates when tasks become `runnable`.

### Failure and retry

On failure, the claim record and task state transition to `failed` or `rework`. Retry counts increment. The board keeps the truth and exposes clean pickup by another worker later.

## API Surface

- `GET /resource?prefix=...`
- `GET /resource/{key}`
- `PUT /resource/{key}`
- `PATCH /resource/{key}`
- `GET /resource/events?prefix=...` (SSE)

## Eventing

- Emit `resource.updated` and `resource.deleted` as `EngineEvent`.
- Prefix filters must only deliver matching keys.

### Related docs

- [Workboard](./WORKBOARD.md)
- [Release Notes](../RELEASE_NOTES.md)
