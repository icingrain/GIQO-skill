import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const TEMPLATE_DIR = resolve(dirname(new URL(import.meta.url).pathname), "..", "templates", "plan-dashboard");
const DASHBOARD_MARKER = "</body>";

export class PlanDashboardError extends Error {
  constructor(message) {
    super(message);
    this.name = "PlanDashboardError";
  }
}

export async function generatePlanDashboard(options) {
  const root = resolve(options.root);
  const dashboardOptions = effectiveDashboardOptions(root, options);
  const plans = await readPlans(root, dashboardOptions);
  const outputDir = resolveOutputDir(root, dashboardOptions);
  const dashboardPath = join(outputDir, "dashboard.html");
  const statePath = join(outputDir, "dashboard-state.json");
  const state = { plans };
  const html = await renderDashboardHtml(state);
  const stateJson = `${JSON.stringify(state, null, 2)}\n`;

  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeFile(dashboardPath, html, "utf8"),
    writeFile(statePath, stateJson, "utf8"),
    copyFile(join(TEMPLATE_DIR, "dashboard.css"), join(outputDir, "dashboard.css")),
    copyFile(join(TEMPLATE_DIR, "dashboard.js"), join(outputDir, "dashboard.js")),
  ]);

  return {
    dashboardPath,
    outputDir,
    planCount: plans.length,
    phaseCount: plans.reduce((count, entry) => count + entry.taskState.phases.length, 0),
    taskCount: plans.reduce((count, entry) => count + entry.taskState.tasks.length, 0),
  };
}

function effectiveDashboardOptions(root, options) {
  if (!options.planId || options.allPlans || options.outputDir) {
    return options;
  }
  const dashboardPath = join(root, ".giqo", "plans", "dashboard", "dashboard.html");
  return existsSync(dashboardPath) ? { ...options, planId: undefined, allPlans: true } : options;
}

async function readPlans(root, options) {
  const planIds = await resolvePlanIds(root, options);
  const plans = [];
  for (const planId of planIds) {
    const planDir = join(root, ".giqo", "plans", planId);
    plans.push({
      plan: await readJson(join(planDir, "plan.json")),
      taskState: await readJson(join(planDir, "tasks.json")),
    });
  }
  return plans;
}

async function resolvePlanIds(root, options) {
  if (options.planId) {
    return [options.planId];
  }
  if (options.allPlans) {
    const plansDir = join(root, ".giqo", "plans");
    if (!existsSync(plansDir)) {
      throw new PlanDashboardError("No .giqo/plans directory found.");
    }
    const entries = await readdir(plansDir, { withFileTypes: true });
    return entries.filter((entry) => isPlanDirectory(plansDir, entry)).map((entry) => entry.name).sort();
  }
  throw new PlanDashboardError("Provide --plan-id or --all.");
}

function isPlanDirectory(plansDir, entry) {
  return entry.isDirectory() && existsSync(join(plansDir, entry.name, "plan.json")) && existsSync(join(plansDir, entry.name, "tasks.json"));
}

function resolveOutputDir(root, options) {
  if (options.outputDir) {
    return resolve(options.outputDir);
  }
  if (options.planId) {
    return join(root, ".giqo", "plans", options.planId);
  }
  return join(root, ".giqo", "plans", "dashboard");
}

async function renderDashboardHtml(state) {
  const template = await readFile(join(TEMPLATE_DIR, "dashboard.html"), "utf8");
  const script = `<script type="application/json" data-gqo-dashboard-state>${escapeJsonForHtml(JSON.stringify(state))}</script>\n`;
  if (!template.includes(DASHBOARD_MARKER)) {
    throw new PlanDashboardError("Dashboard template is missing </body> marker.");
  }
  return template.replace(DASHBOARD_MARKER, `${script}${DASHBOARD_MARKER}`);
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new PlanDashboardError(`Missing dashboard input: ${path}`);
    }
    throw error;
  }
}

function escapeJsonForHtml(value) {
  return value.replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026");
}
