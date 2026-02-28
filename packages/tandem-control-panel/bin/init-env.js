#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve, join } from "path";
import { randomBytes } from "crypto";

function parseEnv(content) {
  const out = {};
  for (const rawLine of String(content || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function serializeEnv(entries) {
  return `${entries.map(([k, v]) => `${k}=${v}`).join("\n")}\n`;
}

function ensureEnv({ cwd = process.cwd(), overwrite = false } = {}) {
  const envPath = resolve(cwd, ".env");
  const existed = existsSync(envPath);
  const examplePath = resolve(cwd, ".env.example");
  const localExamplePath = resolve(join(process.cwd(), "packages", "tandem-control-panel", ".env.example"));

  const sourcePath = existsSync(examplePath) ? examplePath : localExamplePath;
  const defaults = existsSync(sourcePath)
    ? parseEnv(readFileSync(sourcePath, "utf8"))
    : {
        TANDEM_CONTROL_PANEL_PORT: "39732",
        TANDEM_ENGINE_URL: "http://127.0.0.1:39731",
        TANDEM_CONTROL_PANEL_AUTO_START_ENGINE: "1",
      };

  const current = existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : {};
  const merged = { ...defaults, ...current };

  if (overwrite || !merged.TANDEM_CONTROL_PANEL_ENGINE_TOKEN || merged.TANDEM_CONTROL_PANEL_ENGINE_TOKEN === "tk_change_me") {
    merged.TANDEM_CONTROL_PANEL_ENGINE_TOKEN = `tk_${randomBytes(16).toString("hex")}`;
  }

  const preferredOrder = [
    "TANDEM_CONTROL_PANEL_PORT",
    "TANDEM_ENGINE_URL",
    "TANDEM_ENGINE_HOST",
    "TANDEM_ENGINE_PORT",
    "TANDEM_CONTROL_PANEL_AUTO_START_ENGINE",
    "TANDEM_CONTROL_PANEL_ENGINE_TOKEN",
    "TANDEM_CONTROL_PANEL_SESSION_TTL_MINUTES",
  ];

  const ordered = [];
  for (const key of preferredOrder) {
    if (merged[key] !== undefined) ordered.push([key, merged[key]]);
  }
  for (const [key, value] of Object.entries(merged)) {
    if (!preferredOrder.includes(key)) ordered.push([key, value]);
  }

  writeFileSync(envPath, serializeEnv(ordered), "utf8");

  return {
    envPath,
    token: merged.TANDEM_CONTROL_PANEL_ENGINE_TOKEN,
    created: !existed,
    engineUrl: merged.TANDEM_ENGINE_URL || `http://${merged.TANDEM_ENGINE_HOST || "127.0.0.1"}:${merged.TANDEM_ENGINE_PORT || "39731"}`,
    panelPort: merged.TANDEM_CONTROL_PANEL_PORT || "39732",
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const overwrite = process.argv.includes("--reset-token") || process.argv.includes("--overwrite");
  const result = ensureEnv({ overwrite });
  console.log("[Tandem Control Panel] Environment initialized.");
  console.log(`[Tandem Control Panel] .env:      ${result.envPath}`);
  console.log(`[Tandem Control Panel] Engine URL: ${result.engineUrl}`);
  console.log(`[Tandem Control Panel] Panel URL:  http://localhost:${result.panelPort}`);
  console.log(`[Tandem Control Panel] Token:      ${result.token}`);
}

export { ensureEnv };
