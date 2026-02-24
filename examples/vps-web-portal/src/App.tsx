import React, { useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Link,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import { Login } from "./pages/Login";
import { ProviderSetup } from "./pages/ProviderSetup";
import { ResearchDashboard } from "./pages/ResearchDashboard";
import { SwarmDashboard } from "./pages/SwarmDashboard";
import { TextAdventure } from "./pages/TextAdventure";
import { SecondBrainDashboard } from "./pages/SecondBrainDashboard";
import { ConnectorsDashboard } from "./pages/ConnectorsDashboard";
import { OpsWorkspace } from "./pages/OpsWorkspace";
import { RepoAgentDashboard } from "./pages/RepoAgentDashboard";
import { IncidentTriageDashboard } from "./pages/IncidentTriageDashboard";
import { DataExtractionDashboard } from "./pages/DataExtractionDashboard";
import { TicketTriageDashboard } from "./pages/TicketTriageDashboard";
import { ScheduledWatchDashboard } from "./pages/ScheduledWatchDashboard";
import { ContentCreatorDashboard } from "./pages/ContentCreatorDashboard";
import { HtmlExtractorDashboard } from "./pages/HtmlExtractorDashboard";
import {
  LayoutDashboard,
  Users,
  MessageSquareQuote,
  BrainCircuit,
  LogOut,
  Cable,
  ShieldCheck,
  Settings,
  GitPullRequest,
  FileWarning,
  DatabaseZap,
  Ticket,
  Clock,
  PenTool,
  Code,
  FolderOpen,
  RefreshCw,
  FolderPlus,
  ArrowUp,
  Menu,
  X,
  Bolt,
} from "lucide-react";
import { api, getPortalWorkspaceRoot, setPortalWorkspaceRoot } from "./api";
import { StressLab } from "./pages/StressLab";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { token, isLoading } = useAuth();
  if (isLoading) return <div className="text-white p-8">Loading session...</div>;
  return token ? <>{children}</> : <Navigate to="/" replace />;
};

const ProviderReadyRoute = ({ children }: { children: React.ReactNode }) => {
  const { providerConfigured, providerLoading } = useAuth();
  if (providerLoading) return <div className="text-white p-8">Loading provider config...</div>;
  return providerConfigured ? <>{children}</> : <Navigate to="/setup" replace />;
};

