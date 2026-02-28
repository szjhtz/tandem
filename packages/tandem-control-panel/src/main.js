import { TandemClient } from "@frumu/tandem-client";
import "./styles.css";
import { api } from "./app/api.js";
import { byId, escapeHtml } from "./app/dom.js";
import { routeFromHash, ensureRoute, setHashRoute } from "./app/router.js";
import { createToasts } from "./app/toasts.js";
import { createState, ROUTES, providerHints } from "./app/store.js";
import { VIEW_RENDERERS } from "./views/index.js";

const app = document.getElementById("app");
const state = createState();
const { toast, renderToasts } = createToasts(state);

const ctx = {
  app,
  state,
  api,
  byId,
  escapeHtml,
  ROUTES,
  providerHints,
  toast,
  addCleanup,
  clearCleanup,
  setRoute,
  renderShell,
  refreshProviderStatus,
};

function addCleanup(fn) {
  state.cleanup.push(fn);
}

function clearCleanup() {
  for (const fn of state.cleanup) {
    try {
      fn();
    } catch {
      // ignore cleanup failure
    }
  }
  state.cleanup = [];
}

async function checkAuth() {
  try {
    const me = await api("/api/auth/me", { method: "GET" });
    state.authed = true;
    state.me = me;
    state.client = new TandemClient({ baseUrl: "/api/engine", token: "session" });
    await refreshProviderStatus();
  } catch {
    state.authed = false;
    state.me = null;
    state.client = null;
    state.needsProviderOnboarding = false;
    state.providerReady = false;
    state.providerDefault = "";
    state.providerConnected = [];
    state.providerError = "";
  }
}

async function refreshProviderStatus() {
  if (!state.client) {
    state.needsProviderOnboarding = false;
    state.providerReady = false;
    state.providerDefault = "";
    state.providerConnected = [];
    state.providerError = "";
    return;
  }
  try {
    const [config, catalog] = await Promise.all([state.client.providers.config(), state.client.providers.catalog()]);
    const defaultProvider = String(config?.default || "").trim();
    const connected = new Set(catalog?.connected || []);
    const ready = !!defaultProvider && (defaultProvider === "ollama" || connected.has(defaultProvider));
    state.providerDefault = defaultProvider;
    state.providerConnected = [...connected];
    state.providerReady = ready;
    state.providerError = "";
    state.needsProviderOnboarding = !ready;
  } catch (e) {
    state.providerReady = false;
    state.providerDefault = "";
    state.providerConnected = [];
    state.providerError = e instanceof Error ? e.message : String(e);
    state.needsProviderOnboarding = true;
  }
}

function setRoute(route) {
  state.route = ensureRoute(route, ROUTES);
  setHashRoute(state.route);
  renderShell();
}

