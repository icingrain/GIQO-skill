import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export async function readPlanDashboardState(plansRoot) {
  const entries = await readdir(plansRoot, { withFileTypes: true });
  const plans = [];
  for (const entry of entries.filter((candidate) => isPlanDirectory(plansRoot, candidate)).sort((left, right) => left.name.localeCompare(right.name))) {
    const planDir = join(plansRoot, entry.name);
    plans.push({
      plan: JSON.parse(await readFile(join(planDir, "plan.json"), "utf8")),
      taskState: JSON.parse(await readFile(join(planDir, "tasks.json"), "utf8")),
    });
  }
  return { plans };
}

function isPlanDirectory(plansRoot, entry) {
  return entry.isDirectory() && existsSync(join(plansRoot, entry.name, "plan.json")) && existsSync(join(plansRoot, entry.name, "tasks.json"));
}