const NavigationLayout = ({ children }: { children: React.ReactNode }) => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showSetupHint, setShowSetupHint] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState<
    Array<{ id: string; tool: string; sessionID: string }>
  >([]);
  const [permissionRulesCount, setPermissionRulesCount] = useState(0);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [autoApproveEnabled, setAutoApproveEnabled] = useState(false);
  const [workspaceInput, setWorkspaceInput] = useState("");
  const [workspaceSaved, setWorkspaceSaved] = useState<string | null>(null);
  const [workspaceDirs, setWorkspaceDirs] = useState<Array<{ name: string; path: string }>>([]);
  const [workspaceDirPath, setWorkspaceDirPath] = useState<string>("");
  const [workspaceParentPath, setWorkspaceParentPath] = useState<string | null>(null);
  const [workspaceBrowseLoading, setWorkspaceBrowseLoading] = useState(false);
  const [workspaceBrowseError, setWorkspaceBrowseError] = useState<string | null>(null);
  const [newDirectoryName, setNewDirectoryName] = useState("");
  const [creatingDirectory, setCreatingDirectory] = useState(false);

  useEffect(() => {
    const key = "tandem_portal_setup_hint_dismissed";
    const autoApproveKey = "tandem_portal_auto_approve_all";
    const existingWorkspace = getPortalWorkspaceRoot();
    if (existingWorkspace) {
      setWorkspaceInput(existingWorkspace);
    }
    setAutoApproveEnabled(localStorage.getItem(autoApproveKey) === "1");
    if (!localStorage.getItem(key)) {
      setShowSetupHint(true);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("tandem_portal_auto_approve_all", autoApproveEnabled ? "1" : "0");
  }, [autoApproveEnabled]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const loadWorkspaceDirectories = async (targetPath?: string) => {
    setWorkspaceBrowseLoading(true);
    setWorkspaceBrowseError(null);
    try {
      const response = await api.listPortalDirectories(targetPath);
      setWorkspaceDirs(response.directories || []);
      setWorkspaceDirPath(response.current || "");
      setWorkspaceParentPath(response.parent || null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setWorkspaceBrowseError(message);
    } finally {
      setWorkspaceBrowseLoading(false);
    }
  };

  useEffect(() => {
    const initial = getPortalWorkspaceRoot() || undefined;
    void loadWorkspaceDirectories(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let stopped = false;
    const getReqStatus = (req: { status?: unknown }) =>
      String(req.status || "")
        .trim()
        .toLowerCase();
    const isPendingReq = (req: { status?: unknown }) => {
      const status = getReqStatus(req);
      return status === "pending" || status === "asked" || status === "waiting";
    };
    const refresh = async () => {
      try {
        const snapshot = await api.listPermissions();
        const pending = (snapshot.requests || [])
          .filter((req) => isPendingReq(req))
          .map((req) => ({
            id: req.id,
            tool: req.tool || req.permission || "tool",
            sessionID: String(req.sessionID || req.sessionId || req.session_id || "unknown"),
          }));
        if (!stopped) {
          setPendingApprovals(pending);
          setPermissionRulesCount((snapshot.rules || []).length);
          setApprovalError(null);
        }
      } catch (error) {
        if (!stopped) {
          const message = error instanceof Error ? error.message : String(error);
          setApprovalError(message);
        }
      }
    };

    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, []);

  const dismissSetupHint = () => {
    localStorage.setItem("tandem_portal_setup_hint_dismissed", "1");
    setShowSetupHint(false);
  };

  const approveAllPending = async () => {
    if (pendingApprovals.length === 0 || approving) return;
    setApproving(true);
    setApprovalError(null);
    try {
      for (const req of pendingApprovals) {
        // Use persistent approval so repeated tool calls don't re-block later turns.
        await api.replyPermission(req.id, "always");
      }
      const snapshot = await api.listPermissions();
      const pending = (snapshot.requests || [])
        .filter((req) => {
          const status = String(req.status || "")
            .trim()
            .toLowerCase();
          return status === "pending" || status === "asked" || status === "waiting";
        })
        .map((req) => ({
          id: req.id,
          tool: req.tool || req.permission || "tool",
          sessionID: String(req.sessionID || req.sessionId || req.session_id || "unknown"),
        }));
      setPendingApprovals(pending);
      setPermissionRulesCount((snapshot.rules || []).length);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setApprovalError(message);
    } finally {
      setApproving(false);
    }
  };

  useEffect(() => {
    if (!autoApproveEnabled || approving || pendingApprovals.length === 0) return;
    void approveAllPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoApproveEnabled, pendingApprovals.length, approving]);

  const saveWorkspaceRoot = () => {
    const trimmed = workspaceInput.trim();
    if (!trimmed) {
      setPortalWorkspaceRoot(null);
      setWorkspaceSaved("Workspace cleared. New sessions will use engine default directory.");
      return;
    }
    setPortalWorkspaceRoot(trimmed);
    setWorkspaceSaved(`Workspace set for new sessions: ${trimmed}`);
  };

  const createDirectory = async () => {
    const name = newDirectoryName.trim();
    if (!name || creatingDirectory) return;
    setCreatingDirectory(true);
    setWorkspaceBrowseError(null);
    try {
      const created = await api.createPortalDirectory({
        parentPath: workspaceDirPath || workspaceInput || undefined,
        name,
      });
      setNewDirectoryName("");
      setWorkspaceInput(created.path);
      setWorkspaceSaved(`Created directory: ${created.path}`);
      await loadWorkspaceDirectories(created.parentPath || workspaceDirPath || undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setWorkspaceBrowseError(message);
    } finally {
      setCreatingDirectory(false);
    }
  };

  const sidebarContent = (showBrand = true) => (
    <>
      {showBrand && (
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <BrainCircuit className="text-emerald-500" />
            Tandem Portal
          </h1>
        </div>
      )}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        <div className="mb-3 rounded-md border border-gray-800 bg-gray-950/60 p-3">
          <p className="text-[11px] tracking-wide text-gray-400 flex items-center gap-1">
            <FolderOpen size={12} />
            Workspace Root
          </p>
          <input
            type="text"
            value={workspaceInput}
            onChange={(e) => {
              setWorkspaceSaved(null);
              setWorkspaceInput(e.target.value);
            }}
            placeholder="/home/user/projects/my-repo"
            className="mt-2 w-full rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-xs text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={saveWorkspaceRoot}
              className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:text-white hover:bg-gray-800"
            >
              Save Root
            </button>
            <button
              type="button"
              onClick={() => {
                setWorkspaceInput("");
                setPortalWorkspaceRoot(null);
                setWorkspaceSaved(
                  "Workspace cleared. New sessions will use engine default directory."
                );
              }}
              className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-800"
            >
              Clear
            </button>
          </div>
          <div className="mt-2 rounded border border-gray-800 bg-gray-900/70 p-2">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-[10px] text-gray-400">Available directories on this machine</p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void loadWorkspaceDirectories(workspaceParentPath || undefined)}
                  disabled={!workspaceParentPath || workspaceBrowseLoading}
                  className="rounded border border-gray-700 px-1.5 py-1 text-[10px] text-gray-300 hover:text-white hover:bg-gray-800 disabled:opacity-40"
                  title="Go to parent directory"
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => void loadWorkspaceDirectories(workspaceDirPath || undefined)}
                  disabled={workspaceBrowseLoading}
                  className="rounded border border-gray-700 px-1.5 py-1 text-[10px] text-gray-300 hover:text-white hover:bg-gray-800 disabled:opacity-40"
                  title="Refresh directory list"
                >
                  <RefreshCw size={12} className={workspaceBrowseLoading ? "animate-spin" : ""} />
                </button>
              </div>
            </div>
            <p className="text-[10px] text-gray-500 break-all mb-2">
              Browsing: <span className="text-gray-300">{workspaceDirPath || "(loading...)"}</span>
            </p>
            <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
              {workspaceBrowseLoading && (
                <p className="text-[10px] text-gray-500">Loading directories...</p>
              )}
              {!workspaceBrowseLoading && workspaceDirs.length === 0 && (
                <p className="text-[10px] text-gray-500">No child directories found.</p>
              )}
              {!workspaceBrowseLoading &&
                workspaceDirs.map((entry) => (
                  <button
                    key={entry.path}
                    type="button"
                    onClick={() => {
                      setWorkspaceInput(entry.path);
                      setWorkspaceSaved(null);
                      void loadWorkspaceDirectories(entry.path);
                    }}
                    className="w-full text-left rounded border border-gray-800 px-2 py-1 text-[10px] text-gray-300 hover:text-white hover:bg-gray-800"
                    title={entry.path}
                  >
                    {entry.name}
                  </button>
                ))}
            </div>
            <div className="mt-2 flex items-center gap-1">
              <input
                type="text"
                value={newDirectoryName}
                onChange={(e) => setNewDirectoryName(e.target.value)}
                placeholder="new-folder"
                className="flex-1 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-[10px] text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => void createDirectory()}
                disabled={!newDirectoryName.trim() || creatingDirectory}
                className="rounded border border-gray-700 px-2 py-1 text-[10px] text-gray-300 hover:text-white hover:bg-gray-800 disabled:opacity-40"
                title="Create directory"
              >
                <FolderPlus size={12} />
              </button>
            </div>
            {workspaceBrowseError && (
              <p className="mt-1 text-[10px] text-rose-300 break-all">{workspaceBrowseError}</p>
            )}
          </div>
          <p className="mt-2 text-[10px] text-gray-500">
            Applies to new sessions. Use absolute paths (no `~`).
          </p>
          <p className="mt-1 text-[10px] text-gray-400 break-all">
            Current:{" "}
            <span className="text-gray-300">
              {workspaceInput.trim().length > 0 ? workspaceInput.trim() : "(engine default)"}
            </span>
          </p>
          {workspaceSaved && <p className="mt-1 text-[10px] text-emerald-300">{workspaceSaved}</p>}
        </div>
        <Link
          to="/setup"
          className="flex items-center gap-3 text-gray-300 hover:text-white hover:bg-gray-800 p-2 rounded-md"
        >
          <Settings size={20} /> Provider Setup
        </Link>
        <Link
          to="/research"
          className="flex items-center gap-3 text-gray-300 hover:text-white hover:bg-gray-800 p-2 rounded-md"
        >
          <LayoutDashboard size={20} /> Research
        </Link>
        <Link
          to="/repo"
          className="flex items-center gap-3 text-gray-300 hover:text-white hover:bg-gray-800 p-2 rounded-md"
        >
          <GitPullRequest size={20} /> Repo Agent
        </Link>
        <Link
          to="/triage"
          className="flex items-center gap-3 text-gray-300 hover:text-white hover:bg-gray-800 p-2 rounded-md"
        >
          <FileWarning size={20} /> Incident Triage
        </Link>
        <Link
          to="/data"
          className="flex items-center gap-3 text-gray-300 hover:text-white hover:bg-gray-800 p-2 rounded-md"
        >
          <DatabaseZap size={20} /> Data Extraction
        </Link>
        <Link
          to="/tickets"
          className="flex items-center gap-3 text-gray-300 hover:text-white hover:bg-gray-800 p-2 rounded-md"
        >
          <Ticket size={20} /> Ticket Triage
        </Link>
        <Link
          to="/watch"
          className="flex items-center gap-3 text-gray-300 hover:text-white hover:bg-gray-800 p-2 rounded-md"
        >
          <Clock size={20} /> Scheduled Watch
        </Link>
        <Link
          to="/content"
          className="flex items-center gap-3 text-gray-300 hover:text-white hover:bg-gray-800 p-2 rounded-md"
        >
          <PenTool size={20} /> Content Creator
        </Link>
        <Link
          to="/html"
          className="flex items-center gap-3 text-gray-300 hover:text-white hover:bg-gray-800 p-2 rounded-md"
        >
          <Code size={20} /> HTML Escape-Hatch
        </Link>
        <Link
          to="/swarm"
          className="flex items-center gap-3 text-gray-300 hover:text-white hover:bg-gray-800 p-2 rounded-md"
        >
          <Users size={20} /> Agent Swarm
        </Link>
        <Link
          to="/adventure"
          className="flex items-center gap-3 text-gray-300 hover:text-white hover:bg-gray-800 p-2 rounded-md"
        >
          <MessageSquareQuote size={20} /> Adventure
        </Link>
        <Link
          to="/second-brain"
          className="flex items-center gap-3 text-gray-300 hover:text-white hover:bg-gray-800 p-2 rounded-md"
        >
          <BrainCircuit size={20} /> Second Brain
        </Link>
        <Link
          to="/channels"
          className="flex items-center gap-3 text-gray-300 hover:text-white hover:bg-gray-800 p-2 rounded-md"
        >
          <Cable size={20} /> Connectors
        </Link>
        <Link
          to="/stress"
          className="flex items-center gap-3 text-gray-300 hover:text-white hover:bg-gray-800 p-2 rounded-md"
        >
          <Bolt size={20} /> Stress Lab
        </Link>
        <Link
          to="/ops"
          className="flex items-center gap-3 text-gray-300 hover:text-white hover:bg-gray-800 p-2 rounded-md"
        >
          <ShieldCheck size={20} /> Ops
        </Link>
      </nav>
      <div className="p-4 border-t border-gray-800">
        <button
          onClick={logout}
          className="flex items-center gap-3 text-gray-400 hover:text-white w-full p-2 rounded-md"
        >
          <LogOut size={20} /> Disconnect
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-[100dvh] bg-gray-950 overflow-hidden">
      <div className="hidden lg:flex w-72 bg-gray-900 border-r border-gray-800 flex-col">
        {sidebarContent(true)}
      </div>
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation menu"
          />
          <div className="absolute left-0 top-0 h-full w-[88vw] max-w-sm bg-gray-900 border-r border-gray-800 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h2 className="text-white font-semibold flex items-center gap-2">
                <BrainCircuit className="text-emerald-500" size={18} /> Tandem Portal
              </h2>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="rounded border border-gray-700 p-1 text-gray-300"
              >
                <X size={18} />
              </button>
            </div>
            {sidebarContent(false)}
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="lg:hidden border-b border-gray-800 bg-gray-900 px-3 py-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="rounded border border-gray-700 p-1.5 text-gray-300"
          >
            <Menu size={18} />
          </button>
          <span className="text-sm font-medium text-white">Tandem Portal</span>
          <span className="text-[11px] text-gray-400">Pending: {pendingApprovals.length}</span>
        </div>
        <div className="flex-1 min-h-0 overflow-auto pb-16 lg:pb-0">{children}</div>
      </div>

      <div className="fixed right-2 top-2 z-50 flex max-w-[calc(100vw-1rem)] items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/95 px-2 py-2 shadow-xl sm:right-4 sm:top-4 sm:px-3">
        <span className="text-xs text-gray-400 hidden sm:inline">Approvals</span>
        <span
          className={`text-xs font-medium ${
            pendingApprovals.length > 0 ? "text-amber-300" : "text-gray-500"
          }`}
        >
          {pendingApprovals.length}
        </span>
        <button
          type="button"
          onClick={() => void approveAllPending()}
          disabled={pendingApprovals.length === 0 || approving}
          className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:text-white hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Approve all currently pending requests (always)"
        >
          {approving ? "..." : "Allow All"}
        </button>
        <button
          type="button"
          onClick={() => setAutoApproveEnabled((prev) => !prev)}
          className={`rounded border px-2 py-1 text-xs ${
            autoApproveEnabled
              ? "border-emerald-600 bg-emerald-600/20 text-emerald-300"
              : "border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800"
          }`}
          title="Automatically approve new permission prompts (always)"
        >
          {autoApproveEnabled ? "Auto: ON" : "Auto: OFF"}
        </button>
      </div>

      <div className="hidden lg:block fixed right-4 bottom-4 z-40 w-80 rounded-lg border border-gray-800 bg-gray-900/95 shadow-xl">
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
          <p className="text-xs text-gray-300 tracking-wide">PENDING APPROVALS</p>
          <span
            className={`text-xs font-medium ${
              pendingApprovals.length > 0 ? "text-amber-300" : "text-gray-500"
            }`}
          >
            {pendingApprovals.length}
          </span>
        </div>
        <div className="px-3 py-2 max-h-36 overflow-y-auto space-y-1">
          {approvalError ? (
            <p className="text-[11px] text-red-300">{approvalError}</p>
          ) : pendingApprovals.length === 0 ? (
            <p className="text-[11px] text-gray-500">
              No pending permission prompts. Active rules: {permissionRulesCount}.
            </p>
          ) : (
            pendingApprovals.slice(0, 8).map((req) => (
              <p key={req.id} className="text-[11px] text-gray-300 font-mono">
                <span className="text-amber-300">{req.tool}</span>{" "}
                <span className="text-gray-500">[{req.sessionID.slice(0, 8)}]</span>
              </p>
            ))
          )}
        </div>
        <div className="px-3 py-2 border-t border-gray-800 flex items-center justify-end">
          <button
            type="button"
            onClick={() => void approveAllPending()}
            disabled={pendingApprovals.length === 0 || approving}
            className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:text-white hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {approving ? "Approving..." : "Approve All (Always)"}
          </button>
        </div>
      </div>
      {showSetupHint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-5 shadow-2xl">
            <div className="flex items-center gap-2 text-white">
              <Settings className="text-emerald-500" size={20} />
              <h3 className="text-lg font-semibold">Provider Setup</h3>
            </div>
            <p className="mt-3 text-sm text-gray-300">
              Configure your default provider and model from{" "}
              <span className="font-medium">Provider Setup</span> so example runs use the expected
              model every time.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={dismissSetupHint}
                className="rounded-md border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800"
              >
                Dismiss
              </button>
              <button
                onClick={() => {
                  dismissSetupHint();
                  navigate("/setup");
                }}
                className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              >
                Open Setup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route
            path="/setup"
            element={
              <ProtectedRoute>
                <ProviderSetup />
              </ProtectedRoute>
            }
          />

          <Route
            path="/research"
            element={
              <ProtectedRoute>
                <ProviderReadyRoute>
                  <NavigationLayout>
                    <ResearchDashboard />
                  </NavigationLayout>
                </ProviderReadyRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/repo"
            element={
              <ProtectedRoute>
                <ProviderReadyRoute>
                  <NavigationLayout>
                    <RepoAgentDashboard />
                  </NavigationLayout>
                </ProviderReadyRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/triage"
            element={
              <ProtectedRoute>
                <ProviderReadyRoute>
                  <NavigationLayout>
                    <IncidentTriageDashboard />
                  </NavigationLayout>
                </ProviderReadyRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/data"
            element={
              <ProtectedRoute>
                <ProviderReadyRoute>
                  <NavigationLayout>
                    <DataExtractionDashboard />
                  </NavigationLayout>
                </ProviderReadyRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/tickets"
            element={
              <ProtectedRoute>
                <ProviderReadyRoute>
                  <NavigationLayout>
                    <TicketTriageDashboard />
                  </NavigationLayout>
                </ProviderReadyRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/watch"
            element={
              <ProtectedRoute>
                <ProviderReadyRoute>
                  <NavigationLayout>
                    <ScheduledWatchDashboard />
                  </NavigationLayout>
                </ProviderReadyRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/content"
            element={
              <ProtectedRoute>
                <ProviderReadyRoute>
                  <NavigationLayout>
                    <ContentCreatorDashboard />
                  </NavigationLayout>
                </ProviderReadyRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/html"
            element={
              <ProtectedRoute>
                <ProviderReadyRoute>
                  <NavigationLayout>
                    <HtmlExtractorDashboard />
                  </NavigationLayout>
                </ProviderReadyRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/swarm"
            element={
              <ProtectedRoute>
                <ProviderReadyRoute>
                  <NavigationLayout>
                    <SwarmDashboard />
                  </NavigationLayout>
                </ProviderReadyRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/adventure"
            element={
              <ProtectedRoute>
                <ProviderReadyRoute>
                  <NavigationLayout>
                    <TextAdventure />
                  </NavigationLayout>
                </ProviderReadyRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/second-brain"
            element={
              <ProtectedRoute>
                <ProviderReadyRoute>
                  <NavigationLayout>
                    <SecondBrainDashboard />
                  </NavigationLayout>
                </ProviderReadyRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/ops"
            element={
              <ProtectedRoute>
                <NavigationLayout>
                  <OpsWorkspace />
                </NavigationLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/channels"
            element={
              <ProtectedRoute>
                <ProviderReadyRoute>
                  <NavigationLayout>
                    <ConnectorsDashboard />
                  </NavigationLayout>
                </ProviderReadyRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/stress"
            element={
              <ProtectedRoute>
                <ProviderReadyRoute>
                  <NavigationLayout>
                    <StressLab />
                  </NavigationLayout>
                </ProviderReadyRoute>
              </ProtectedRoute>
            }
          />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
