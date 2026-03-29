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