function renderLogin() {
  app.innerHTML = `
    <div class="login-bg"></div>
    <main class="login-wrap">
      <section class="panel">
        <div class="login-hero" aria-hidden="true">
          <svg viewBox="0 0 520 160" class="hero-svg">
            <defs>
              <linearGradient id="hero-grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stop-color="#22d3ee"></stop>
                <stop offset="100%" stop-color="#34d399"></stop>
              </linearGradient>
            </defs>
            <g class="bot bot-left">
              <rect x="70" y="40" width="90" height="72" rx="16" class="bot-body"></rect>
              <circle cx="102" cy="76" r="6" class="bot-eye"></circle>
              <circle cx="128" cy="76" r="6" class="bot-eye"></circle>
              <line x1="88" y1="96" x2="142" y2="96" class="bot-mouth"></line>
              <path d="M160 82 C188 86, 208 94, 222 96" class="bot-arm"></path>
            </g>
            <g class="bot bot-right">
              <rect x="360" y="40" width="90" height="72" rx="16" class="bot-body"></rect>
              <circle cx="392" cy="76" r="6" class="bot-eye"></circle>
              <circle cx="418" cy="76" r="6" class="bot-eye"></circle>
              <line x1="378" y1="96" x2="432" y2="96" class="bot-mouth"></line>
              <path d="M360 82 C332 86, 312 94, 298 96" class="bot-arm"></path>
            </g>
            <g class="handshake">
              <rect x="223" y="88" width="75" height="18" rx="9" class="shake"></rect>
            </g>
          </svg>
        </div>
        <h1>Tandem Control Panel</h1>
        <p>Use your engine API token to unlock the full web control center.</p>
        <form id="login-form" class="form-stack">
          <label>Engine Token</label>
          <input id="token" type="password" placeholder="tk_..." autocomplete="off" />
          <button id="login-btn" type="submit" class="primary">Sign In</button>
          <button id="check-engine-btn" type="button" class="ghost">Check Engine Connectivity</button>
          <div id="login-err" class="error"></div>
        </form>
      </section>
    </main>
  `;

  byId("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = byId("token").value.trim();
    const errEl = byId("login-err");
    errEl.textContent = "";
    errEl.classList.remove("ok");

    if (!token) {
      errEl.textContent = "Token is required.";
      toast("warn", "Engine token is required.");
      return;
    }

    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      await checkAuth();
      toast("ok", "Signed in.");
      setRoute("dashboard");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errEl.textContent = message;
      errEl.classList.remove("ok");
      toast("err", message);
    }
  });

  byId("check-engine-btn").addEventListener("click", async () => {
    const errEl = byId("login-err");
    errEl.textContent = "";
    try {
      const health = await api("/api/system/health");
      const stateText = health.engine?.ready || health.engine?.healthy ? "healthy" : "unhealthy";
      errEl.textContent = `Engine check: ${stateText} at ${health.engineUrl}`;
      errEl.classList.add("ok");
      toast(health.engine?.ready || health.engine?.healthy ? "ok" : "warn", `Engine ${stateText}: ${health.engineUrl}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errEl.textContent = message;
      errEl.classList.remove("ok");
      toast("err", message);
    }
  });
}

async function renderRoute() {
  const view = byId("view");
  if (!view) return;
  view.innerHTML = '<div class="loading">Loading...</div>';

  const providerRequiredRoutes = new Set(["chat", "agents", "swarm", "teams"]);
  if (providerRequiredRoutes.has(state.route) && !state.providerReady) {
    view.innerHTML = `
      <div class="card">
        <h3>Provider Setup Required</h3>
        <p class="muted">This page requires a connected default provider/model before runs can execute.</p>
        <div class="mt-sm row-wrap">
          <div class="status-dot warn">default: ${escapeHtml(state.providerDefault || "none")}</div>
          <div class="status-dot warn">connected: ${escapeHtml(String(state.providerConnected.length))}</div>
        </div>
        <div class="row-end mt-sm">
          <button id="goto-settings" class="primary">Open Provider Setup</button>
        </div>
      </div>
    `;
    const btn = byId("goto-settings");
    if (btn) btn.addEventListener("click", () => setRoute("settings"));
    return;
  }

  const renderer = VIEW_RENDERERS[state.route] || VIEW_RENDERERS.dashboard;
  await renderer(ctx);
}

function renderShell() {
  if (!state.authed) {
    renderLogin();
    return;
  }

  clearCleanup();

  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-icon"><i data-feather="cpu"></i></div>
          <div>
            <div class="brand-title">Tandem</div>
            <div class="brand-sub">Control Center</div>
          </div>
        </div>
        <nav id="nav" class="nav"></nav>
        <div class="side-footer">
          <button id="logout-btn" class="ghost-btn"><i data-feather="log-out"></i> Logout</button>
        </div>
      </aside>
      <main class="content">
        <header class="topbar">
          <div>
            <h2>${escapeHtml((ROUTES.find((r) => r[0] === state.route) || ["", "Dashboard"])[1])}</h2>
            <p>${escapeHtml(state.me?.engineUrl || "")}</p>
          </div>
          <div class="status-pill ${state.me?.localEngine ? "ok" : "warn"}">${state.me?.localEngine ? "Local Engine" : "Remote Engine"}</div>
        </header>
        <section id="view" class="view"></section>
      </main>
    </div>
  `;

  const nav = byId("nav");
  nav.innerHTML = ROUTES.map(([id, label, icon]) => `
      <button data-route="${id}" class="nav-item ${id === state.route ? "active" : ""}">
        <i data-feather="${icon}"></i><span>${label}</span>
      </button>
    `).join("");

  nav.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => setRoute(btn.dataset.route));
  });

  byId("logout-btn").addEventListener("click", async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    state.authed = false;
    state.me = null;
    state.client = null;
    renderLogin();
  });

  if (window.feather) window.feather.replace();
  renderToasts();
  void renderRoute();
}

async function renderDashboardIfAuthLost() {
  try {
    await api("/api/auth/me");
  } catch {
    state.authed = false;
    renderLogin();
  }
}

window.addEventListener("hashchange", () => {
  state.route = ensureRoute(routeFromHash(), ROUTES);
  renderShell();
});

async function boot() {
  state.route = ensureRoute(routeFromHash(), ROUTES);
  await checkAuth();
  if (!state.authed) return renderLogin();

  renderShell();
  if (state.needsProviderOnboarding && state.route === "dashboard") {
    toast("info", "Complete provider setup to start using chat/agents.");
    setRoute("settings");
  }

  const authPoll = setInterval(renderDashboardIfAuthLost, 30000);
  addCleanup(() => clearInterval(authPoll));
}

boot();
