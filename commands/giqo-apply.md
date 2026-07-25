# /giqo-skill apply

Legacy workflow name: `/giqo-apply`.

Apply approved GIQO outputs and task work to the project.

## Use when

1. A plan or UI review result has been accepted.
2. Generated docs need to be copied into the project.
3. The user explicitly wants approved changes written.
4. A saved Task is ready to move through `running` to `applied` or `failed`.

## Inputs

| Input | Required | Notes |
|---|---|---|
| `run` | No | Defaults to active run |
| `target` | No | Docs, review assets, or named source paths |
| `allowSourceEdits` | No | Defaults to false |
| `taskId` | No | Specific task to apply or update |

## Reads

1. `.giqo/workspace.json`.
2. Active run outputs.
3. Current target files.
4. Apply policy from `references/command-policy.md`.
5. Saved UI edit requests, when present.
6. `.giqo/plans/<plan-id>/tasks.json`, when present.

## Writes

1. Approved docs.
2. Approved `ui-review/` artifacts.
3. Application source only when the apply boundary permits it.
4. `.giqo/plans/<plan-id>/tasks.json` task status and evidence updates.

## Behavior

1. Confirm the active run and target outputs.
2. Compare generated outputs with existing files.
3. Refuse source edits unless the apply boundary is satisfied.
4. When applying a Task, run `scripts/set-task-status.mjs --plan-id <plan-id> --task-id <task-id> --status running` before modifying docs, artifacts, or source.
5. When applying a saved UI edit request, update its status to `running` in `.giqo/ui-review/<screen>/` before modifying docs, artifacts, or source.
6. Write approved docs and review assets.
7. For allowed source edits, make only the named changes.
8. Run the checks named in the plan when source edits occur.
9. Record changed files, verification, manual QA, and notes in task evidence with `scripts/set-task-status.mjs`.
10. Mark each attempted Task and UI request `applied` or `failed` after the work and preserve the reason for failures.
11. If the user asks to apply UI edits or tasks but no saved items exist, stop with a state report instead of making speculative changes.

## Completion report

Report files written, files skipped, task status changes, checks run, and any apply items left for a human or implementation agent. If a Plan id is known, end with the inline status from `scripts/show-plan-status.mjs`.

If there is nothing to apply, say so directly, for example: `No saved UI edit requests were found, so no UI changes were applied.`
