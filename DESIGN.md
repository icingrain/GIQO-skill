# GIQO Design System

## 1. Product feel

GIQO UI surfaces should feel practical, reviewable, and low-friction. The interface is an agent workbench: controls must make state and scope explicit before any saved request or task is created.

## 2. Color tokens

Use the existing Visual Review CSS custom properties as source-of-truth tokens:

- Text: `--gqo-text`, `--gqo-text-strong`, `--gqo-muted`
- Surfaces: `--gqo-surface`, `--gqo-canvas`
- Lines: `--gqo-line`, `--gqo-line-soft`
- Primary review action: `--gqo-accent`, `--gqo-accent-soft`
- App interaction mode: `--gqo-interact`, `--gqo-interact-soft`
- Destructive/failed state: `--gqo-danger`

Do not add raw colors to Visual Review templates unless they are first promoted to a `--gqo-*` token.

## 3. Typography

Use `--gqo-font` for all GIQO browser UI. Keep toolbar metadata compact and high-signal; labels should be short nouns or noun phrases.

## 4. Spacing and shape

Use the 4px-based spacing scale `--gqo-space-1` through `--gqo-space-9`. Use `--gqo-radius-sm`, `--gqo-radius-md`, and `--gqo-radius-lg` for controls, menus, and panels.

## 5. Components

- Toolbar controls: compact buttons/selectors in `.gqo-toolbar-controls`, using existing button styles.
- Target picker: checkbox menu for selecting global, single-target, or multi-target request scope.
- Comment panel: `.gqo-panel` is the only place where a saved edit request is authored.
- Saved feedback list: `.gqo-comment-list` shows persisted requests and their target chips.

## 6. Interaction rules

Always make request scope observable before saving. If no element target is selected, the request scope is `global`. If multiple targets are selected, save a multi-target request without forcing a click on the canvas.

## 7. Accessibility and performance

Use real buttons for actions, preserve keyboard focus, and avoid layout-affecting animations. Visual Review must remain usable in both static review pages and live iframe review pages.
