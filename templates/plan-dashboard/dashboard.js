const STATUSES = ["applied", "running", "saved", "stashed", "failed", "cancelled"];
const OPEN = new Set(["saved", "running", "failed", "stashed"]);
const STATUS_ALIASES = new Map([
  ["in_progress", "running"],
  ["in-progress", "running"],
  ["progress", "running"],
  ["진행중", "running"],
  ["진행 중", "running"],
  ["done", "applied"],
  ["complete", "applied"],
  ["completed", "applied"],
]);

const sampleState = { plans: [{ plan: { id: "plan-ui-components", title: "UI componentization test plan", summary: "Plan for splitting the current board UI into reusable components while preserving behavior.", updatedAt: "2026-07-23T00:00:00.000Z" }, taskState: { phases: [
  { id: "phase-boundary", title: "UI boundary survey", summary: "Identify sections, state flow, and style groups before moving markup.", order: 0 },
  { id: "phase-layout", title: "Separate static layout components", summary: "Split stable page sections into reusable HTML modules.", order: 1 },
  { id: "phase-state", title: "Separate state logic", summary: "Move board state, filters, and data flow into focused modules.", order: 2 }
], tasks: [
  { id: "task-map-board", phaseId: "phase-boundary", title: "Map current board sections and interaction states", status: "applied", summary: "Record board list, filters, detail panel, compose form, and post states before splitting.", sourceDocs: ["05_IMPLEMENTATION_PLAN.md", "03_CURRENT_UI_BOUNDARY_MAP.md"], targetFiles: ["index.html", "app.js", "styles.css"], sourceReviewRequests: ["board-main", "hero-section"], evidence: { changedFiles: ["index.html", "app.js", "styles.css"], verification: ["2 passed"], manualQa: [] }, updatedAt: "2026-07-23T00:02:00.000Z" },
  { id: "task-contracts", phaseId: "phase-boundary", title: "Define component contracts and preserved behavior", status: "saved", summary: "Describe component responsibilities and interaction contracts before extracting code.", sourceDocs: ["05_IMPLEMENTATION_PLAN.md"], targetFiles: ["app.js"], evidence: { changedFiles: [], verification: [], manualQa: [] }, updatedAt: "2026-07-23T00:10:00.000Z" },
  { id: "task-layout", phaseId: "phase-layout", title: "Extract static layout components", status: "saved", summary: "Move stable shells without changing behavior.", updatedAt: "2026-07-22T00:00:00.000Z" }
] } }] };

const stateRef = { plans: [], activePlan: 0, activePhase: "", activeTask: "" };
const $ = (selector) => document.querySelector(selector);

$("#gqo-refresh")?.addEventListener("click", () => loadDashboard({ fresh: true }));
void loadDashboard({ fresh: false });

async function loadDashboard({ fresh }) {
  setText("#gqo-status", "Loading dashboard state…");
  const state = fresh ? await readFreshState() : readEmbeddedState();
  stateRef.plans = normalizePlans(Array.isArray(state.plans) ? state.plans : []);
  stateRef.activePlan = Math.min(stateRef.activePlan, Math.max(stateRef.plans.length - 1, 0));
  setDefaultSelection();
  render();
  setText("#gqo-status", "Updated just now");
}

function readEmbeddedState() {
  const embedded = document.querySelector('script[type="application/json"][data-gqo-dashboard-state]');
  if (!embedded?.textContent?.trim()) return sampleState;
  try { return JSON.parse(embedded.textContent); } catch { return sampleState; }
}

async function readFreshState() {
  try {
    const embedded = readEmbeddedState();
    const embeddedPlans = Array.isArray(embedded.plans) ? embedded.plans : [];
    if (embeddedPlans.length > 1) return readFreshPlans(embeddedPlans);
    const [planResponse, tasksResponse] = await Promise.all([fetch("plan.json", { cache: "no-store" }), fetch("tasks.json", { cache: "no-store" })]);
    if (!planResponse.ok || !tasksResponse.ok) return embedded;
    const [plan, taskState] = await Promise.all([planResponse.json(), tasksResponse.json()]);
    return { plans: [{ plan, taskState }] };
  } catch {
    return readEmbeddedState();
  }
}

async function readFreshPlans(embeddedPlans) {
  const plans = await Promise.all(embeddedPlans.map(async (entry) => {
    const planId = entry.plan?.id;
    if (!planId) return entry;
    const [planResponse, tasksResponse] = await Promise.all([
      fetch(`../${encodeURIComponent(planId)}/plan.json`, { cache: "no-store" }),
      fetch(`../${encodeURIComponent(planId)}/tasks.json`, { cache: "no-store" }),
    ]);
    if (!planResponse.ok || !tasksResponse.ok) return entry;
    const [plan, taskState] = await Promise.all([planResponse.json(), tasksResponse.json()]);
    return { plan, taskState };
  }));
  return { plans };
}

