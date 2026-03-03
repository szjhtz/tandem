# Pack Builder 0.4.1 Kanban

Last updated: 2026-03-03
Owner: Tandem Engine

## In Progress

- [x] Add MCP-first `pack_builder` engine tool (preview/apply)
- [x] Register `pack_builder` tool in tandem-server runtime startup
- [ ] Generate packs with explicit MCP tool invocations in `missions/` and `agents/`
- [ ] Connector discovery preview with candidate MCP servers + selection
- [ ] Apply flow: MCP register/connect + pack install + paused routine registration
- [ ] Add `pack_builder` built-in agent profile
- [ ] Add channel heuristic routing to `pack_builder`
- [ ] Add `pack_presets` registry support and persist connector requirements
- [ ] Add SDK/client/control-panel compatibility updates for new preset shape
- [ ] Add tests for MCP-required external goals and connector invocation
- [ ] Update `CHANGELOG.md` for v0.4.1
- [ ] Update `docs/RELEASE_NOTES.md` for v0.4.1

## Completed

- [x] Create implementation kanban for Pack Builder v0.4.1

## Notes

- MCP connectors are default for external data/actions.
- Built-ins are fallback only if no viable MCP catalog match exists, and must emit warnings.
- Routines from generated packs are installed paused/disabled by default.
