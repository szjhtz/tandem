import { TASK_STATUS } from "./swarm_types.mjs";
import { upsertTask } from "./swarm_registry.mjs";

function sanitizeTaskId(raw, fallbackIdx) {
  const input = String(raw || "").trim() || `task-${fallbackIdx + 1}`;
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || `task-${fallbackIdx + 1}`;
}

export async function seedTasks({ registry, taskDefs, createWorktree, createSession, startRun }) {
  for (let idx = 0; idx < taskDefs.length; idx++) {
    const raw = taskDefs[idx];
    const taskId = sanitizeTaskId(raw.taskId, idx);
    if (registry.tasks[taskId]) continue;

    const { worktreePath, branch } = await createWorktree(taskId);
    const session = await createSession(taskId, worktreePath);
    const runId = await startRun(raw, session.id, worktreePath, branch);

    upsertTask(registry, {
      taskId,
      title: raw.title || taskId,
      ownerRole: "worker",
      status: TASK_STATUS.PENDING,
      sessionId: session.id,
      runId,
      worktreePath,
      branch,
      notifyOnComplete: true,
      _testerStarted: false,
      _reviewerStarted: false,
    });
  }
  return registry;
}
