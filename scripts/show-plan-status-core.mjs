import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

export class PlanStatusError extends Error {
  constructor(message) {
    super(message);
    this.name = "PlanStatusError";
  }
}

const STATUSES = ["applied", "running", "saved", "stashed", "failed", "cancelled"];
const STATUS_ALIASES = new Map([
  ["in_progress", "running"],
  ["in-progress", "running"],
  ["progress", "running"],
  ["진행중", "running"],
  ["진행 중", "running"],
  ["done", "applied"],
  ["complete", "applied"],
  ["completed", "applied"],
]);
const ICONS = { applied: "✓", running: "▶", saved: "○", stashed: "◇", failed: "!", cancelled: "×" };
const ANSI = {
  reset: "\u001b[0m",
  dim: "\u001b[2m",
  green: "\u001b[32m",
  blue: "\u001b[34m",
  yellow: "\u001b[33m",
  gray: "\u001b[90m",
};

export async function loadPlanStatus(options) {
  const root = resolve(options.root ?? ".");
  const planId = await resolvePlanId(root, options.planId ?? "");
  const planDir = join(root, ".giqo", "plans", planId);
  return {
    plan: await readJson(join(planDir, "plan.json")),
    taskState: await readJson(join(planDir, "tasks.json")),
  };
}

export function renderPlanStatus(entry, options = {}) {
  const format = options.format ?? "standard";
  if (format === "compact") return renderCompact(entry);
  if (format === "rich") return renderRich(entry, options.color === true);
  return renderStandard(entry);
}

async function resolvePlanId(root, requested) {
  if (requested) return requested;
  const plansDir = join(root, ".giqo", "plans");
  if (!existsSync(plansDir)) throw new PlanStatusError("No .giqo/plans directory found.");
  const planIds = (await readdir(plansDir, { withFileTypes: true })).filter((entry) => isPlanDirectory(plansDir, entry)).map((entry) => entry.name).sort();
  if (planIds.length === 0) throw new PlanStatusError("No plans found under .giqo/plans.");
  if (planIds.length > 1) throw new PlanStatusError(`Multiple plans found. Pass --plan-id. Available: ${planIds.join(", ")}`);
  return planIds[0];
}

function isPlanDirectory(plansDir, entry) {
  return entry.isDirectory() && existsSync(join(plansDir, entry.name, "plan.json")) && existsSync(join(plansDir, entry.name, "tasks.json"));
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") throw new PlanStatusError(`Missing Plan status input: ${path}`);
    throw error;
  }
}

function renderCompact(entry) {
  const { plan, phases, tasks } = normalize(entry);
  const lines = [`Plan: ${plan.title}`, `Progress: ${count(tasks, "applied")}/${tasks.length} applied`, `Health: ${health(tasks)}`, ""];
  phases.forEach((phase, index) => {
    const phaseTasks = tasks.filter((task) => task.phaseId === phase.id);
    lines.push(`${index + 1}. ${phase.title} — ${count(phaseTasks, "applied")}/${phaseTasks.length} applied`);
    phaseTasks.forEach((task) => lines.push(`   ${ICONS[task.status] ?? ICONS.saved} ${task.title}`));
  });
  return lines.join("\n");
}

function renderStandard(entry) {
  const { plan, phases, tasks } = normalize(entry);
  const counts = statusCounts(tasks);
  const rows = phases.map((phase) => {
    const phaseTasks = tasks.filter((task) => task.phaseId === phase.id);
    return [phase.title, `${count(phaseTasks, "applied")} / ${phaseTasks.length}`];
  });
  const width = Math.max(28, ...rows.map(([title]) => displayLength(title)));
  return [
    plan.title,
    `${count(tasks, "applied")} / ${tasks.length} applied · running ${counts.running} · saved ${counts.saved}`,
    "",
    `${padRight("Phase", width)}  Progress`,
    "─".repeat(width + 12),
    ...rows.map(([title, progress]) => `${padRight(title, width)}  ${progress}`),
  ].join("\n");
}

function renderRich(entry, color) {
  const { plan, tasks } = normalize(entry);
  const counts = statusCounts(tasks);
  const state = health(tasks);
  const bar = progressBar(count(tasks, "applied"), tasks.length, 14);
  const tint = color ? colorForHealth(state) : "";
  const reset = color ? ANSI.reset : "";
  return [
    `┌ ${tint}${plan.title}${reset}`,
    `│ Progress  ${tint}${bar}${reset}  ${count(tasks, "applied")} / ${tasks.length}`,
    `│ Running ${counts.running} · Saved ${counts.saved} · Failed ${counts.failed}`,
    `└ Health ${state}`,
  ].join("\n");
}

function normalize(entry) {
  const plan = entry.plan ?? {};
  const taskState = entry.taskState ?? {};
  return {
    plan: { title: plan.title ?? plan.id ?? "Untitled Plan" },
    phases: [...(taskState.phases ?? [])].sort((left, right) => (left.order ?? 0) - (right.order ?? 0)),
    tasks: Array.isArray(taskState.tasks) ? taskState.tasks.map(normalizeTask) : [],
  };
}

function normalizeTask(task) {
  return { ...task, status: statusOf(task.status) };
}

function statusOf(value = "saved") {
  const key = String(value).trim().toLowerCase();
  return STATUSES.includes(key) ? key : STATUS_ALIASES.get(key) ?? "saved";
}

function health(tasks) {
  if (tasks.length === 0) return "not-started";
  if (tasks.some((task) => task.status === "failed" || task.status === "stashed")) return "blocked";
  if (tasks.some((task) => task.status === "running")) return "running";
  if (tasks.some((task) => task.status === "applied")) return "complete";
  return "not-started";
}

function statusCounts(tasks) {
  return Object.fromEntries(STATUSES.map((status) => [status, count(tasks, status)]));
}

function count(tasks, status) {
  return tasks.filter((task) => task.status === status).length;
}

function progressBar(value, total, width) {
  const filled = total > 0 ? Math.round((value / total) * width) : 0;
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}

function colorForHealth(value) {
  if (value === "complete") return ANSI.green;
  if (value === "blocked") return ANSI.yellow;
  if (value === "not-started") return ANSI.gray;
  return ANSI.blue;
}

function padRight(value, width) {
  return `${value}${" ".repeat(Math.max(width - displayLength(value), 0))}`;
}

function displayLength(value) {
  return [...value].reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 2 : 1), 0);
}
