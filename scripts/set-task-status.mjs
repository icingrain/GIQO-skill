#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { setTaskStatus, TaskStatusError } from "./set-task-status-core.mjs";

function printHelp() {
  console.log(`GIQO Task status updater

Usage:
  node scripts/set-task-status.mjs --plan-id plan-id --task-id task-id --status running [--root .]

Evidence flags may be repeated:
  --changed-file README.md
  --verification "node --test passed"
  --manual-qa "Dashboard refresh checked"
  --note "Short result note"
`);
}

function parseArgs(argv) {
  const options = { root: ".", planId: "", taskId: "", status: "", evidence: { changedFiles: [], verification: [], manualQa: [], notes: [] } };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") return { kind: "help" };
    if (arg === "--root") { options.root = argv[index + 1] ?? options.root; index += 1; continue; }
    if (arg === "--plan-id") { options.planId = argv[index + 1] ?? options.planId; index += 1; continue; }
    if (arg === "--task-id") { options.taskId = argv[index + 1] ?? options.taskId; index += 1; continue; }
    if (arg === "--status") { options.status = argv[index + 1] ?? options.status; index += 1; continue; }
    if (arg === "--changed-file") { options.evidence.changedFiles.push(argv[index + 1] ?? ""); index += 1; continue; }
    if (arg === "--verification") { options.evidence.verification.push(argv[index + 1] ?? ""); index += 1; continue; }
    if (arg === "--manual-qa") { options.evidence.manualQa.push(argv[index + 1] ?? ""); index += 1; continue; }
    if (arg === "--note") { options.evidence.notes.push(argv[index + 1] ?? ""); index += 1; }
  }
  return { kind: "run", options };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.kind === "help") { printHelp(); return; }
  const result = await setTaskStatus(parsed.options);
  console.log(`Task status updated: ${result.planId}/${result.task.id}`);
  console.log(`Status: ${result.task.status}`);
  console.log(`Tasks: ${result.tasksPath}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    if (error instanceof TaskStatusError || error instanceof SyntaxError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  });
}
