# Visual Review Mode

Visual Review Mode makes wireframes, mockups, and proxied actual screens editable through saved UI requests in the browser.

## Behavior

1. Serve `wireframe.html` or `mockup.html` with `node scripts/open-visual-review.mjs`; open the printed URL through the agent/browser surface, or pass `--open` only when direct OS browser launch is desired.
2. Hover reviewable elements to see a highlight.
3. Click a reviewable element, choose it from the Target dropdown, or choose Global.
4. Write a UI edit request with severity.
5. Save feedback automatically to `.giqo/ui-review/<screen>/`.
6. Use Refresh to reload the latest agent-updated review state.
7. Reuse `.giqo/ui-review/<screen>/targets.json` to avoid remapping the same screen on every run.
8. Discover visible targets first; map hidden or offscreen states lazily when they become relevant.

## Actual screen live shell

When launched with `--actual`, the local launcher opens `live-shell.html` instead of injecting review controls into the app page:

```bash
node scripts/open-visual-review.mjs ./ui-review/mockup.html --actual http://localhost:3000
```

The actual app is loaded inside an iframe through the launcher's same-origin `/__gqo/actual/` proxy. The GIQO toolbar, feedback panel, overlay boxes, and review CSS live in the outer shell, not in the app DOM. This keeps app-level CSS such as `:root`, `body`, layout, and `[data-gqo-id]` positioning untouched while still allowing the shell to read currently visible `data-gqo-id` targets.

If the actual page cannot be proxied, does not expose stable `data-gqo-id` attributes, or depends on browser features that reject iframe/proxy loading, use the generated `wireframe.html` or `mockup.html` artifact as the commentable surface and keep the actual URL as a reference link.

## Element contract

Every reviewable element must include:

```html
data-gqo-id="screen.section.element"
```

Use stable semantic IDs, not visual positions.

## Request ingestion

When `.giqo/ui-review/<screen>/comments.json` or `change-requests.json` exists, GIQO should:

- load `targets.json` first when present
- map each saved request to the target `data-gqo-id`
- update UI/UX decisions
- add implementation tasks for actionable change requests
- preserve unresolved comments in `09_RISK_AND_DECISIONS.md`

## Constraints

- Static HTML cannot reliably write local files directly without the local launcher.
- Treat browser `localStorage` as a temporary cache.
- Treat `.giqo/ui-review/<screen>/` as the local canonical review state when the launcher is used.
- Treat `targets.json` as a cache for speed, not as the source of truth.
- Do not block initial review setup on hidden, collapsed, modal-only, or offscreen targets.
- Treat request status as read-only in the browser. Agents update status as work moves from `saved` to `running`, `applied`, or `failed`.
- Treat `--actual` as an isolated live shell over a launcher-served same-origin iframe when proxying works. It still saves requests only; it does not mutate the actual app or its source files.
- Fall back to artifact review when the actual app blocks iframe/proxy loading or lacks stable `data-gqo-id` targets.
