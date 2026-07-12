#!/usr/bin/env bash
set -euo pipefail

# Print true when engine-centric cross-platform jobs are required. Unknown or
# empty change sets fail open so a classification mistake can only run more CI.
saw_file=false
while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  saw_file=true
  case "$path" in
    .github/workflows/ci.yml | \
      CHANGELOG.md | \
      RELEASE_NOTES.md | \
      crates/tandem-core/src/session_repository.rs | \
      crates/tandem-server/src/app/state/automation_v2_orchestration_store.rs | \
      crates/tandem-server/src/runtime_event_log.rs | \
      crates/tandem-server/src/runtime_event_store.rs | \
      crates/tandem-server/src/stateful_runtime/* | \
      docs/ENGINE_CONFIGURATION.md | \
      docs/POSTGRES_STATEFUL_STORAGE.md | \
      docs/README.md | \
      guide/src/content/docs/reference/engine-commands.md | \
      guide/src/content/docs/reference/engine-configuration.md | \
      guide/src/content/docs/storage-maintenance.md | \
      scripts/verify-docs-parity.mjs)
      ;;
    *)
      echo true
      exit 0
      ;;
  esac
done

if [[ "$saw_file" == true ]]; then
  echo false
else
  echo true
fi
