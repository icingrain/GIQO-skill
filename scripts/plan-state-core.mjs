import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const TASK_STATUSES = new Set(["saved", "running", "applied", "failed", "stashed", "cancelled"]);

export class PlanStateError extends Error {
  constructor(message) {
    super(message);
    this.name = "PlanStateError";
  }
}

export function slugify(value) {
  const slug = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
  return slug || "work";
}

export function createPlanId(title, now) {
  const stamp = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `plan-${stamp}-${slugify(title)}`;
}

export async function upsertPlanState(options) {
  const now = options.now ?? new Date();
  const planInput = parsePlan(options.input.plan, now);
  const planId = options.planId ?? planInput.id ?? createPlanId(planInput.title, now);
  const planDir = join(options.root, ".giqo", "plans", planId);
  const docsPath = join(".giqo", "plans", planId, "docs");
  const planPath = join(planDir, "plan.json");
  const tasksPath = join(planDir, "tasks.json");
  const currentPlan = await readJson(planPath, null);
  const currentTasks = await readJson(tasksPath, { planId, phases: [], tasks: [], updatedAt: now.toISOString() });
  const mergedPlan = mergePlan(currentPlan, planInput, planId, docsPath, now);
  const mergedTasks = mergeTasks(currentTasks, options.input.phases ?? [], options.input.tasks ?? [], planId, now);

  await mkdir(join(planDir, "docs"), { recursive: true });
  await writeJson(planPath, mergedPlan);
  await writeJson(tasksPath, mergedTasks);

  return {
    planId,
    planPath,
    tasksPath,
    phaseCount: mergedTasks.phases.length,
    taskCount: mergedTasks.tasks.length,
  };
}

function parsePlan(plan, now) {
  if (!plan || typeof plan.title !== "string" || plan.title.trim() === "") {
    throw new PlanStateError("input.plan.title is required.");
  }
  return {
    id: optionalString(plan.id),
    title: plan.title.trim(),
    summary: optionalString(plan.summary),
    parentPlanId: optionalString(plan.parentPlanId),
    sourceRunId: optionalString(plan.sourceRunId),
    createdAt: optionalString(plan.createdAt) ?? now.toISOString(),
  };
}

function mergePlan(currentPlan, input, planId, docsPath, now) {
  return {
    id: planId,
    title: input.title,
    summary: input.summary ?? currentPlan?.summary ?? "",
    parentPlanId: input.parentPlanId ?? currentPlan?.parentPlanId ?? null,
    docsPath: currentPlan?.docsPath ?? docsPath,
    sourceRunId: input.sourceRunId ?? currentPlan?.sourceRunId ?? null,
    createdAt: currentPlan?.createdAt ?? input.createdAt,
    updatedAt: now.toISOString(),
  };
}

function mergeTasks(currentTasks, phaseInputs, taskInputs, planId, now) {
  const phases = upsertItems(currentTasks.phases ?? [], phaseInputs.map(parsePhase));
  const phaseIds = new Set(phases.map((phase) => phase.id));
  const tasks = upsertTasks(currentTasks.tasks ?? [], taskInputs.map((task) => parseTask(task, phaseIds, now)));
  return {
    planId,
    updatedAt: now.toISOString(),
    phases: phases.sort((left, right) => (left.order ?? 0) - (right.order ?? 0)),
    tasks,
  };
}

function parsePhase(phase) {
  if (!phase || typeof phase.id !== "string" || typeof phase.title !== "string") {
    throw new PlanStateError("Each phase requires id and title.");
  }
  return {
    id: prefixId("phase", phase.id),
    title: phase.title.trim(),
    summary: optionalString(phase.summary),
    order: Number.isInteger(phase.order) ? phase.order : undefined,
  };
}

function parseTask(task, phaseIds, now) {
  if (!task || typeof task.id !== "string" || typeof task.phaseId !== "string" || typeof task.title !== "string") {
    throw new PlanStateError("Each task requires id, phaseId, and title.");
  }
  const phaseId = prefixId("phase", task.phaseId);
  if (!phaseIds.has(phaseId)) {
    throw new PlanStateError(`Task ${task.id} references missing phase ${phaseId}.`);
  }
  const status = optionalString(task.status);
  if (status !== undefined && !TASK_STATUSES.has(status)) {
    throw new PlanStateError(`Task ${task.id} has invalid status ${status}.`);
  }
  return {
    id: prefixId("task", task.id),
    phaseId,
    title: task.title.trim(),
    summary: optionalString(task.summary),
    status,
    sourceDocs: stringList(task.sourceDocs),
    sourceReviewRequests: stringList(task.sourceReviewRequests),
    targetFiles: stringList(task.targetFiles),
    evidence: parseEvidence(task.evidence),
    createdAt: optionalString(task.createdAt) ?? now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function parseEvidence(evidence) {
  return {
    changedFiles: stringList(evidence?.changedFiles),
    verification: stringList(evidence?.verification),
    manualQa: stringList(evidence?.manualQa),
    notes: stringList(evidence?.notes),
  };
}

function upsertItems(currentItems, incomingItems) {
  const byId = new Map(currentItems.map((item) => [item.id, item]));
  for (const item of incomingItems) {
    byId.set(item.id, { ...byId.get(item.id), ...item });
  }
  return [...byId.values()];
}

function upsertTasks(currentTasks, incomingTasks) {
  const byId = new Map(currentTasks.map((task) => [task.id, task]));
  for (const task of incomingTasks) {
    const currentTask = byId.get(task.id);
    byId.set(task.id, {
      ...currentTask,
      ...task,
      status: task.status ?? currentTask?.status ?? "saved",
      evidence: hasEvidence(task.evidence) ? task.evidence : currentTask?.evidence ?? task.evidence,
      createdAt: currentTask?.createdAt ?? task.createdAt,
    });
  }
  return [...byId.values()];
}

function hasEvidence(evidence) {
  return Boolean(
    evidence &&
      (evidence.changedFiles.length > 0 || evidence.verification.length > 0 || evidence.manualQa.length > 0 || evidence.notes.length > 0),
  );
}

function prefixId(prefix, value) {
  const slug = slugify(value);
  return slug.startsWith(`${prefix}-`) ? slug : `${prefix}-${slug}`;
}

function optionalString(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function stringList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim() !== "").map((item) => item.trim()) : [];
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw error;
    }
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
