import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { upsertPlanState } from "./plan-state-core.mjs";
import { setTaskStatus, TaskStatusError } from "./set-task-status-core.mjs";

test("Given existing task When setting status Then tasks.json is updated in place", async () => {
  const root = await mkdtemp(join(tmpdir(), "giqo-task-status-"));
  await upsertPlanState({
    root,
    now: new Date("2026-07-24T00:00:00.000Z"),
    planId: "plan-status",
    input: {
      plan: { title: "Status Plan" },
      phases: [{ id: "apply", title: "Apply" }],
      tasks: [{ id: "code", phaseId: "apply", title: "Code", status: "saved" }],
    },
  });

  const result = await setTaskStatus({
    root,
    planId: "plan-status",
    taskId: "code",
    status: "running",
    now: new Date("2026-07-24T00:01:00.000Z"),
  });

  const tasks = JSON.parse(await readFile(result.tasksPath, "utf8"));
  assert.equal(tasks.tasks[0].status, "running");
  assert.equal(tasks.tasks[0].updatedAt, "2026-07-24T00:01:00.000Z");
});

test("Given existing evidence When setting applied status Then evidence is merged", async () => {
  const root = await mkdtemp(join(tmpdir(), "giqo-task-status-"));
  await upsertPlanState({
    root,
    planId: "plan-status",
    input: {
      plan: { title: "Evidence Plan" },
      phases: [{ id: "apply", title: "Apply" }],
      tasks: [{ id: "code", phaseId: "apply", title: "Code", status: "running", evidence: { changedFiles: ["README.md"] } }],
    },
  });

  const result = await setTaskStatus({
    root,
    planId: "plan-status",
    taskId: "task-code",
    status: "applied",
    evidence: {
      changedFiles: ["README.md", "SKILL.md"],
      verification: ["node --test passed"],
      manualQa: ["CLI status checked"],
      notes: ["Applied successfully"],
    },
  });

  assert.equal(result.task.status, "applied");
  assert.deepEqual(result.task.evidence.changedFiles, ["README.md", "SKILL.md"]);
  assert.deepEqual(result.task.evidence.verification, ["node --test passed"]);
  assert.deepEqual(result.task.evidence.manualQa, ["CLI status checked"]);
  assert.deepEqual(result.task.evidence.notes, ["Applied successfully"]);
});

test("Given missing task When setting status Then a typed error is thrown", async () => {
  const root = await mkdtemp(join(tmpdir(), "giqo-task-status-"));
  await upsertPlanState({
    root,
    planId: "plan-status",
    input: {
      plan: { title: "Missing Task Plan" },
      phases: [{ id: "apply", title: "Apply" }],
      tasks: [{ id: "code", phaseId: "apply", title: "Code", status: "saved" }],
    },
  });

  await assert.rejects(
    () => setTaskStatus({ root, planId: "plan-status", taskId: "missing", status: "running" }),
    (error) => error instanceof TaskStatusError && /Task not found/.test(error.message),
  );
});

test("Given tasks in multiple phases When setting one task status Then only the matching task changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "giqo-task-status-"));
  await upsertPlanState({
    root,
    planId: "plan-status",
    input: {
      plan: { title: "Anchored Status Plan" },
      phases: [
        { id: "design", title: "Design" },
        { id: "apply", title: "Apply" },
      ],
      tasks: [
        { id: "same-title-design", phaseId: "design", title: "Repeated title", status: "saved" },
        { id: "same-title-apply", phaseId: "apply", title: "Repeated title", status: "saved" },
      ],
    },
  });

  await setTaskStatus({ root, planId: "plan-status", taskId: "same-title-apply", status: "running" });

  const tasksPath = join(root, ".giqo", "plans", "plan-status", "tasks.json");
  const tasks = JSON.parse(await readFile(tasksPath, "utf8"));
  assert.equal(tasks.tasks.find((task) => task.id === "task-same-title-design").status, "saved");
  assert.equal(tasks.tasks.find((task) => task.id === "task-same-title-apply").status, "running");
});
