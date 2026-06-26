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

function fmt(n) { return Number(n || 0).toLocaleString("bg-BG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function typeLabel(type) {
  return { dxf: "DXF", barcut: "Прът", paint: "Боя", calc: "Калк" }[type] || type;
}

function openProjectsModal(currentId, onSwitch) {
  const projects = getProjects();

  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:9999;
    display:flex;align-items:flex-start;justify-content:center;padding:60px 16px 16px;
  `;

  const rows = projects.map(p => {
    const total = (p.items || []).reduce((s, it) => s + (it.totalCost || 0), 0);
    const isCurrent = p.id === currentId;
    const date = p.createdAt ? new Date(p.createdAt).toLocaleDateString("bg-BG") : "—";
    const itemsSummary = (p.items || []).reduce((acc, it) => {
      const t = typeLabel(it.type);
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {});
    const itemsStr = Object.entries(itemsSummary).map(([k, v]) => `${v}×${k}`).join(", ") || "—";
    return `
      <tr data-id="${esc(p.id)}" style="cursor:pointer;${isCurrent ? "background:#eff6ff;" : ""}">
        <td style="padding:10px 12px;font-weight:${isCurrent ? "700" : "400"};color:${isCurrent ? "#1d4ed8" : "#1f2a37"}">
          ${isCurrent ? "▶ " : ""}${esc(p.name || "Без име")}
        </td>
        <td style="padding:10px 12px;font-size:12px;color:#6b7280">${itemsStr}</td>
        <td style="padding:10px 12px;text-align:right;font-family:monospace;font-size:13px;color:#6b7280">${date}</td>
        <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:14px;color:${total > 0 ? "#1d4ed8" : "#9ca3af"}">
          ${total > 0 ? fmt(total) + " лв" : "—"}
        </td>
      </tr>`;
  }).join("");

  overlay.innerHTML = `
    <div style="background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.2);width:100%;max-width:700px;overflow:hidden">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #e5e7eb;">
        <h2 style="margin:0;font-size:17px;color:#1f2a37">📋 Всички проекти</h2>
        <button id="pb-modal-close" style="background:none;border:none;font-size:22px;cursor:pointer;color:#6b7280;line-height:1;padding:2px 6px">✕</button>
      </div>
      <div style="overflow-y:auto;max-height:60vh">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#f8fafc">
              <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em">Проект</th>
              <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em">Позиции</th>
              <th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em">Създаден</th>
              <th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em">Обща сума</th>
            </tr>
          </thead>
          <tbody id="pb-modal-tbody" style="border-top:1px solid #e5e7eb">${rows}</tbody>
        </table>
        ${!projects.length ? `<p style="text-align:center;color:#9ca3af;padding:32px">Няма проекти</p>` : ""}
      </div>
      <div style="padding:12px 20px;border-top:1px solid #e5e7eb;background:#f8fafc;font-size:12px;color:#9ca3af">
        Кликни върху ред за да отвориш проекта
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector("#pb-modal-close").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector("#pb-modal-tbody").addEventListener("click", e => {
    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;
    onSwitch(tr.dataset.id);
    overlay.remove();
  });
}

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
    <button id="pb-list"   style="${BTN_STYLE};margin-left:4px">📋 Всички проекти</button>
    <span id="pb-count" style="${COUNT_STYLE}"></span>
  `;

  const sel    = containerEl.querySelector("#pb-select");
  const count  = containerEl.querySelector("#pb-count");
  const btnNew = containerEl.querySelector("#pb-new");
  const btnRen = containerEl.querySelector("#pb-rename");
  const btnDel = containerEl.querySelector("#pb-delete");
  const btnList = containerEl.querySelector("#pb-list");

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

  btnList.addEventListener("click", () => {
    const current = getCurrentProject();
    openProjectsModal(current?.id, (id) => {
      switchProject(id);
      refresh();
      onChange?.(getCurrentProject());
    });
  });

  // Ако няма нито един проект, създай автоматично
  if (!getProjects().length) createProject("Проект 1");
  refresh();

  return { refresh };
}
