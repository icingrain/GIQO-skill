import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { readPlanDashboardState } from "./plan-dashboard-state-core.mjs";

test("Given plan directories When reading live dashboard state Then all plans are discovered newest first from disk", async () => {
  const root = await mkdtemp(join(tmpdir(), "giqo-live-dashboard-"));
  await writePlan(root, "plan-a", "Plan A", "applied", "2026-07-23T00:00:00.000Z");
  await writePlan(root, "plan-b", "Plan B", "saved", "2026-07-24T00:00:00.000Z");
  await mkdir(join(root, "dashboard"), { recursive: true });

  const state = await readPlanDashboardState(root);

  assert.deepEqual(state.plans.map((entry) => entry.plan.id), ["plan-b", "plan-a"]);
  assert.deepEqual(state.plans.map((entry) => entry.taskState.tasks[0].status), ["saved", "applied"]);
});

async function writePlan(root, planId, title, status, updatedAt) {
  const planDir = join(root, planId);
  await mkdir(planDir, { recursive: true });
  await writeFile(join(planDir, "plan.json"), `${JSON.stringify({ id: planId, title, updatedAt }, null, 2)}\n`, "utf8");
  await writeFile(join(planDir, "tasks.json"), `${JSON.stringify({ planId, updatedAt, phases: [{ id: `phase-${planId}`, title: `${title} Phase` }], tasks: [{ id: `task-${planId}`, phaseId: `phase-${planId}`, title: `${title} Task`, status }] }, null, 2)}\n`, "utf8");
}
