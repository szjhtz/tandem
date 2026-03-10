# Coder Workspace Kanban

Updated: 2026-03-10

## Done

- Phase 1 shell: rename the desktop `Developer` destination to `Coder`.
- Phase 1 shell: add a dedicated `CoderWorkspacePage` with `Create` and `Runs`.
- Phase 1 shell: keep the current legacy coder inspector available inside the new workspace.
- Phase 1 docs: create this kanban board under `docs/internal`.
- Phase 2 contract: add typed coder metadata in the frontend bridge and mission-builder path.
- Phase 2 contract: expose explicit linked context run IDs from the automation run detail API.
- Phase 4 projection: show coder-tagged Automation V2 runs directly in the Coder `Runs` tab.
- Phase 4 projection: scope projected coder runs to the active user project path when possible.
- Phase 5 operator slice: load selected run detail, transcript snapshot, gate state, and operator controls from existing Automation V2 APIs.
- Phase 5 extraction: split coder run list, run detail, action toolbar, and run utilities into shared components under `src/components/coder/shared`.
- Phase 3: detect user repo context from the active project path and preload repo root, remote slug, and branch information in Coder create.
- Phase 5 detail tabs: add automation-backed `Overview`, `Transcripts`, `Context`, and `Artifacts` tabs in the shared coder detail view using linked session and context APIs.
- Phase 5 memory projection: replace the automation-backed `Memory` placeholder with linked context artifact parsing for `coder_memory_hits` and `coder_memory_candidate` payloads.
- Phase 5 polish: add shared artifact preview browsing and context-to-artifact navigation inside the coder detail view.
- Phase 6 templates: persist the selected coder preset and local saved templates in the desktop Coder create flow.
- Phase 6 templates: add saved-template apply and delete actions in the desktop Coder create flow.
- Phase 6 templates: replace prompt-based template save with an explicit local template editor for naming, notes, and repo metadata capture.
- Phase 6 templates: support editing existing local templates from the Coder create flow.
- Phase 6 cross-links: open a selected coder run directly in Agent Automation.
- Phase 6 cross-links: open a selected coder run's linked context run directly in Command Center.
- Phase 6 cross-links: add direct run-list jumps into Agent Automation and Command Center without opening the detail pane first.

## Next

- Phase 6 polish: consider promoting local templates into a stronger persisted preset model once the current shelf shape is validated.
- Phase 6 polish: decide whether saved coder templates should stay desktop-local or move into a shared project/server-backed preset contract.

## Notes

- New coding swarms execute through the existing mission builder and automation runtime.
- The desktop now consumes explicit backend-linked context run IDs for automation-backed coder runs.
- Legacy coder runs remain visible until the hybrid run model is complete.
