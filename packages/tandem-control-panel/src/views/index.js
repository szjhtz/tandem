import { renderDashboard } from "./dashboard.js";
import { renderChat } from "./chat.js";
import { renderAgents } from "./agents.js";
import { renderChannels } from "./channels.js";
import { renderMcp } from "./mcp.js";
import { renderSwarm } from "./swarm.js";
import { renderMemory } from "./memory.js";
import { renderTeams } from "./teams.js";
import { renderFeed } from "./feed.js";
import { renderSettings } from "./settings.js";

export const VIEW_RENDERERS = {
  dashboard: renderDashboard,
  chat: renderChat,
  agents: renderAgents,
  channels: renderChannels,
  mcp: renderMcp,
  swarm: renderSwarm,
  memory: renderMemory,
  teams: renderTeams,
  feed: renderFeed,
  settings: renderSettings,
};
