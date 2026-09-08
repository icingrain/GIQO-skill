import { join, resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { dashboardServeTarget } from "./open-visual-review-paths.mjs";

test("Given any plan dashboard path When resolving serve target Then plans root is used", () => {
  const plansRoot = join("tmp", "project", ".giqo", "plans");
  const resolvedPlansRoot = resolve(plansRoot);

  assert.deepEqual(dashboardServeTarget(join(plansRoot, "dashboard", "dashboard.html")), { root: resolvedPlansRoot, fileName: join("dashboard", "dashboard.html") });
  assert.deepEqual(dashboardServeTarget(join(plansRoot, "plan-a", "dashboard.html")), { root: resolvedPlansRoot, fileName: join("plan-a", "dashboard.html") });
});
