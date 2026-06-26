/**
 * project-bar.js — споделена проект-лента за всички инструментални страници.
 *
 * Използване:
 *   import { initProjectBar } from "./project-bar.js";
 *   const bar = initProjectBar(document.getElementById("project-bar-root"), {
 *     onChange: (project) => renderMyPage(project),
 *   });
 *   // При нужда: bar.refresh();
 */

import {
  getProjects, getCurrentProject,
  createProject, switchProject, setProjectName, deleteProject,
} from "./project-store.js";

const BAR_STYLE = `
  background:#f0f4ff;border-bottom:1px solid #c7d2fe;
  padding:8px 16px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;
`;
const LABEL_STYLE  = "font-size:13px;font-weight:700;color:#3730a3;white-space:nowrap;";
const SELECT_STYLE = `
  padding:5px 10px;border:1px solid #a5b4fc;border-radius:7px;
  font-size:13px;background:#fff;color:#1f2a37;cursor:pointer;max-width:260px;
`;
const BTN_STYLE = `
  padding:5px 12px;border-radius:7px;border:1px solid #a5b4fc;
  font-size:12px;font-weight:700;cursor:pointer;background:#fff;color:#3730a3;white-space:nowrap;
`;
const COUNT_STYLE = "font-size:12px;color:#6366f1;font-weight:700;margin-left:4px;";
const DEL_STYLE   = `
  padding:4px 9px;border-radius:7px;border:1px solid #fca5a5;
  font-size:12px;font-weight:700;cursor:pointer;background:#fff;color:#dc2626;white-space:nowrap;
`;

function esc(s) {
  return (s ?? "").toString().replace(/[&<>"]/g, c =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);
}

export function initProjectBar(containerEl, { onChange } = {}) {
  containerEl.style.cssText = BAR_STYLE;

  containerEl.innerHTML = `
    <label style="${LABEL_STYLE}">Проект:</label>
    <select id="pb-select" style="${SELECT_STYLE}"></select>
    <button id="pb-rename" style="${BTN_STYLE}" title="Преименувай проекта">✏ Преименувай</button>
    <button id="pb-new"    style="${BTN_STYLE}">+ Нов проект</button>
    <button id="pb-delete" style="${DEL_STYLE}" title="Изтрий проекта">🗑</button>
    <span id="pb-count" style="${COUNT_STYLE}"></span>
  `;

  const sel    = containerEl.querySelector("#pb-select");
  const count  = containerEl.querySelector("#pb-count");
  const btnNew = containerEl.querySelector("#pb-new");
  const btnRen = containerEl.querySelector("#pb-rename");
  const btnDel = containerEl.querySelector("#pb-delete");

  function refresh() {
    const projects = getProjects();
    const current  = getCurrentProject();

    if (!projects.length) {
      sel.innerHTML = `<option value="">— няма проекти —</option>`;
      btnDel.disabled = true;
      count.textContent = "";
    } else {
      sel.innerHTML = projects.map(p =>
        `<option value="${esc(p.id)}" ${p.id === current?.id ? "selected" : ""}>${esc(p.name || "Без име")}</option>`
      ).join("");
      btnDel.disabled = projects.length <= 1;
      count.textContent = current?.items?.length ? `· ${current.items.length} позиции` : "";
    }
  }

  sel.addEventListener("change", () => {
    const proj = switchProject(sel.value);
    refresh();
    onChange?.(proj);
  });

  btnNew.addEventListener("click", () => {
    const name = prompt("Наименование на новия проект:");
    if (name === null) return;
    const proj = createProject(name.trim() || "Нов проект");
    refresh();
    onChange?.(proj);
  });

  btnRen.addEventListener("click", () => {
    const current = getCurrentProject();
    if (!current) return;
    const name = prompt("Ново наименование:", current.name || "");
    if (name === null || !name.trim()) return;
    setProjectName(name.trim());
    refresh();
    onChange?.(getCurrentProject());
  });

  btnDel.addEventListener("click", () => {
    const current = getCurrentProject();
    if (!current) return;
    if (!confirm(`Да изтрия ли проект „${current.name}"?\nВсички позиции ще бъдат изтрити.`)) return;
    deleteProject(current.id);
    refresh();
    onChange?.(getCurrentProject());
  });

  // Ако няма нито един проект, създай автоматично
  if (!getProjects().length) createProject("Проект 1");
  refresh();

  return { refresh };
}