function setDefaultSelection() {
  const phases = currentPhases();
  if (!phases.some((phase) => phase.id === stateRef.activePhase)) stateRef.activePhase = phases[0]?.id ?? "";
  const tasks = currentTasks().filter((task) => task.phaseId === stateRef.activePhase);
  if (!tasks.some((task) => task.id === stateRef.activeTask)) stateRef.activeTask = tasks[0]?.id ?? "";
}

function render() {
  renderPlans();
  renderHeader();
  renderSummary();
  renderPhases();
  renderTasks();
  renderDetail();
}

function renderPlans() {
  const list = $("#gqo-plan-list");
  list.replaceChildren(...stateRef.plans.map((entry, index) => {
    const tasks = entry.taskState?.tasks ?? [];
    const applied = countStatus(tasks, "applied");
    const percent = percentOf(applied, tasks.length);
    const planStatus = planStatusOf(tasks);
    const button = el("button", `plan-card${index === stateRef.activePlan ? " is-active" : ""}`);
    button.type = "button";
    button.dataset.status = planStatus;
    button.append(row("plan-name", [el("span", "plan-dot"), el("span", "", entry.plan?.title ?? entry.plan?.id ?? "Untitled Plan")]), el("p", "plan-meta", `${applied} / ${tasks.length} applied`), progress(percent, "bar", planStatus), row("plan-progress", [el("span", "", updatedLabel(entry.plan?.updatedAt)), el("span", "", `${percent}%`)]));
    button.addEventListener("click", () => { stateRef.activePlan = index; stateRef.activePhase = ""; stateRef.activeTask = ""; setDefaultSelection(); render(); });
    return button;
  }));
}

function renderHeader() {
  const plan = currentPlan().plan ?? {};
  setText("#gqo-title", plan.title ?? "Plans, phases, and tasks");
  setText("#gqo-subtitle", plan.summary ?? "Read-only progress view generated from plan.json and tasks.json.");
}

function renderSummary() {
  const tasks = currentTasks();
  const applied = countStatus(tasks, "applied");
  setText("#gqo-progress-label", `${applied} / ${tasks.length} applied`);
  setText("#gqo-progress-rate", `${percentOf(applied, tasks.length)}%`);
  $("#gqo-progress-bar").style.width = `${percentOf(applied, tasks.length)}%`;
  for (const status of STATUSES) setText(`#gqo-${status}-count`, String(countStatus(tasks, status)));
}

function renderPhases() {
  const container = $("#gqo-phases");
  const tasks = currentTasks();
  container.replaceChildren(...currentPhases().map((phase, index) => {
    const phaseTasks = tasks.filter((task) => task.phaseId === phase.id);
    const applied = countStatus(phaseTasks, "applied");
    const running = countStatus(phaseTasks, "running");
    const phaseStatus = planStatusOf(phaseTasks);
    const card = el("article", `phase-card${phase.id === stateRef.activePhase ? " is-active" : ""}`);
    card.dataset.status = phaseStatus;
    card.append(row("phase-top", [el("span", "chevron", phase.id === stateRef.activePhase ? "⌄" : "›"), el("span", "phase-title", `${index + 1}. ${phase.title ?? phase.id}`), el("span", "phase-rate", phaseRate(applied, running, phaseTasks.length))]), el("p", "phase-summary", phase.summary ?? "No phase summary recorded."), progress(percentOf(applied, phaseTasks.length), "bar", phaseStatus));
    if (phase.id === stateRef.activePhase) card.append(renderMiniTasks(phaseTasks));
    card.addEventListener("click", () => { const isOpen = stateRef.activePhase === phase.id; stateRef.activePhase = isOpen ? "" : phase.id; stateRef.activeTask = isOpen ? "" : phaseTasks[0]?.id ?? ""; render(); });
    return card;
  }));
}

function renderMiniTasks(tasks) {
  const wrap = el("div", "phase-preview");
  wrap.append(...tasks.map((task) => row("mini-task", [statusDot(task.status), el("strong", "", task.title ?? task.id), statusPill(task.status)])));
  return wrap;
}

