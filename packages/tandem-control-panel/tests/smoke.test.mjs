import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import test from "node:test";

function getFreePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const address = s.address();
      s.close(() => resolve(address.port));
    });
    s.on("error", reject);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReady(url, timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/system/health`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function startFakeEngine() {
  const port = await getFreePort();
  const token = "smoke-token";
  const requests = [];

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
    const auth = req.headers.authorization || "";
    const xToken = req.headers["x-tandem-token"] || "";
    requests.push({ path: url.pathname, auth, xToken });

    if (url.pathname === "/global/health") {
      if (auth === `Bearer ${token}` || xToken === token) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ready: true, healthy: true, version: "test-engine", apiTokenRequired: true }));
        return;
      }
      // /global/health is intentionally open in real engine auth-gate.
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ready: true, healthy: true, version: "test-engine", apiTokenRequired: true }));
      return;
    }

    if (url.pathname === "/config/providers") {
      if (auth !== `Bearer ${token}` && xToken !== token) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ default: "openai", providers: {} }));
      return;
    }

    if (url.pathname.startsWith("/resource/")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          value: {
            version: 1,
            updatedAtMs: Date.now(),
            tasks: {
              "task-1": {
                taskId: "task-1",
                ownerRole: "worker",
                status: "running",
                statusReason: "processing",
                lastUpdateMs: Date.now(),
              },
            },
          },
        })
      );
      return;
    }

    if (url.pathname === "/global/event") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.write(`data: ${JSON.stringify({ type: "test.event", runID: "run-1" })}\n\n`);
      setTimeout(() => res.end(), 50);
      return;
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, path: url.pathname }));
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  return {
    server,
    port,
    token,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

function extractCookie(res) {
  const direct = res.headers.get("set-cookie");
  if (direct) return direct.split(";")[0];
  if (typeof res.headers.getSetCookie === "function") {
    const cookies = res.headers.getSetCookie();
    if (cookies[0]) return cookies[0].split(";")[0];
  }
  return "";
}

async function request(baseUrl, path, { method = "GET", body, cookie } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test("control panel auth/proxy/swarm smoke", async (t) => {
  const fake = await startFakeEngine();
  t.after(async () => {
    await fake.close();
  });

  const panelPort = await getFreePort();
  const baseUrl = `http://127.0.0.1:${panelPort}`;

  const panel = spawn(process.execPath, ["bin/setup.js"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      TANDEM_CONTROL_PANEL_PORT: String(panelPort),
      TANDEM_ENGINE_URL: `http://127.0.0.1:${fake.port}`,
      TANDEM_CONTROL_PANEL_AUTO_START_ENGINE: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let panelOutput = "";
  panel.stdout.on("data", (chunk) => {
    panelOutput += chunk.toString();
  });
  panel.stderr.on("data", (chunk) => {
    panelOutput += chunk.toString();
  });

  t.after(() => {
    if (!panel.killed) panel.kill("SIGTERM");
  });

  await waitForReady(baseUrl);

  const unauthProxy = await request(baseUrl, "/api/engine/global/health");
  assert.equal(unauthProxy.status, 401);

  const badLogin = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    body: { token: "wrong-token" },
  });
  assert.equal(badLogin.status, 401);

  const login = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    body: { token: fake.token },
  });
  assert.equal(login.status, 200, panelOutput);
  const cookie = extractCookie(login);
  assert.ok(cookie.includes("tcp_sid="), "missing session cookie");

  const me = await request(baseUrl, "/api/auth/me", { cookie });
  assert.equal(me.status, 200);

  const proxy = await request(baseUrl, "/api/engine/global/health", { cookie });
  assert.equal(proxy.status, 200);
  const proxyJson = await proxy.json();
  assert.equal(proxyJson.version, "test-engine");

  const swarmStatus = await request(baseUrl, "/api/swarm/status", { cookie });
  assert.equal(swarmStatus.status, 200);
  const swarmStatusJson = await swarmStatus.json();
  assert.equal(typeof swarmStatusJson.status, "string");

  const swarmSnapshot = await request(baseUrl, "/api/swarm/snapshot", { cookie });
  assert.equal(swarmSnapshot.status, 200);
  const snapshotJson = await swarmSnapshot.json();
  assert.ok(snapshotJson.registry?.value?.tasks, "missing registry tasks");

  const proxiedAuthSeen = fake.requests.some((r) => r.path === "/global/health" && r.auth === `Bearer ${fake.token}`);
  assert.ok(proxiedAuthSeen, "proxy did not forward token auth header");
});
