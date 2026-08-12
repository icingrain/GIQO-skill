import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { generatePlanDashboard } from "./plan-dashboard-generator.mjs";

test("Given plan state When generating dashboard Then html embeds plan and task state", async () => {
  const root = await mkdtemp(join(tmpdir(), "giqo-dashboard-"));
  const planDir = join(root, ".giqo", "plans", "plan-dashboard");
  await mkdir(planDir, { recursive: true });
  await writeJson(join(planDir, "plan.json"), {
    id: "plan-dashboard",
    title: "Dashboard Plan",
    summary: "Generated state.",
    docsPath: ".giqo/plans/plan-dashboard/docs",
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
  });
  await writeJson(join(planDir, "tasks.json"), {
    planId: "plan-dashboard",
    updatedAt: "2026-07-23T00:00:00.000Z",
    phases: [{ id: "phase-one", title: "Phase One" }],
    tasks: [{ id: "task-one", phaseId: "phase-one", title: "Task One", status: "saved", createdAt: "2026-07-23T00:00:00.000Z", updatedAt: "2026-07-23T00:00:00.000Z" }],
  });

  const result = await generatePlanDashboard({ root, planId: "plan-dashboard" });

  const html = await readFile(result.dashboardPath, "utf8");
  assert.match(html, /data-gqo-dashboard-state/);
  assert.match(html, /Dashboard Plan/);
  assert.match(html, /Task One/);
  assert.equal(result.planCount, 1);
  assert.equal(result.taskCount, 1);
});

test("Given all-plans mode When generating dashboard Then each plan becomes one board column", async () => {
  const root = await mkdtemp(join(tmpdir(), "giqo-dashboard-"));
  await writePlan(root, "plan-a", "Plan A");
  await writePlan(root, "plan-b", "Plan B");
  await mkdir(join(root, ".giqo", "plans", "dashboard"), { recursive: true });

  const result = await generatePlanDashboard({ root, allPlans: true });
  const repeated = await generatePlanDashboard({ root, allPlans: true });

  const html = await readFile(result.dashboardPath, "utf8");
  assert.match(html, /Plan A/);
  assert.match(html, /Plan B/);
  assert.doesNotMatch(html, /Untitled Plan/);
  assert.equal(result.planCount, 2);
  assert.equal(result.outputDir, join(root, ".giqo", "plans", "dashboard"));
  assert.equal(repeated.outputDir, result.outputDir);
});

async function writePlan(root, planId, title) {
  const planDir = join(root, ".giqo", "plans", planId);
  await mkdir(planDir, { recursive: true });
  await writeJson(join(planDir, "plan.json"), {
    id: planId,
    title,
    docsPath: `.giqo/plans/${planId}/docs`,
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
  });
  await writeJson(join(planDir, "tasks.json"), {
    planId,
    updatedAt: "2026-07-23T00:00:00.000Z",
    phases: [{ id: `phase-${planId}`, title: `${title} Phase` }],
    tasks: [],
  });
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
