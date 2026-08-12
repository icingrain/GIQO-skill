# Plan / Phase / Task Model

GIQO tracks implementation work as a simple project ledger, not as a full task manager. The goal is to help the user and the agent see the whole plan, decide when work has drifted, and avoid silently rewriting active tasks.

## Hierarchy

```text
Plan
└── Phase
    └── Task
```

| Unit | Meaning | State |
|---|---|---|
| Plan | A design context large enough to need selected docs and an implementation plan | Derived from child tasks |
| Phase | A logical step inside a Plan | Derived from child tasks |
| Task | The smallest actionable work unit the agent can execute or hand off | Stored directly |

Only Task stores `status`. Plan and Phase completion are rollups from child tasks.

## Storage layout

Persistent planning state lives under `.giqo/plans/`.

```text
.giqo/plans/
  <plan-id>/
    plan.json
    tasks.json
    docs/
      00_INDEX.md
      05_IMPLEMENTATION_PLAN.md
      ...
    dashboard.html
```

`plan.json` records plan identity and document location. `tasks.json` records phases, tasks, and evidence. Generated docs must remain user-facing; `.giqo` must not become the only copy of important decisions.

Use `scripts/update-plan-state.mjs` when an agent needs to create or update this state from structured JSON input. The script upserts `plan.json` and `tasks.json`; it does not edit application source or generate dashboard HTML.

## Plan creation and branching

Create a new Plan when the existing Plan cannot cover a requirement by adding tasks or editing a small number of phases.

New Plan conditions:

1. The request changes the Plan goal or scope.
2. Most existing phases would need to be rewritten.
3. Existing tasks are no longer valid execution units.
4. The request reverses a major architecture, data, API, or UI direction.
5. The request is a large independent workstream that can run beside the existing Plan.

Do not create a new Plan for small additions, acceptance-criteria updates, local UI edits, or implementation-order tweaks. Prefer updating the existing Plan when its phase structure still describes the work.

If the request is related to an existing Plan but changes its direction, create a child Plan with `parentPlanId`. If the request is unrelated, create a new root Plan.

## Task status

Allowed Task statuses:

| Status | Meaning |
|---|---|
| `saved` | Captured and not started |
| `running` | Agent work has started |
| `applied` | Reflected in docs, artifacts, or source |
| `failed` | Attempted but blocked, rejected, or failed |
| `stashed` | Preserved for later because the active plan changed |
| `cancelled` | Explicitly abandoned |

Terminal statuses are `applied`, `failed`, and `cancelled`. `stashed` is not terminal because the task may be restored.

## Rollup rules

Phase and Plan status are computed from child tasks:

1. `running` if any child task is `running`.
2. `failed` if no task is running and any child task is `failed`.
3. `saved` if any child task is `saved`.
4. `stashed` if all non-terminal child tasks are `stashed`.
5. `applied` if every child task is `applied`, `cancelled`, or `stashed`, and at least one child task is `applied`.
6. `cancelled` if every child task is `cancelled`.

When a Plan or Phase has no tasks, treat it as `saved` until tasks are generated.

## Document drift and task reconciliation

Document changes are a signal to inspect tasks, not an automatic status update.

Flow:

```text
docs change
→ identify affected Plan/Phase
→ inspect non-terminal tasks in that Phase
→ decide whether tasks still match the new docs
→ ask the user before rewriting, stashing, or cancelling existing tasks
→ update tasks.json only after the chosen action is clear
```

If a phase has `running` tasks, never rewrite its task list automatically.

When task reconciliation is required, present these choices:

1. Keep existing tasks and add new tasks.
2. Update existing tasks to match the new docs.
3. Stash existing tasks, then create replacement tasks.
4. Cancel existing tasks, then create replacement tasks.
5. Keep the existing Plan untouched and create a new Plan.

If the user chooses to continue despite stale tasks, record the decision in the task evidence or `09_RISK_AND_DECISIONS.md`.

## Task evidence

Tasks should record enough evidence to show what happened without becoming a source-control replacement.

Recommended fields:

| Field | Purpose |
|---|---|
| `sourceDocs` | Docs that justify the task |
| `sourceReviewRequests` | Visual Review request IDs that fed the task |
| `targetFiles` | Intended files or modules, when known |
| `evidence.changedFiles` | Files actually changed during apply |
| `evidence.verification` | Tests, checks, or manual QA performed |
| `evidence.notes` | Short result or failure notes |

Do not use task evidence to store secrets, large logs, or full diffs.

Update a single Task status and append evidence with:

```bash
node scripts/set-task-status.mjs --plan-id <plan-id> --task-id <task-id> --status running
node scripts/set-task-status.mjs --plan-id <plan-id> --task-id <task-id> --status applied --changed-file README.md --verification "node --test passed"
node scripts/set-task-status.mjs --plan-id <plan-id> --task-id <task-id> --status failed --note "Blocked by missing input"
```

Agents should use this helper during `/giqo-skill apply`: mark the task `running` before work starts, then mark it `applied` or `failed` with evidence when the attempt ends. This is the step that makes `tasks.json` change immediately; dashboards and inline status only re-read that state.

Saved Visual Review requests can be promoted into tasks with:

```bash
node scripts/link-review-requests.mjs --plan-id <plan-id> --screen <screen> --phase-id <phase-id>
```

The linker writes request ids into Task `sourceReviewRequests` and writes `linkedTask` back to `.giqo/ui-review/<screen>/change-requests.json`. It does not change request status, task status for existing tasks, task evidence, or application source.

## Dashboard policy

The Plan Dashboard is read-only. It renders `.giqo/plans/<plan-id>/plan.json` and `tasks.json` so users can see progress across Plans, Phases, and Tasks. Users must not edit task state directly in the dashboard.

Generate a dashboard with:

```bash
node scripts/generate-plan-dashboard.mjs --plan-id <plan-id>
```

For a cross-plan view, use:

```bash
node scripts/generate-plan-dashboard.mjs --all
```

Cross-plan dashboards are written to `.giqo/plans/dashboard/` by default. Individual Plan dashboards remain under `.giqo/plans/<plan-id>/`. When a Plan is added, regenerate the cross-plan dashboard with `--all`; the new Plan appears in the sidebar instead of creating a plan-named dashboard fork.

The generator embeds the current Plan/Task state into `dashboard.html` and copies `dashboard.css` plus `dashboard.js` beside it. It is a read-only artifact generator; it must not change `plan.json` or `tasks.json`.
