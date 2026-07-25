import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const TASK_STATUSES = new Set(["saved", "running", "applied", "failed", "stashed", "cancelled"]);

export class TaskStatusError extends Error {
  constructor(message) {
    super(message);
    this.name = "TaskStatusError";
  }
}

export async function setTaskStatus(options) {
  const root = resolve(options.root ?? ".");
  const planId = required(options.planId, "planId");
  const taskId = normalizeTaskId(required(options.taskId, "taskId"));
  const status = required(options.status, "status");
  if (!TASK_STATUSES.has(status)) throw new TaskStatusError(`Invalid task status: ${status}`);

  const tasksPath = join(root, ".giqo", "plans", planId, "tasks.json");
  const taskState = await readTaskState(tasksPath);
  const taskIndex = taskState.tasks.findIndex((task) => task.id === taskId);
  if (taskIndex < 0) throw new TaskStatusError(`Task not found: ${taskId}`);

  const now = options.now ?? new Date();
  const currentTask = taskState.tasks[taskIndex];
  const nextTask = {
    ...currentTask,
    status,
    evidence: mergeEvidence(currentTask.evidence, options.evidence),
    updatedAt: now.toISOString(),
  };
  taskState.tasks[taskIndex] = nextTask;
  taskState.updatedAt = now.toISOString();

  await writeFile(tasksPath, `${JSON.stringify(taskState, null, 2)}\n`, "utf8");
  return { planId, tasksPath, task: nextTask };
}

async function readTaskState(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") throw new TaskStatusError(`Missing tasks.json: ${path}`);
    throw error;
  }
}

function mergeEvidence(current = {}, incoming = {}) {
  return {
    changedFiles: mergeList(current.changedFiles, incoming.changedFiles),
    verification: mergeList(current.verification, incoming.verification),
    manualQa: mergeList(current.manualQa, incoming.manualQa),
    notes: mergeList(current.notes, incoming.notes),
  };
}

function mergeList(left, right) {
  const values = [...stringList(left), ...stringList(right)];
  return [...new Set(values)];
}

function stringList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim() !== "").map((item) => item.trim()) : [];
}

function normalizeTaskId(value) {
  return value.startsWith("task-") ? value : `task-${value}`;
}

function required(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new TaskStatusError(`${name} is required.`);
  return value.trim();
}
