import type { ChatInterfaceMessage } from "../../components/ChatInterfacePanel";

export type PlannerProviderOption = {
  id: string;
  models: string[];
  configured?: boolean;
};

function safeString(value: unknown) {
  return String(value || "").trim();
}

export function buildPlannerProviderOptions(options: {
  providerCatalog: any;
  providerConfig: any;
  defaultProvider: string;
  defaultModel: string;
}): PlannerProviderOption[] {
  const rows = Array.isArray(options.providerCatalog?.all) ? options.providerCatalog.all : [];
  const configuredProviders = ((
    options.providerConfig as { providers?: Record<string, any> } | undefined
  )?.providers || {}) as Record<string, any>;
  const mapped = rows
    .map((provider: any) => ({
      id: safeString(provider?.id),
      models: Object.keys(provider?.models || {}),
      configured: !!configuredProviders[safeString(provider?.id)],
    }))
    .filter((provider: PlannerProviderOption) => !!provider.id)
    .sort((left: PlannerProviderOption, right: PlannerProviderOption) =>
      left.id.localeCompare(right.id)
    );
  const defaultProvider = safeString(options.defaultProvider);
  const defaultModel = safeString(options.defaultModel);
  if (defaultProvider && !mapped.some((row) => row.id === defaultProvider)) {
    mapped.unshift({
      id: defaultProvider,
      models: defaultModel ? [defaultModel] : [],
      configured: true,
    });
  }
  return mapped;
}

export function buildDefaultKnowledgeOperatorPreferences(subject: string) {
  const cleanSubject = safeString(subject);
  return {
    knowledge: {
      enabled: true,
      reuse_mode: "preflight",
      trust_floor: "promoted",
      read_spaces: [{ scope: "project" }],
      promote_spaces: [{ scope: "project" }],
      ...(cleanSubject ? { subject: cleanSubject } : {}),
    },
  };
}

export function buildKnowledgeRolloutGuidance(subject: string) {
  const cleanSubject = safeString(subject);
  return {
    rollout: {
      rollout_mode: "project_first_pilot",
      guardrails: [
        "Start in one project space before widening scope.",
        "Keep reuse_mode at preflight and trust_floor at promoted by default.",
        "Promote only validated outcomes; do not treat raw run output as shared truth.",
        "Use approved_default sparingly, only for reviewed default guidance.",
        "Watch reuse_reason, skip_reason, and freshness_reason during the pilot.",
        "Expand namespaces only after the pilot demonstrates stable reuse.",
      ],
      recommended_sequence: [
        "Run one workflow once to seed working knowledge.",
        "Promote validated outcomes into the project knowledge space.",
        "Run a second workflow with the same subject to verify reuse.",
        "Check that unrelated workflows still miss the same knowledge key.",
      ],
      subject: cleanSubject || null,
    },
  };
}

export function normalizePlannerConversationMessages(
  conversation: any,
  markdown = true
): ChatInterfaceMessage[] {
  const rows = Array.isArray(conversation?.messages) ? conversation.messages : [];
  return rows.map((message: any, index: number) => ({
    id: String(message?.created_at_ms || message?.createdAtMs || `${index}`),
    role: safeString(message?.role || "assistant").toLowerCase(),
    displayRole: safeString(message?.role || "assistant"),
    text: safeString(message?.text || "") || " ",
    markdown,
  }));
}