function renderTasks() {
  const tasks = currentTasks().filter((task) => task.phaseId === stateRef.activePhase);
  setText("#gqo-task-heading", stateRef.activePhase ? `Tasks in ${currentPhase()?.title ?? "selected phase"}` : "Tasks");
  setText("#gqo-task-count", String(tasks.length));
  $("#gqo-tasks").replaceChildren(...tasks.map((task) => {
    const item = row(`task-row task-item${task.id === stateRef.activeTask ? " is-selected" : ""}`, [statusDot(task.status), el("span", "task-title", task.title ?? task.id), el("span", "task-updated", updatedLabel(task.updatedAt))]);
    item.addEventListener("click", () => { stateRef.activeTask = task.id; renderTasks(); renderDetail(); });
    return item;
  }));
}

function renderDetail() {
  const task = currentTasks().find((candidate) => candidate.id === stateRef.activeTask);
  const box = $("#gqo-detail");
  if (!task) { box.replaceChildren(el("div", "empty-state", "Select a task to inspect details.")); return; }
  box.replaceChildren(el("article", "detail-card", [row("detail-head", [el("h2", "", task.title ?? task.id), statusPill(task.status)]), el("p", "detail-summary", task.summary ?? "No task summary recorded."), detailLine("Phase", [currentPhase()?.title ?? task.phaseId]), detailLine("Source Documents", task.sourceDocs), detailLine("Target Files", task.targetFiles), evidenceBlock(task.evidence), detailLine("Related Visual Review", task.sourceReviewRequests)]));
}

function evidenceBlock(evidence = {}) {
  const rows = [["Changed files", evidence.changedFiles?.length ?? 0], ["Verification", evidence.verification?.[0] ?? "Not recorded"], ["Manual QA", evidence.manualQa?.[0] ?? "Not recorded"]];
  return section("Evidence", rows.map(([label, value]) => row("evidence-row", [el("span", "", label), el("strong", "", String(value))])));
}

function detailLine(title, values = []) {
  const list = Array.isArray(values) ? values : [values];
  return section(title, [el("div", "link-list", list.length ? list.map((value) => el("span", "", String(value))) : [el("span", "", "Not recorded")])]);
}

function currentPlan() { return stateRef.plans[stateRef.activePlan] ?? {}; }
function currentPhases() { return [...(currentPlan().taskState?.phases ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); }
function currentTasks() { return currentPlan().taskState?.tasks ?? []; }
function currentPhase() { return currentPhases().find((phase) => phase.id === stateRef.activePhase); }
function countStatus(tasks, status) { return tasks.filter((task) => task.status === status).length; }
function normalizePlans(plans) {
  return plans.map((entry) => ({
    ...entry,
    taskState: {
      ...(entry.taskState ?? {}),
      phases: Array.isArray(entry.taskState?.phases) ? entry.taskState.phases : [],
      tasks: Array.isArray(entry.taskState?.tasks) ? entry.taskState.tasks.map(normalizeTask) : [],
    },
  }));
}
function normalizeTask(task) { return { ...task, status: statusOf(task.status) }; }
function statusOf(value = "saved") {
  const key = String(value).trim().toLowerCase();
  return STATUSES.includes(key) ? key : STATUS_ALIASES.get(key) ?? "saved";
}
function planStatusOf(tasks) {
  if (tasks.length === 0) return "not-started";
  if (tasks.some((task) => task.status === "failed" || task.status === "stashed")) return "blocked";
  if (tasks.some((task) => task.status === "running")) return "running";
  if (tasks.some((task) => task.status === "applied")) return "complete";
  return "not-started";
}
function percentOf(value, total) { return total > 0 ? Math.round((value / total) * 100) : 0; }
function phaseRate(applied, running, total) { return running > 0 ? `${applied} / ${total} applied · running ${running}` : `${applied} / ${total} applied`; }
function updatedLabel(value) { return value ? "Updated recently" : "Updated unknown"; }
function setText(selector, value) { const node = $(selector); if (node) node.textContent = value; }
function progress(percent, className, status = "") { const node = el("div", className); if (status) node.dataset.status = status; const bar = el("i"); bar.style.width = `${percent}%`; node.append(bar); return node; }
function statusDot(status = "saved") { const node = el("span", "status-dot"); node.dataset.status = status; return node; }
function statusPill(status = "saved") { const node = el("span", "status-pill", status); node.dataset.status = status; return node; }
function section(title, children) { return el("section", "detail-section", [el("h3", "", title), ...children]); }
function row(className, children) { return el("div", className, children); }
function el(tag, className = "", content = "") { const node = document.createElement(tag); if (className) node.className = className; if (Array.isArray(content)) node.append(...content); else if (content) node.textContent = content; return node; }
