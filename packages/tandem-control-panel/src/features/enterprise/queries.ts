import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, isTransientEngineError } from "../../lib/api";

export type EnterpriseTenantContext = {
  org_id?: string;
  workspace_id?: string;
  deployment_id?: string | null;
  actor_id?: string | null;
  source?: string;
};

export type EnterpriseRequestPrincipal = {
  actor_id?: string | null;
  source?: string;
};

export type EnterpriseNoopBase = {
  tenant_context?: EnterpriseTenantContext;
  request_principal?: EnterpriseRequestPrincipal;
  bridge_state?: string;
  status?: string;
  message?: string;
};

export type EnterpriseOrganizationUnit = {
  unit_id: string;
  taxonomy_id?: string;
  display_name: string;
  kind?: string;
  parent_unit_id?: string | null;
  state?: string;
  description?: string | null;
  labels?: string[];
};

export type EnterpriseResourceRef = {
  organization_id: string;
  workspace_id: string;
  project_id?: string | null;
  resource_kind: string;
  resource_id: string;
  parent_path?: unknown[];
  branch_id?: string | null;
  path_prefix?: string | null;
};

export type EnterpriseIngestionPolicy = {
  allow_indexing?: boolean;
  allow_prompt_context?: boolean;
  require_review?: boolean;
  max_depth?: number | null;
};

export type EnterpriseSourceBinding = {
  binding_id: string;
  connector_id: string;
  source_type: string;
  native_source_id: string;
  source_root_label?: string | null;
  resource_ref: EnterpriseResourceRef;
  data_class: string;
  state?: string;
  credential_ref_id?: string | null;
  ingestion_policy?: EnterpriseIngestionPolicy;
};

export type EnterpriseOrgUnitsResponse = EnterpriseNoopBase & {
  org_units?: EnterpriseOrganizationUnit[];
  count?: number;
};

export type EnterpriseSourceBindingsResponse = EnterpriseNoopBase & {
  source_bindings?: EnterpriseSourceBinding[];
  count?: number;
};

export type CreateEnterpriseOrganizationUnitInput = {
  unit_id: string;
  display_name: string;
  taxonomy_id?: string;
  kind?: string;
  parent_unit_id?: string;
  description?: string;
  labels?: string[];
};

export type CreateEnterpriseSourceBindingInput = {
  binding_id: string;
  connector_id: string;
  source_type: string;
  native_source_id: string;
  source_root_label?: string;
  resource_ref: EnterpriseResourceRef;
  data_class: string;
  credential_ref_id?: string;
  ingestion_policy?: EnterpriseIngestionPolicy;
};

export type UpdateEnterpriseSourceBindingInput = {
  binding_id: string;
  state?: string;
  source_root_label?: string;
  credential_ref_id?: string;
  ingestion_policy?: EnterpriseIngestionPolicy;
};

const retryEnterpriseQuery = (failureCount: number, error: unknown) =>
  isTransientEngineError(error) ? failureCount < 6 : failureCount < 2;

export function useEnterpriseOrgUnits(enabled = true) {
  return useQuery({
    queryKey: ["enterprise", "org-units"],
    queryFn: () =>
      api("/api/engine/enterprise/org-units", {
        method: "GET",
      }) as Promise<EnterpriseOrgUnitsResponse>,
    enabled,
    staleTime: 15000,
    retry: retryEnterpriseQuery,
  });
}

export function useEnterpriseSourceBindings(enabled = true) {
  return useQuery({
    queryKey: ["enterprise", "source-bindings"],
    queryFn: () =>
      api("/api/engine/enterprise/source-bindings", {
        method: "GET",
      }) as Promise<EnterpriseSourceBindingsResponse>,
    enabled,
    staleTime: 15000,
    retry: retryEnterpriseQuery,
  });
}

export function useCreateEnterpriseOrgUnit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEnterpriseOrganizationUnitInput) =>
      api("/api/engine/enterprise/org-units", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enterprise", "org-units"] });
    },
  });
}

export function useCreateEnterpriseSourceBinding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEnterpriseSourceBindingInput) =>
      api("/api/engine/enterprise/source-bindings", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enterprise", "source-bindings"] });
    },
  });
}

export function useUpdateEnterpriseSourceBinding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ binding_id, ...input }: UpdateEnterpriseSourceBindingInput) =>
      api(`/api/engine/enterprise/source-bindings/${encodeURIComponent(binding_id)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enterprise", "source-bindings"] });
    },
  });
}
