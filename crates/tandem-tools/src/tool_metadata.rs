use serde_json::Value;
use tandem_types::{ToolCapabilities, ToolDomain, ToolEffect, ToolSchema};

pub(crate) fn tool_schema(
    name: &'static str,
    description: impl Into<String>,
    input_schema: Value,
) -> ToolSchema {
    ToolSchema::new(name, description, input_schema)
}

pub(crate) fn tool_schema_with_capabilities(
    name: &'static str,
    description: impl Into<String>,
    input_schema: Value,
    capabilities: ToolCapabilities,
) -> ToolSchema {
    ToolSchema::new(name, description, input_schema).with_capabilities(capabilities)
}

pub(crate) fn workspace_read_capabilities() -> ToolCapabilities {
    ToolCapabilities::new()
        .effect(ToolEffect::Read)
        .domain(ToolDomain::Workspace)
        .reads_workspace()
        .preferred_for_discovery()
}

pub(crate) fn workspace_write_capabilities() -> ToolCapabilities {
    ToolCapabilities::new()
        .effect(ToolEffect::Write)
        .domain(ToolDomain::Workspace)
        .writes_workspace()
        .requires_verification()
}

pub(crate) fn workspace_search_capabilities() -> ToolCapabilities {
    ToolCapabilities::new()
        .effect(ToolEffect::Search)
        .domain(ToolDomain::Workspace)
        .reads_workspace()
        .preferred_for_discovery()
}

pub(crate) fn shell_execution_capabilities() -> ToolCapabilities {
    ToolCapabilities::new()
        .effect(ToolEffect::Execute)
        .domain(ToolDomain::Shell)
        .reads_workspace()
        .writes_workspace()
        .network_access()
        .destructive()
        .requires_verification()
}

pub(crate) fn web_fetch_capabilities() -> ToolCapabilities {
    ToolCapabilities::new()
        .effect(ToolEffect::Fetch)
        .domain(ToolDomain::Web)
        .network_access()
        .preferred_for_discovery()
}

pub(crate) fn apply_patch_capabilities() -> ToolCapabilities {
    ToolCapabilities::new()
        .effect(ToolEffect::Patch)
        .domain(ToolDomain::Workspace)
        .reads_workspace()
        .writes_workspace()
        .requires_verification()
}
