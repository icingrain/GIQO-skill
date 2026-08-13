(function () {
  const params = new URLSearchParams(location.search);
  const statuses = ["saved", "running", "applied", "failed"];
  const labels = { saved: "Saved", running: "In progress", applied: "Applied", failed: "Failed" };
  const key = `gqo-comments:${location.pathname}`;
  const state = { targetIds: [], editingId: "", filter: "all", collapsed: false, items: load() };

  function byId(id) { return document.getElementById(id); }
  function page() { return location.pathname.split("/").pop() || "review.html"; }
  function status(value) { if (["running", "applied", "failed"].includes(value)) return value; if (["blocked", "rejected"].includes(value)) return "failed"; if (value === "verified") return "applied"; return "saved"; }
  function normalize(items) { return Array.isArray(items) ? items.map((item) => ({ ...item, status: status(item.status), targetIds: targetIds(item) })) : []; }
  function load() { try { return normalize(JSON.parse(localStorage.getItem(key) || "[]")); } catch { return []; } }
  function writeStorage() { try { localStorage.setItem(key, JSON.stringify(state.items)); } catch {} }
  function safe(text) { return String(text || "").replaceAll("`", "\\`").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
  function attr(text) { return safe(text).replaceAll("&", "&amp;").replaceAll('"', "&quot;"); }
  function actualUrl() { try { const url = new URL(params.get("actual") || ""); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } }
  function targetIds(item) { const ids = Array.isArray(item?.targetIds) ? item.targetIds : [item?.targetId]; return [...new Set(ids.filter(Boolean))]; }
  function primaryTarget(ids) { return ids[0] || "global"; }
  function targetElement(id) { return id === "global" ? document.body : document.querySelector(`[data-gqo-id="${CSS.escape(id)}"]`); }
  function visible(element) { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.right >= 0 && rect.top <= innerHeight && rect.left <= innerWidth && style.visibility !== "hidden" && style.display !== "none"; }
  function targetText(element) { const clone = element?.cloneNode(true); clone?.querySelectorAll?.(".gqo-comment-pin").forEach((pin) => pin.remove()); return (clone?.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160); }
  function readableId(id) { const last = String(id || "").split(/[.#]/).filter(Boolean).pop() || id; return String(last || "Target").replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()); }
  function conciseText(element) { const text = targetText(element); return text.length >= 2 && text.length <= 24 && !/[.!?。]\s/.test(text) ? text : ""; }
  function inferName(element, id) {
    if (!element || id === "global") return "Global";
    const explicit = element.getAttribute("aria-label") || element.getAttribute("title") || conciseText(element) || readableId(id);
    const role = element.getAttribute("role") || element.tagName.toLowerCase();
    return `${String(explicit || id).trim().replace(/\s+/g, " ").slice(0, 64)} · ${role}`;
  }
  function scopeFor(id) { return id === "global" ? "global" : targetElement(id)?.getAttribute("data-gqo-scope") || "element"; }
  function targetRecord(id) {
    const element = targetElement(id); const rect = element?.getBoundingClientRect();
    return { id, label: inferName(element, id), scope: scopeFor(id), editable: element?.getAttribute("data-gqo-editable") || "", text: id === "global" ? "" : targetText(element), bounds: rect ? { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) } : null };
  }
  function targets() {
    const records = [...document.querySelectorAll("[data-gqo-id]")].filter(visible).map((element) => targetRecord(element.getAttribute("data-gqo-id") || "")).filter((target) => target.id);
    return [targetRecord("global")].concat(records);
  }
  function targetLabel(id) { return targetRecord(id).label; }
  function targetSummary(ids) { return ids.map(targetLabel).join(" | "); }
  function compactTargetText(ids) { const first = targetLabel(ids[0] || "global"); return ids.length > 1 ? `${first} +${ids.length - 1}` : first; }
  function renderTargetChips(container, ids, removable = true) { container.textContent = ""; for (const id of ids) { const chip = document.createElement("span"); chip.className = "gqo-target-chip"; const text = document.createElement("span"); text.textContent = targetRecord(id).label; chip.append(text); if (removable) { const remove = document.createElement("button"); remove.type = "button"; remove.className = "gqo-target-chip-remove"; remove.textContent = "×"; remove.setAttribute("aria-label", `Remove ${targetRecord(id).label}`); remove.addEventListener("click", () => updateTargetSelection(state.targetIds.filter((targetId) => targetId !== id))); chip.append(remove); } container.append(chip); } }
  function selectedTargets() { return [...document.querySelectorAll("#gqo-target-menu input:checked")].map((input) => input.value); }
  function setSelectedTargets(ids) { for (const input of document.querySelectorAll("#gqo-target-menu input")) input.checked = ids.includes(input.value); updateTargetButton(ids); }
  function updateTargetButton(ids) { byId("gqo-target-button").textContent = compactTargetText(ids.length ? ids : ["global"]); }
  function updateStatusButton() { byId("gqo-status-button").textContent = state.filter === "all" ? "All" : labels[state.filter]; }
  function filteredItems() { return state.filter === "all" ? state.items : state.items.filter((item) => item.status === state.filter); }
  function select(value, id) { const element = document.createElement("select"); if (id) element.id = id; for (const itemStatus of statuses) element.append(new Option(labels[itemStatus], itemStatus, false, itemStatus === value)); return element; }
  function badge(value) { const span = document.createElement("span"); span.className = `gqo-status gqo-status-${status(value)}`; span.textContent = labels[status(value)]; return span; }
  function changeRequests() { return state.items.filter((item) => item.type === "change-request"); }
  function requestFrom(item) {
    const ids = targetIds(item); const now = new Date().toISOString();
    return { id: item.id.replace(/^comment-/, "change-"), sourceCommentId: item.id, targetId: primaryTarget(ids), targetIds: ids, targetLabels: ids.map((id) => targetRecord(id).label), targetSummary: targetSummary(ids), page: item.page, scope: ids.length > 1 ? "multi-target" : item.scope || scopeFor(primaryTarget(ids)), requestedChange: item.comment, rationale: item.rationale || "Captured from visual review edit request.", acceptanceSignal: item.acceptanceSignal || "Updated UI matches the requested visual review change.", priority: item.severity, status: status(item.status), createdAt: item.createdAt, createdBy: "visual-review", savedAt: item.savedAt || now, savedBy: "visual-review", checks: { workStart: { targetConfirmed: true, requestActionable: true, scopeConfirmed: true, acceptanceSignalDefined: true, dependenciesRecorded: false }, completion: { artifactUpdated: false, acceptanceSignalObserved: false, documentsAligned: false, openQuestionsPreserved: true, changedArtifactsRecorded: false } } };
  }
  function markdown() {
    const lines = ["# Visual Review Annotation Prompt", "", "Use these saved annotations as implementation input. Preserve unresolved items and update status only after work is verified.", ""];
    for (const item of state.items) {
      const ids = targetIds(item);
      lines.push(`## ${targetSummary(ids)}`, "", `- Request ID: ${item.id}`, `- Targets: ${ids.join(", ")}`, `- Type: ${item.type}`, `- Severity: ${item.severity}`, `- Scope: ${ids.length > 1 ? "multi-target" : item.scope || scopeFor(primaryTarget(ids))}`, `- Status: ${status(item.status)}`, `- Page: ${item.page}`, `- Created: ${item.createdAt}`, "", "### Requested change", "", safe(item.comment), "", "### Apply prompt", "", `Apply this UI change to ${ids.length > 1 ? "all listed targets" : "the listed target"}. Keep visual behavior outside the selected targets unchanged.`, "");
    }
    return lines.join("\n");
  }
  function syncPayload() { return { schema: "gqo.visual-review-state.v1", source: page(), actual: actualUrl(), savedAt: new Date().toISOString(), targets: targets(), comments: state.items, changeRequests: { schema: "gqo.change-requests.v1", source: page(), actual: actualUrl(), exportedAt: new Date().toISOString(), requests: changeRequests().map(requestFrom) }, markdown: markdown() }; }
  function syncWorkspace() { writeStorage(); fetch("/__gqo/save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(syncPayload()) }).catch(() => {}); }
  function refreshWorkspace() { fetch(`/__gqo/state?t=${Date.now()}`, { cache: "no-store" }).then((response) => response.ok ? response.json() : {}).then((payload) => { if (Array.isArray(payload.comments)) { state.items = normalize(payload.comments); writeStorage(); render(); } }).catch(() => { state.items = load(); render(); }); }

  function createShell() {
    const toolbar = document.createElement("div"); toolbar.className = "gqo-toolbar";
    const actual = actualUrl();
    toolbar.innerHTML = `<div class="gqo-toolbar-title"><strong>GIQO Visual Review</strong>${actual ? ` <a href="${attr(actual)}" target="_blank" rel="noreferrer">Actual screen</a>` : ""}<span id="gqo-sync">Auto-save ready</span><span id="gqo-counts"></span></div><div class="gqo-toolbar-controls"><label class="gqo-picker-label">Status <span class="gqo-picker"><button id="gqo-status-button" type="button" aria-expanded="false">All</button><div id="gqo-status-menu" class="gqo-picker-menu" hidden></div></span></label><label class="gqo-target-picker-label">Target <span class="gqo-target-picker"><button id="gqo-target-button" type="button" aria-expanded="false">All</button><div id="gqo-target-menu" class="gqo-target-menu" hidden></div></span></label><span class="gqo-toolbar-actions"><button id="gqo-refresh" type="button">Refresh</button><button id="gqo-toggle" type="button" aria-expanded="true">Hide feedback</button></span></div>`;
    document.body.prepend(toolbar); refreshStatusOptions();
    const panel = document.createElement("aside"); panel.className = "gqo-panel"; panel.hidden = true;
    panel.innerHTML = `<strong id="gqo-panel-title">GIQO edit request</strong><div id="gqo-target-label" class="gqo-target-chips"></div><label>Severity<select id="gqo-severity"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label>Request<textarea id="gqo-comment" placeholder="Write one requested UI change for the selected target(s)"></textarea></label><div class="gqo-panel-actions"><button id="gqo-cancel" type="button">Cancel</button><button id="gqo-save" type="button">Save</button></div>`;
    document.body.append(panel);
    const list = document.createElement("aside"); list.className = "gqo-comment-list"; list.innerHTML = `<div class="gqo-comment-list-header"><strong>Saved feedback</strong><button id="gqo-list-toggle" type="button" aria-expanded="true">Minimize</button></div><div id="gqo-comments"></div>`; document.body.append(list);
    refreshTargetOptions(); return panel;
  }
  function refreshTargetOptions() { const menu = byId("gqo-target-menu"); const selected = selectedTargets(); menu.textContent = ""; for (const target of targets()) { const label = document.createElement("label"); label.className = "gqo-target-option"; const input = document.createElement("input"); input.type = "checkbox"; input.value = target.id; input.checked = selected.includes(target.id); input.addEventListener("change", () => updateTargetSelection(selectedTargets())); const text = document.createElement("span"); text.textContent = target.label; label.append(input, text); menu.append(label); } updateTargetButton(selected); }
  function refreshStatusOptions() { const menu = byId("gqo-status-menu"); menu.textContent = ""; for (const option of ["all"].concat(statuses)) { const label = document.createElement("label"); label.className = "gqo-target-option"; const input = document.createElement("input"); input.type = "radio"; input.name = "gqo-status-filter"; input.value = option; input.checked = state.filter === option; input.addEventListener("change", () => { state.filter = option; updateStatusButton(); byId("gqo-status-menu").hidden = true; byId("gqo-status-button").setAttribute("aria-expanded", "false"); render(); }); const text = document.createElement("span"); text.textContent = option === "all" ? "All" : labels[option]; label.append(input, text); menu.append(label); } updateStatusButton(); }
  function updateTargetSelection(ids) { state.targetIds = [...new Set(ids.filter(Boolean))]; setSelectedTargets(state.targetIds); renderTargetChips(byId("gqo-target-label"), state.targetIds); render(); }
  function openPanel(panel, ids, item) {
    state.targetIds = targetIds(item || { targetIds: Array.isArray(ids) ? ids : [ids] }); state.editingId = item?.id || "";
    byId("gqo-panel-title").textContent = item ? "Edit saved request" : "GIQO edit request"; renderTargetChips(byId("gqo-target-label"), state.targetIds); setSelectedTargets(state.targetIds);
    byId("gqo-severity").value = item?.severity || "low"; byId("gqo-comment").value = item?.comment || ""; panel.hidden = false; render(); byId("gqo-comment").focus();
  }
  function savePanel(panel) {
    const ids = selectedTargets(); const comment = byId("gqo-comment").value.trim(); if (!ids.length || !comment) return;
    const now = new Date().toISOString(); const previous = state.items.find((item) => item.id === state.editingId);
    const next = { id: state.editingId || `comment-${Date.now()}`, targetId: primaryTarget(ids), targetIds: ids, targetLabels: ids.map((id) => targetRecord(id).label), page: page(), mode: "edit", scope: ids.length > 1 ? "multi-target" : scopeFor(primaryTarget(ids)), type: "change-request", severity: byId("gqo-severity").value, comment, createdAt: previous?.createdAt || now, savedAt: now, status: previous?.status || "saved" };
    state.items = previous ? state.items.map((item) => item.id === state.editingId ? next : item) : state.items.concat(next); state.editingId = ""; state.targetIds = ids; panel.hidden = true; syncWorkspace(); render();
  }
  function editItem(panel, id) { const item = state.items.find((entry) => entry.id === id); if (item) openPanel(panel, targetIds(item), item); }
  function deleteItem(id) { state.items = state.items.filter((item) => item.id !== id); if (state.editingId === id) state.editingId = ""; syncWorkspace(); render(); }
  function renderCounts() { const counts = Object.fromEntries(statuses.map((itemStatus) => [itemStatus, state.items.filter((item) => item.status === itemStatus).length])); byId("gqo-counts").textContent = statuses.map((itemStatus) => `${labels[itemStatus]} ${counts[itemStatus]}`).join(" · "); }
  function renderPins() {
    document.querySelectorAll(".gqo-comment-pin").forEach((pin) => pin.remove()); const counts = new Map();
    for (const item of filteredItems()) for (const id of targetIds(item).filter((targetId) => targetId !== "global")) counts.set(id, (counts.get(id) || 0) + 1);
    for (const [id, count] of counts) { const target = targetElement(id); if (!target) continue; const pin = document.createElement("span"); pin.className = "gqo-comment-pin"; pin.role = "button"; pin.tabIndex = 0; pin.textContent = String(count); pin.title = `${count} matching request(s)`; pin.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); openPanel(document.querySelector(".gqo-panel"), [id]); }); pin.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") pin.click(); }); target.append(pin); }
  }
  function renderList() {
    const box = byId("gqo-comments"); box.textContent = ""; const items = filteredItems(); if (!items.length) { const empty = document.createElement("p"); empty.className = "gqo-empty"; empty.textContent = state.filter === "all" ? "No saved edit requests." : "No saved requests match this status."; box.append(empty); }
    for (const item of items) { const ids = targetIds(item); const card = document.createElement("article"); card.className = "gqo-list-item"; const title = document.createElement("div"); title.className = "gqo-list-targets"; if (ids.length > 1) { const picker = document.createElement("div"); picker.className = "gqo-saved-target-picker"; const button = document.createElement("button"); button.type = "button"; button.textContent = compactTargetText(ids); const menu = document.createElement("div"); menu.className = "gqo-saved-target-menu gqo-target-chips"; menu.hidden = true; renderTargetChips(menu, ids, false); button.addEventListener("click", () => { menu.hidden = !menu.hidden; }); picker.append(button, menu); title.append(picker); } else { renderTargetChips(title, ids, false); } const body = document.createElement("p"); body.textContent = item.comment; const actions = document.createElement("div"); actions.className = "gqo-list-actions"; const edit = document.createElement("button"); edit.type = "button"; edit.textContent = "Edit"; edit.addEventListener("click", () => editItem(document.querySelector(".gqo-panel"), item.id)); const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "Delete"; remove.addEventListener("click", () => deleteItem(item.id)); actions.append(edit, remove); card.append(title, body, badge(item.status), actions); box.append(card); }
  }
  function renderSelectedTargets() { document.querySelectorAll("[data-gqo-id].gqo-selected").forEach((element) => element.classList.remove("gqo-selected")); if (document.querySelector(".gqo-panel")?.hidden) return; for (const id of state.targetIds) targetElement(id)?.classList.add("gqo-selected"); }
  function render() { renderCounts(); renderPins(); renderList(); renderSelectedTargets(); document.body.dataset.gqoFeedbackCollapsed = state.collapsed ? "true" : "false"; }
  function setCollapsed(value) { state.collapsed = value; byId("gqo-toggle").textContent = value ? "Show feedback" : "Hide feedback"; byId("gqo-toggle").setAttribute("aria-expanded", String(!value)); byId("gqo-list-toggle").textContent = value ? "Show" : "Minimize"; byId("gqo-list-toggle").setAttribute("aria-expanded", String(!value)); render(); }
  function wire(panel) {
    document.querySelectorAll("[data-gqo-id]").forEach((element) => { element.addEventListener("mouseenter", () => element.classList.add("gqo-highlight")); element.addEventListener("mouseleave", () => element.classList.remove("gqo-highlight")); });
    document.addEventListener("click", (event) => { const target = event.target; if (!(target instanceof Element)) return; if (!target.closest(".gqo-target-picker")) { byId("gqo-target-menu").hidden = true; byId("gqo-target-button").setAttribute("aria-expanded", "false"); } if (!target.closest(".gqo-picker")) { byId("gqo-status-menu").hidden = true; byId("gqo-status-button").setAttribute("aria-expanded", "false"); } if (target.closest(".gqo-toolbar, .gqo-panel, .gqo-comment-list, .gqo-comment-pin")) return; const element = target.closest("[data-gqo-id]"); if (element) { event.preventDefault(); event.stopPropagation(); const id = element.getAttribute("data-gqo-id") || ""; if (panel.hidden) openPanel(panel, [id]); else updateTargetSelection(state.targetIds.includes(id) ? state.targetIds : state.targetIds.concat(id)); } });
    byId("gqo-status-button").addEventListener("click", () => { const menu = byId("gqo-status-menu"); menu.hidden = !menu.hidden; byId("gqo-status-button").setAttribute("aria-expanded", String(!menu.hidden)); }); byId("gqo-target-button").addEventListener("click", () => { const menu = byId("gqo-target-menu"); menu.hidden = !menu.hidden; byId("gqo-target-button").setAttribute("aria-expanded", String(!menu.hidden)); });
    byId("gqo-refresh").addEventListener("click", () => { refreshTargetOptions(); refreshWorkspace(); }); byId("gqo-toggle").addEventListener("click", () => setCollapsed(!state.collapsed)); byId("gqo-list-toggle").addEventListener("click", () => setCollapsed(!state.collapsed)); byId("gqo-cancel").addEventListener("click", () => { state.editingId = ""; panel.hidden = true; render(); }); byId("gqo-save").addEventListener("click", () => savePanel(panel));
  }
  function init() { const panel = createShell(); wire(panel); refreshWorkspace(); render(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
