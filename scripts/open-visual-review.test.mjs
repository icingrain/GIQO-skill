import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { readPlanDashboardState } from "./plan-dashboard-state-core.mjs";

test("Given plan directories When reading live dashboard state Then all plans are discovered from disk", async () => {
  const root = await mkdtemp(join(tmpdir(), "giqo-live-dashboard-"));
  await writePlan(root, "plan-a", "Plan A", "applied");
  await writePlan(root, "plan-b", "Plan B", "saved");
  await mkdir(join(root, "dashboard"), { recursive: true });

  const state = await readPlanDashboardState(root);

  assert.deepEqual(state.plans.map((entry) => entry.plan.id), ["plan-a", "plan-b"]);
  assert.deepEqual(state.plans.map((entry) => entry.taskState.tasks[0].status), ["applied", "saved"]);
});

async function writePlan(root, planId, title, status) {
  const planDir = join(root, planId);
  await mkdir(planDir, { recursive: true });
  await writeFile(join(planDir, "plan.json"), `${JSON.stringify({ id: planId, title }, null, 2)}\n`, "utf8");
  await writeFile(join(planDir, "tasks.json"), `${JSON.stringify({ planId, phases: [{ id: `phase-${planId}`, title: `${title} Phase` }], tasks: [{ id: `task-${planId}`, phaseId: `phase-${planId}`, title: `${title} Task`, status }] }, null, 2)}\n`, "utf8");
}
