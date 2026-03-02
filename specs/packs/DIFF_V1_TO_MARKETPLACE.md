# Tandem Pack Diff: v1 -> Marketplace Profile

## Goal

Capture minimal, backward-compatible additions to support public marketplace workflows.

## Unchanged

- Root marker rule: only root `tandempack.yaml` qualifies for pack detection.
- No install scripts.
- Capability IDs remain the portability contract.
- Safe archive checks remain mandatory.

## Additions

1. Top-level identity fields:

- `manifest_schema_version`
- `pack_id` (immutable)

2. Marketplace metadata block:

- `marketplace.publisher.*`
- `marketplace.listing.*`

3. Optional signature file:

- `tandempack.sig` (root)

4. Explicit completeness validation:

- `contents` lists all included installable entities.

5. PackManager lifecycle requirements:

- inspect/install/uninstall/export/update surfaces.

6. Permission/risk upgrade gate:

- install and update must show risk sheet.
- updates with scope increase require re-approval.

7. Routine safety rule:

- routines install disabled by default.
- only trusted source + policy can auto-enable.

## Compatibility Rules

- Local installs can omit marketplace metadata and signature by policy.
- Marketplace publishing requires metadata completeness and scan compliance.
- Existing v1 behavior is preserved unless marketplace profile is invoked.

## Acceptance Mapping

- Publisher identity + verification + signature status display: added.
- Risk sheet before install/update: added.
- Marketplace rejection for unsafe/noncompliant packs: added.
- Permission scope diff + re-approval on upgrade: added.
