import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type ArtifactRecord,
  type JsonObject,
  type RunRecordResponse,
  type SystemCapabilitiesResponse,
  type SystemEngineStatusResponse,
} from "../api";
import { useEngineEventStream } from "../hooks/useEngineEventStream";

const OPS_MODE_KEY = "tandem_portal_ops_api_mode";

type OpsTab =
  | "overview"
  | "events"
  | "missions"
  | "definitions"
  | "agentTeam"
  | "mcp"
  | "channels"
  | "artifacts";

const tabLabel: Record<OpsTab, string> = {
  overview: "Overview",
  events: "Events",
  missions: "Missions",
  definitions: "Automations",
  agentTeam: "Agent Team",
  mcp: "MCP",
  channels: "Channels",
  artifacts: "Artifacts",
};

const str = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const pretty = (value: unknown): string => JSON.stringify(value, null, 2);

const parseMaybeJson = (input: string): JsonObject | null => {
  try {
    const parsed = JSON.parse(input) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as JsonObject;
    }
    return null;
  } catch {
    return null;
  }
};

const runIdFromRecord = (record: RunRecordResponse): string => {
  const topLevel = record as unknown as JsonObject;
  const direct =
    str(topLevel.runID) || str(topLevel.runId) || str(topLevel.run_id) || str(topLevel.id);
  if (direct) return direct;
  const run = (record.run || null) as JsonObject | null;
  if (!run) return "";
  return str(run.run_id) || str(run.runId) || str(run.runID) || str(run.id);
};

