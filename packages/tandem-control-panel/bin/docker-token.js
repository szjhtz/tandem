#!/usr/bin/env node

import { existsSync, readFileSync } from "fs";
import { execFileSync } from "child_process";
import { resolve } from "path";

const tokenPath = resolve(process.cwd(), "secrets", "tandem_api_token");

if (!existsSync(tokenPath)) {
  console.error(`[tandem-control-panel] Token file not found: ${tokenPath}`);
  console.error("[tandem-control-panel] Start Docker once with: npm run docker:up");
  process.exit(1);
}

let token = "";
try {
  token = readFileSync(tokenPath, "utf8").trim();
} catch {
  token = "";
}

if (!token) {
  try {
    const output = execFileSync(
      "docker",
      [
        "compose",
        "exec",
        "-T",
        "tandem-engine",
        "sh",
        "-lc",
        "cat /run/secrets/tandem_api_token",
      ],
      { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] }
    )
      .toString("utf8")
      .trim();
    if (!output) throw new Error("empty token output");
    process.stdout.write(`${output}\n`);
    process.exit(0);
  } catch (error) {
    console.error(`[tandem-control-panel] Token file is empty: ${tokenPath}`);
    console.error("[tandem-control-panel] Restart the engine container to regenerate it.");
    console.error(
      `[tandem-control-panel] Also tried reading from the running container: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exit(1);
  }
}

process.stdout.write(`${token}\n`);