export const OpsWorkspace: React.FC = () => {
  const [tab, setTab] = useState<OpsTab>("overview");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [health, setHealth] = useState<JsonObject | null>(null);
  const [capabilities, setCapabilities] = useState<SystemCapabilitiesResponse | null>(null);
  const [engineStatus, setEngineStatus] = useState<SystemEngineStatusResponse | null>(null);

  const [missionTitle, setMissionTitle] = useState("Ops Created Mission");
  const [missionGoal, setMissionGoal] = useState(
    "Validate mission orchestration through portal ops."
  );
  const [missionWorkItem, setMissionWorkItem] = useState("Kick off mission from web ops");
  const [missions, setMissions] = useState<JsonObject[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState("");
  const [missionEventJson, setMissionEventJson] = useState(
    '{"type":"mission_started","mission_id":""}'
  );

  const [apiFamily, setApiFamily] = useState<"routines" | "automations">(() => {
    const saved = localStorage.getItem(OPS_MODE_KEY);
    return saved === "routines" ? "routines" : "automations";
  });
  const [definitionId, setDefinitionId] = useState(`ops-${Date.now()}`);
  const [definitionName, setDefinitionName] = useState("Ops Managed Automation");
  const [definitionObjective, setDefinitionObjective] = useState(
    "Read one local file and report a one-line summary."
  );
  const [definitionCriteria, setDefinitionCriteria] = useState(
    "At least one file read attempt is completed."
  );
  const [definitions, setDefinitions] = useState<JsonObject[]>([]);
  const [runs, setRuns] = useState<RunRecordResponse[]>([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectedRunRecord, setSelectedRunRecord] = useState<RunRecordResponse | null>(null);

  const [workshopInput, setWorkshopInput] = useState(
    "Draft a mission for monitoring release notes and posting a concise summary."
  );

  const [spawnMissionId, setSpawnMissionId] = useState("");
  const [spawnRole, setSpawnRole] = useState("worker");
  const [spawnTemplateId, setSpawnTemplateId] = useState("");
  const [spawnJustification, setSpawnJustification] = useState("Requested from web ops workspace.");
  const [agentTemplates, setAgentTemplates] = useState<JsonObject[]>([]);
  const [agentInstances, setAgentInstances] = useState<JsonObject[]>([]);
  const [agentMissionRollups, setAgentMissionRollups] = useState<JsonObject[]>([]);
  const [agentApprovals, setAgentApprovals] = useState<JsonObject[]>([]);

  const [mcpName, setMcpName] = useState("arcade");
  const [mcpTransport, setMcpTransport] = useState("");
  const [mcpBearer, setMcpBearer] = useState("");
  const [mcpServers, setMcpServers] = useState<Record<string, unknown>>({});
  const [mcpTools, setMcpTools] = useState<unknown[]>([]);
  const [toolIds, setToolIds] = useState<string[]>([]);

  const [channelsConfig, setChannelsConfig] = useState<JsonObject | null>(null);
  const [channelsStatus, setChannelsStatus] = useState<JsonObject | null>(null);
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramUsers, setTelegramUsers] = useState("*");
  const [discordToken, setDiscordToken] = useState("");
  const [discordUsers, setDiscordUsers] = useState("*");
  const [discordGuild, setDiscordGuild] = useState("");
  const [slackToken, setSlackToken] = useState("");
  const [slackChannel, setSlackChannel] = useState("");
  const [slackUsers, setSlackUsers] = useState("*");

  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([]);
  const [selectedArtifactUri, setSelectedArtifactUri] = useState("");
  const [artifactPreview, setArtifactPreview] = useState<JsonObject | null>(null);

  const { events, connected: eventsConnected, clear: clearEvents } = useEngineEventStream(true);
  const [eventFilter, setEventFilter] = useState("");

  const filteredEvents = useMemo(() => {
    const f = eventFilter.trim().toLowerCase();
    if (!f) return events;
    return events.filter((evt) => evt.type.toLowerCase().includes(f));
  }, [events, eventFilter]);

  const setApiMode = (value: "routines" | "automations") => {
    localStorage.setItem(OPS_MODE_KEY, value);
    setApiFamily(value);
  };

  const withBusy = async (fn: () => Promise<void>) => {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const refreshOverview = async () => {
    const [h, caps, status] = await Promise.all([
      api.getSystemHealth(),
      api.getSystemCapabilities(),
      api.getEngineServiceStatus(),
    ]);
    setHealth(h as JsonObject);
    setCapabilities(caps);
    setEngineStatus(status);
  };

  const refreshMissions = async () => {
    const list = await api.listMissions();
    setMissions(list.missions || []);
  };

  const refreshDefinitions = useCallback(async () => {
    const [defs, runRows] = await Promise.all([
      apiFamily === "automations" ? api.listAutomations() : api.listRoutines(),
      api.listRuns(apiFamily, 25),
    ]);
    if (apiFamily === "automations") {
      setDefinitions((defs.automations || []) as JsonObject[]);
    } else {
      setDefinitions((defs.routines || []) as JsonObject[]);
    }
    setRuns((runRows.runs || []) as RunRecordResponse[]);
  }, [apiFamily]);

  const refreshAgentTeam = async () => {
    const [t, i, m, a] = await Promise.all([
      api.listAgentTeamTemplates(),
      api.listAgentTeamInstances(),
      api.listAgentTeamMissions(),
      api.listAgentTeamApprovals(),
    ]);
    setAgentTemplates(t.templates || []);
    setAgentInstances(i.instances || []);
    setAgentMissionRollups(m.missions || []);
    setAgentApprovals(a.spawnApprovals || []);
  };

  const refreshMcp = async () => {
    const [servers, tools, ids] = await Promise.all([
      api.listMcpServers(),
      api.listMcpTools(),
      api.listToolIds(),
    ]);
    setMcpServers(servers);
    setMcpTools(tools || []);
    setToolIds(ids || []);
  };

  const refreshChannels = async () => {
    const [cfg, status] = await Promise.all([api.getChannelsConfig(), api.getChannelsStatus()]);
    setChannelsConfig(cfg as unknown as JsonObject);
    setChannelsStatus(status as unknown as JsonObject);
  };

  const refreshArtifacts = useCallback(async () => {
    if (!selectedRunId) {
      setArtifacts([]);
      return;
    }
    const rows = await api.listRunArtifacts(apiFamily, selectedRunId);
    setArtifacts(rows.artifacts || []);
  }, [apiFamily, selectedRunId]);

  useEffect(() => {
    void withBusy(refreshOverview);
  }, []);

  useEffect(() => {
    if (tab === "missions") void withBusy(refreshMissions);
    if (tab === "definitions") void withBusy(refreshDefinitions);
    if (tab === "agentTeam") void withBusy(refreshAgentTeam);
    if (tab === "mcp") void withBusy(refreshMcp);
    if (tab === "channels") void withBusy(refreshChannels);
    if (tab === "artifacts") void withBusy(refreshArtifacts);
  }, [tab, apiFamily, selectedRunId, refreshArtifacts, refreshDefinitions]);

  const createMission = async () => {
    await withBusy(async () => {
      const created = await api.createMission({
        title: missionTitle,
        goal: missionGoal,
        work_items: [{ title: missionWorkItem }],
      });
      const mission = (created.mission || {}) as JsonObject;
      const missionId = str(mission.mission_id);
      if (missionId) {
        setSelectedMissionId(missionId);
        setMissionEventJson(
          pretty({
            type: "mission_started",
            mission_id: missionId,
          })
        );
      }
      await refreshMissions();
    });
  };

  const applyMissionEvent = async () => {
    await withBusy(async () => {
      const payload = parseMaybeJson(missionEventJson);
      if (!payload) throw new Error("Mission event payload must be valid JSON object.");
      const missionId = str(payload.mission_id) || selectedMissionId;
      if (!missionId) throw new Error("Mission ID is required.");
      await api.applyMissionEvent(missionId, payload);
      await refreshMissions();
      setSelectedMissionId(missionId);
    });
  };

  const createDefinition = async () => {
    await withBusy(async () => {
      const successCriteria = definitionCriteria
        .split(";")
        .map((x) => x.trim())
        .filter((x) => x.length > 0);

      if (apiFamily === "automations") {
        await api.createAutomation({
          automation_id: definitionId,
          name: definitionName,
          schedule: { interval_seconds: { seconds: 3600 } },
          mission: {
            objective: definitionObjective,
            success_criteria: successCriteria,
            entrypoint_compat: "mission.default",
          },
          policy: {
            tool: {
              run_allowlist: ["read"],
              external_integrations_allowed: false,
            },
            approval: {
              requires_approval: false,
            },
          },
          mode: "orchestrated",
          output_targets: [`file://reports/${definitionId}.json`],
        });
      } else {
        await api.createRoutine({
          routine_id: definitionId,
          name: definitionName,
          schedule: { interval_seconds: { seconds: 3600 } },
          entrypoint: "mission.default",
          args: {
            prompt: definitionObjective,
            success_criteria: successCriteria,
          },
          allowed_tools: ["read"],
          requires_approval: false,
          external_integrations_allowed: false,
          output_targets: [`file://reports/${definitionId}.json`],
        });
      }
      await refreshDefinitions();
    });
  };

  const runNow = async (id: string) => {
    await withBusy(async () => {
      const result = await api.runNowDefinition(apiFamily, id);
      const run = (result.run || null) as JsonObject | null;
      const runId = run
        ? str(run.run_id) || str(run.runID) || str(run.runId) || str(run.id)
        : str(result.runID) || str(result.runId) || str(result.run_id);
      if (runId) {
        setSelectedRunId(runId);
      }
      await refreshDefinitions();
    });
  };

  const controlEngine = async (action: "start" | "stop" | "restart") => {
    await withBusy(async () => {
      await api.controlEngine(action);
      await refreshOverview();
    });
  };

  const loadRunDetails = async (runId: string) => {
    await withBusy(async () => {
      const details = await api.getRun(apiFamily, runId);
      setSelectedRunRecord(details);
      setSelectedRunId(runId);
    });
  };

  const runAction = async (action: "approve" | "deny" | "pause" | "resume", runId: string) => {
    await withBusy(async () => {
      if (action === "approve") await api.approveRun(apiFamily, runId, "approved from portal ops");
      if (action === "deny") await api.denyRun(apiFamily, runId, "denied from portal ops");
      if (action === "pause") await api.pauseRun(apiFamily, runId, "paused from portal ops");
      if (action === "resume") await api.resumeRun(apiFamily, runId, "resumed from portal ops");
      await refreshDefinitions();
    });
  };

  const runWorkshop = async () => {
    await withBusy(async () => {
      const sessionId = await api.createSession("Mission Workshop");
      const prompt = `Return strict JSON with keys objective, success_criteria (array of strings), and briefing. Input: ${workshopInput}`;
      const { runId } = await api.startAsyncRun(sessionId, prompt);
      await new Promise((resolve) => window.setTimeout(resolve, 2500));
      const messages = await api.getSessionMessages(sessionId);
      const lastAssistant = [...messages].reverse().find((m) => m.info?.role === "assistant");
      const text = (lastAssistant?.parts || [])
        .filter((part) => part.type === "text" && part.text)
        .map((part) => part.text)
        .join("\n")
        .trim();
      if (!text) throw new Error(`Mission workshop returned no assistant text (run=${runId})`);

      const jsonCandidate = text.match(/\{[\s\S]*\}/)?.[0];
      const payload = jsonCandidate ? parseMaybeJson(jsonCandidate) : null;
      if (!payload) throw new Error(`Mission workshop did not return parseable JSON:\n${text}`);

      const objective = str(payload.objective);
      const briefing = str(payload.briefing);
      const criteria = Array.isArray(payload.success_criteria)
        ? payload.success_criteria.map((row) => str(row)).filter((row) => row.length > 0)
        : [];

      if (objective) setDefinitionObjective(objective);
      if (briefing) setMissionGoal(briefing);
      if (criteria.length > 0) setDefinitionCriteria(criteria.join("; "));
    });
  };

  const spawnAgent = async () => {
    await withBusy(async () => {
      await api.spawnAgentTeam({
        missionID: spawnMissionId || undefined,
        role: spawnRole,
        templateID: spawnTemplateId || undefined,
        source: "ui_action",
        justification: spawnJustification,
      });
      await refreshAgentTeam();
    });
  };

  const approveSpawn = async (approvalId: string, deny: boolean) => {
    await withBusy(async () => {
      if (deny) {
        await api.denyAgentTeamSpawn(approvalId, "denied from portal ops");
      } else {
        await api.approveAgentTeamSpawn(approvalId, "approved from portal ops");
      }
      await refreshAgentTeam();
    });
  };

  const saveChannel = async (channel: "telegram" | "discord" | "slack") => {
    await withBusy(async () => {
      if (channel === "telegram") {
        await api.putChannel("telegram", {
          bot_token: telegramToken,
          allowed_users: telegramUsers
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
          mention_only: false,
        });
      }
      if (channel === "discord") {
        await api.putChannel("discord", {
          bot_token: discordToken,
          guild_id: discordGuild || null,
          allowed_users: discordUsers
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
          mention_only: true,
        });
      }
      if (channel === "slack") {
        await api.putChannel("slack", {
          bot_token: slackToken,
          channel_id: slackChannel,
          allowed_users: slackUsers
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        });
      }
      await refreshChannels();
    });
  };

  const removeChannel = async (channel: "telegram" | "discord" | "slack") => {
    await withBusy(async () => {
      await api.deleteChannel(channel);
      await refreshChannels();
    });
  };

  const addMcp = async () => {
    await withBusy(async () => {
      await api.addMcpServer({
        name: mcpName,
        transport: mcpTransport,
        enabled: true,
        headers: mcpBearer ? { Authorization: `Bearer ${mcpBearer}` } : {},
      });
      await refreshMcp();
    });
  };

  const mcpAction = async (
    name: string,
    action: "connect" | "disconnect" | "refresh" | "disable"
  ) => {
    await withBusy(async () => {
      if (action === "connect") await api.connectMcpServer(name);
      if (action === "disconnect") await api.disconnectMcpServer(name);
      if (action === "refresh") await api.refreshMcpServer(name);
      if (action === "disable") await api.patchMcpServer(name, false);
      await refreshMcp();
    });
  };

  const previewArtifact = async () => {
    await withBusy(async () => {
      const preview = await api.previewArtifact(selectedArtifactUri);
      setArtifactPreview(preview as unknown as JsonObject);
    });
  };

  const readMissionId = (mission: JsonObject): string => str(mission.mission_id);
  const readDefinitionId = (row: JsonObject): string =>
    str(row.automation_id) || str(row.routine_id) || str(row.id);

  return (
    <div className="flex flex-col h-full bg-gray-950 text-white p-3 sm:p-4 lg:p-6 gap-4 overflow-auto">
      <div>
        <h2 className="text-2xl font-bold">Ops Workspace</h2>
        <p className="text-sm text-gray-400">
          Unified control center for mission orchestration, automations, MCP, channels, and swarm
          operations.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(tabLabel) as OpsTab[]).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-1.5 rounded-md text-sm border ${
              tab === key
                ? "bg-emerald-700 border-emerald-500"
                : "bg-gray-900 border-gray-700 hover:bg-gray-800"
            }`}
          >
            {tabLabel[key]}
          </button>
        ))}
      </div>

      {error && (
        <div className="border border-red-800 bg-red-950/50 text-red-200 rounded-md px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <div className="text-xs text-gray-500">{busy ? "Processing request..." : "Idle"}</div>

      {tab === "overview" && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="font-semibold mb-2">Engine Health</div>
            <pre className="text-xs text-gray-300 overflow-auto max-h-60">
              {pretty(health || {})}
            </pre>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="font-semibold mb-2">System Capabilities</div>
            <pre className="text-xs text-gray-300 overflow-auto max-h-60">
              {pretty(capabilities || {})}
            </pre>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="font-semibold mb-2">Engine Service Status</div>
            <pre className="text-xs text-gray-300 overflow-auto max-h-60">
              {pretty(engineStatus || {})}
            </pre>
            <div className="flex gap-2 mt-3">
              <button
                className="px-3 py-1 rounded bg-green-700"
                onClick={() => void controlEngine("start")}
              >
                Start
              </button>
              <button
                className="px-3 py-1 rounded bg-yellow-700"
                onClick={() => void controlEngine("restart")}
              >
                Restart
              </button>
              <button
                className="px-3 py-1 rounded bg-red-700"
                onClick={() => void controlEngine("stop")}
              >
                Stop
              </button>
              <button
                className="px-3 py-1 rounded bg-gray-700"
                onClick={() => void withBusy(refreshOverview)}
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "events" && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col gap-3">
          <div className="flex gap-2 items-center">
            <span
              className={`text-xs px-2 py-1 rounded ${eventsConnected ? "bg-emerald-900 text-emerald-300" : "bg-red-900 text-red-300"}`}
            >
              {eventsConnected ? "SSE connected" : "SSE disconnected"}
            </span>
            <input
              className="bg-gray-950 border border-gray-700 rounded px-2 py-1 text-sm"
              placeholder="Filter by event type"
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
            />
            <button className="px-3 py-1 rounded bg-gray-700" onClick={clearEvents}>
              Clear
            </button>
          </div>
          <div className="text-xs text-gray-400">Events: {filteredEvents.length}</div>
          <div className="max-h-[520px] overflow-auto space-y-2">
            {filteredEvents
              .slice()
              .reverse()
              .map((evt) => (
                <div key={evt.id} className="border border-gray-800 rounded p-2 bg-gray-950">
                  <div className="text-xs text-emerald-400">{evt.type}</div>
                  <pre className="text-xs text-gray-300 overflow-auto">{pretty(evt.payload)}</pre>
                </div>
              ))}
          </div>
        </div>
      )}

      {tab === "missions" && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2">
            <div className="font-semibold">Create Mission</div>
            <input
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1"
              value={missionTitle}
              onChange={(e) => setMissionTitle(e.target.value)}
            />
            <textarea
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1"
              rows={3}
              value={missionGoal}
              onChange={(e) => setMissionGoal(e.target.value)}
            />
            <input
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1"
              value={missionWorkItem}
              onChange={(e) => setMissionWorkItem(e.target.value)}
            />
            <button className="px-3 py-1 rounded bg-blue-700" onClick={() => void createMission()}>
              Create
            </button>

            <div className="pt-3 border-t border-gray-800 font-semibold">Apply Mission Event</div>
            <input
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1"
              placeholder="Mission ID"
              value={selectedMissionId}
              onChange={(e) => setSelectedMissionId(e.target.value)}
            />
            <textarea
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1"
              rows={7}
              value={missionEventJson}
              onChange={(e) => setMissionEventJson(e.target.value)}
            />
            <button
              className="px-3 py-1 rounded bg-purple-700"
              onClick={() => void applyMissionEvent()}
            >
              Apply Event
            </button>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="flex justify-between items-center mb-2">
              <div className="font-semibold">Missions ({missions.length})</div>
              <button
                className="px-3 py-1 rounded bg-gray-700"
                onClick={() => void withBusy(refreshMissions)}
              >
                Refresh
              </button>
            </div>
            <div className="max-h-[520px] overflow-auto space-y-2">
              {missions.map((mission) => {
                const missionId = readMissionId(mission);
                return (
                  <button
                    type="button"
                    key={missionId || Math.random().toString()}
                    onClick={() => setSelectedMissionId(missionId)}
                    className="w-full text-left border border-gray-800 rounded p-2 bg-gray-950 hover:bg-gray-900"
                  >
                    <div className="text-sm font-medium text-emerald-300">
                      {missionId || "(missing mission_id)"}
                    </div>
                    <div className="text-xs text-gray-400">
                      status={str(mission.status, "unknown")}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === "definitions" && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2">
            <div className="font-semibold">Automation / Routine Builder</div>
            <div className="flex gap-2 items-center">
              <span className="text-sm text-gray-400">API mode</span>
              <button
                className={`px-2 py-1 rounded text-xs ${apiFamily === "automations" ? "bg-emerald-700" : "bg-gray-700"}`}
                onClick={() => setApiMode("automations")}
              >
                automations
              </button>
              <button
                className={`px-2 py-1 rounded text-xs ${apiFamily === "routines" ? "bg-emerald-700" : "bg-gray-700"}`}
                onClick={() => setApiMode("routines")}
              >
                routines
              </button>
            </div>
            <input
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1"
              value={definitionId}
              onChange={(e) => setDefinitionId(e.target.value)}
              placeholder="definition id"
            />
            <input
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1"
              value={definitionName}
              onChange={(e) => setDefinitionName(e.target.value)}
              placeholder="name"
            />
            <textarea
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1"
              rows={3}
              value={definitionObjective}
              onChange={(e) => setDefinitionObjective(e.target.value)}
              placeholder="objective"
            />
            <input
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1"
              value={definitionCriteria}
              onChange={(e) => setDefinitionCriteria(e.target.value)}
              placeholder="success criteria separated by ;"
            />
            <div className="flex gap-2">
              <button
                className="px-3 py-1 rounded bg-blue-700"
                onClick={() => void createDefinition()}
              >
                Create
              </button>
              <button
                className="px-3 py-1 rounded bg-indigo-700"
                onClick={() => void runWorkshop()}
              >
                Mission Workshop
              </button>
            </div>
            <textarea
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs"
              rows={3}
              value={workshopInput}
              onChange={(e) => setWorkshopInput(e.target.value)}
            />
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center">
              <div className="font-semibold">Definitions ({definitions.length})</div>
              <button
                className="px-3 py-1 rounded bg-gray-700"
                onClick={() => void withBusy(refreshDefinitions)}
              >
                Refresh
              </button>
            </div>
            <div className="max-h-52 overflow-auto space-y-2">
              {definitions.map((row) => {
                const id = readDefinitionId(row);
                return (
                  <div
                    key={id || Math.random().toString()}
                    className="border border-gray-800 rounded p-2 bg-gray-950"
                  >
                    <div className="text-sm text-emerald-300">{id || "(missing id)"}</div>
                    <div className="text-xs text-gray-400">{str(row.name, "unnamed")}</div>
                    <button
                      className="mt-2 text-xs px-2 py-1 rounded bg-emerald-700"
                      onClick={() => void runNow(id)}
                    >
                      run_now
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="font-semibold">Runs ({runs.length})</div>
            <div className="max-h-52 overflow-auto space-y-2">
              {runs.map((runRow) => {
                const id = runIdFromRecord(runRow);
                const raw = runRow as unknown as JsonObject;
                const status = str(raw.status) || str((raw.run as JsonObject | undefined)?.status);
                return (
                  <div
                    key={id || Math.random().toString()}
                    className="border border-gray-800 rounded p-2 bg-gray-950 space-y-1"
                  >
                    <div className="text-xs text-emerald-300">{id || "(missing run id)"}</div>
                    <div className="text-xs text-gray-400">status={status || "unknown"}</div>
                    <div className="flex gap-1 flex-wrap">
                      <button
                        className="px-2 py-0.5 rounded bg-gray-700 text-xs"
                        onClick={() => void loadRunDetails(id)}
                      >
                        inspect
                      </button>
                      <button
                        className="px-2 py-0.5 rounded bg-green-700 text-xs"
                        onClick={() => void runAction("approve", id)}
                      >
                        approve
                      </button>
                      <button
                        className="px-2 py-0.5 rounded bg-red-700 text-xs"
                        onClick={() => void runAction("deny", id)}
                      >
                        deny
                      </button>
                      <button
                        className="px-2 py-0.5 rounded bg-yellow-700 text-xs"
                        onClick={() => void runAction("pause", id)}
                      >
                        pause
                      </button>
                      <button
                        className="px-2 py-0.5 rounded bg-blue-700 text-xs"
                        onClick={() => void runAction("resume", id)}
                      >
                        resume
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {selectedRunRecord && (
              <pre className="text-xs bg-gray-950 border border-gray-800 rounded p-2 overflow-auto max-h-44">
                {pretty(selectedRunRecord)}
              </pre>
            )}
          </div>
        </div>
      )}

      {tab === "agentTeam" && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2">
            <div className="font-semibold">Spawn Agent Instance</div>
            <input
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1"
              placeholder="missionID (optional)"
              value={spawnMissionId}
              onChange={(e) => setSpawnMissionId(e.target.value)}
            />
            <input
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1"
              placeholder="role"
              value={spawnRole}
              onChange={(e) => setSpawnRole(e.target.value)}
            />
            <input
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1"
              placeholder="templateID (optional)"
              value={spawnTemplateId}
              onChange={(e) => setSpawnTemplateId(e.target.value)}
            />
            <textarea
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1"
              rows={3}
              value={spawnJustification}
              onChange={(e) => setSpawnJustification(e.target.value)}
            />
            <button className="px-3 py-1 rounded bg-purple-700" onClick={() => void spawnAgent()}>
              Spawn
            </button>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2">
            <div className="flex justify-between items-center">
              <div className="font-semibold">Approvals / Templates / Instances</div>
              <button
                className="px-3 py-1 rounded bg-gray-700"
                onClick={() => void withBusy(refreshAgentTeam)}
              >
                Refresh
              </button>
            </div>
            <div className="text-xs text-gray-400">
              templates={agentTemplates.length} instances={agentInstances.length} missions=
              {agentMissionRollups.length}
            </div>
            <div className="max-h-72 overflow-auto space-y-2">
              {agentApprovals.map((approval) => {
                const approvalId = str(approval.approval_id) || str(approval.approvalID);
                return (
                  <div
                    key={approvalId || Math.random().toString()}
                    className="border border-gray-800 rounded p-2 bg-gray-950"
                  >
                    <div className="text-xs text-emerald-300">
                      approval={approvalId || "(missing)"}
                    </div>
                    <div className="flex gap-2 mt-1">
                      <button
                        className="px-2 py-0.5 rounded bg-green-700 text-xs"
                        onClick={() => void approveSpawn(approvalId, false)}
                      >
                        approve
                      </button>
                      <button
                        className="px-2 py-0.5 rounded bg-red-700 text-xs"
                        onClick={() => void approveSpawn(approvalId, true)}
                      >
                        deny
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === "mcp" && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2">
            <div className="font-semibold">MCP Server</div>
            <input
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1"
              placeholder="name"
              value={mcpName}
              onChange={(e) => setMcpName(e.target.value)}
            />
            <input
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1"
              placeholder="transport"
              value={mcpTransport}
              onChange={(e) => setMcpTransport(e.target.value)}
            />
            <input
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1"
              placeholder="Authorization bearer (optional)"
              value={mcpBearer}
              onChange={(e) => setMcpBearer(e.target.value)}
            />
            <button className="px-3 py-1 rounded bg-blue-700" onClick={() => void addMcp()}>
              Add Server
            </button>
            <div className="text-xs text-gray-400">Global tool IDs: {toolIds.length}</div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2">
            <div className="flex justify-between items-center">
              <div className="font-semibold">MCP Registry</div>
              <button
                className="px-3 py-1 rounded bg-gray-700"
                onClick={() => void withBusy(refreshMcp)}
              >
                Refresh
              </button>
            </div>
            <pre className="text-xs bg-gray-950 border border-gray-800 rounded p-2 overflow-auto max-h-48">
              {pretty(mcpServers)}
            </pre>
            <div className="flex gap-2 flex-wrap">
              <button
                className="px-2 py-1 rounded bg-emerald-700 text-xs"
                onClick={() => void mcpAction(mcpName, "connect")}
              >
                connect
              </button>
              <button
                className="px-2 py-1 rounded bg-yellow-700 text-xs"
                onClick={() => void mcpAction(mcpName, "refresh")}
              >
                refresh
              </button>
              <button
                className="px-2 py-1 rounded bg-red-700 text-xs"
                onClick={() => void mcpAction(mcpName, "disconnect")}
              >
                disconnect
              </button>
              <button
                className="px-2 py-1 rounded bg-gray-700 text-xs"
                onClick={() => void mcpAction(mcpName, "disable")}
              >
                disable
              </button>
            </div>
            <div className="text-xs text-gray-400">MCP tools: {mcpTools.length}</div>
          </div>
        </div>
      )}

      {tab === "channels" && (
        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2">
            <div className="font-semibold">Telegram</div>
            <input
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1"
              type="password"
              placeholder="bot token"
              value={telegramToken}
              onChange={(e) => setTelegramToken(e.target.value)}
            />
            <input
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1"
              placeholder="allowed users comma separated"
              value={telegramUsers}
              onChange={(e) => setTelegramUsers(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                className="px-3 py-1 rounded bg-blue-700"
                onClick={() => void saveChannel("telegram")}
              >
                save
              </button>
              <button
                className="px-3 py-1 rounded bg-red-700"
                onClick={() => void removeChannel("telegram")}
              >
                remove
              </button>
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2">
            <div className="font-semibold">Discord</div>
            <input
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1"
              type="password"
              placeholder="bot token"
              value={discordToken}
              onChange={(e) => setDiscordToken(e.target.value)}
            />
            <input
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1"
              placeholder="guild id"
              value={discordGuild}
              onChange={(e) => setDiscordGuild(e.target.value)}
            />
            <input
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1"
              placeholder="allowed users"
              value={discordUsers}
              onChange={(e) => setDiscordUsers(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                className="px-3 py-1 rounded bg-blue-700"
                onClick={() => void saveChannel("discord")}
              >
                save
              </button>
              <button
                className="px-3 py-1 rounded bg-red-700"
                onClick={() => void removeChannel("discord")}
              >
                remove
              </button>
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2">
            <div className="font-semibold">Slack</div>
            <input
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1"
              type="password"
              placeholder="bot token"
              value={slackToken}
              onChange={(e) => setSlackToken(e.target.value)}
            />
            <input
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1"
              placeholder="channel id"
              value={slackChannel}
              onChange={(e) => setSlackChannel(e.target.value)}
            />
            <input
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1"
              placeholder="allowed users"
              value={slackUsers}
              onChange={(e) => setSlackUsers(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                className="px-3 py-1 rounded bg-blue-700"
                onClick={() => void saveChannel("slack")}
              >
                save
              </button>
              <button
                className="px-3 py-1 rounded bg-red-700"
                onClick={() => void removeChannel("slack")}
              >
                remove
              </button>
            </div>
          </div>
          <div className="md:col-span-3 bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="flex justify-between items-center mb-2">
              <div className="font-semibold">Channels Config + Status</div>
              <button
                className="px-3 py-1 rounded bg-gray-700"
                onClick={() => void withBusy(refreshChannels)}
              >
                Refresh
              </button>
            </div>
            <div className="grid md:grid-cols-2 gap-2">
              <pre className="text-xs bg-gray-950 border border-gray-800 rounded p-2 overflow-auto max-h-64">
                {pretty(channelsConfig || {})}
              </pre>
              <pre className="text-xs bg-gray-950 border border-gray-800 rounded p-2 overflow-auto max-h-64">
                {pretty(channelsStatus || {})}
              </pre>
            </div>
          </div>
        </div>
      )}

      {tab === "artifacts" && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2">
            <div className="font-semibold">Run Artifacts Browser</div>
            <div className="flex gap-2 items-center">
              <span className="text-xs text-gray-400">api mode</span>
              <button
                className={`px-2 py-1 text-xs rounded ${apiFamily === "automations" ? "bg-emerald-700" : "bg-gray-700"}`}
                onClick={() => setApiMode("automations")}
              >
                automations
              </button>
              <button
                className={`px-2 py-1 text-xs rounded ${apiFamily === "routines" ? "bg-emerald-700" : "bg-gray-700"}`}
                onClick={() => setApiMode("routines")}
              >
                routines
              </button>
            </div>
            <input
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1"
              placeholder="run id"
              value={selectedRunId}
              onChange={(e) => setSelectedRunId(e.target.value)}
            />
            <button
              className="px-3 py-1 rounded bg-blue-700"
              onClick={() => void withBusy(refreshArtifacts)}
            >
              Load Artifacts
            </button>
            <div className="max-h-80 overflow-auto space-y-2">
              {artifacts.map((artifact) => (
                <button
                  key={artifact.artifact_id || artifact.uri}
                  type="button"
                  onClick={() => setSelectedArtifactUri(artifact.uri)}
                  className="w-full text-left border border-gray-800 rounded p-2 bg-gray-950 hover:bg-gray-900"
                >
                  <div className="text-xs text-emerald-300">{artifact.uri}</div>
                  <div className="text-xs text-gray-400">kind={artifact.kind}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2">
            <div className="font-semibold">Artifact Preview</div>
            <input
              className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1"
              placeholder="artifact uri"
              value={selectedArtifactUri}
              onChange={(e) => setSelectedArtifactUri(e.target.value)}
            />
            <button
              className="px-3 py-1 rounded bg-indigo-700"
              onClick={() => void previewArtifact()}
            >
              Preview
            </button>
            <pre className="text-xs bg-gray-950 border border-gray-800 rounded p-2 overflow-auto max-h-[520px]">
              {pretty(artifactPreview || {})}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
