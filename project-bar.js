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

function fmt(n) {
  if (n == null) return "—";
  const num = Number(n);
  return isNaN(num) ? "—" : num.toLocaleString("bg-BG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(s) {
  return (s ?? "").toString().replace(/[&<>"]/g, c =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);
}

function typeLabel(type) {
  return { dxf: "DXF", barcut: "Прът", paint: "Боя", calc: "Калк" }[type] || type;
}

// ---- PDF генерация ----
function generateProjectPDF(p) {
  const items = p?.items || [];
  const date = new Date().toLocaleDateString("bg-BG");
  const grand = items.reduce((s, it) => s + (it.totalCost || 0), 0);
  const projName = p.name || "Производствена калкулация";

  const rows = items.map(item => {
    let thumb, subLine, qtyCol, unitCol;
    if (item.type === "dxf") {
      thumb   = item.png
        ? `<img src="${item.png}" style="width:48pt;height:36pt;object-fit:contain;border:1px solid #e5e7eb;border-radius:4pt;display:block"/>`
        : `<div style="width:48pt;height:36pt;display:flex;align-items:center;justify-content:center;border:1px solid #e5e7eb;border-radius:4pt;font-size:22pt">📐</div>`;
      subLine = `${esc(item.calc?.matName || "")}, ${item.calc?.thickness || ""} мм · разрез ${fmt(item.geo?.cut_length_mm)} мм · ${item.geo?.pierces || 0} проб.`;
      qtyCol  = item.qty;
      unitCol = `${fmt(item.unitCost)} лв`;
    } else if (item.type === "barcut") {
      thumb   = `<div style="width:48pt;height:36pt;display:flex;align-items:center;justify-content:center;border:1px solid #e5e7eb;border-radius:4pt;font-size:22pt">🔩</div>`;
      subLine = `${item.bars} пр. × ${item.barLenM} м · kerf ${item.kerf} мм`;
      qtyCol  = item.bars;
      unitCol = `${fmt(item.pricePerBar)} лв/пр.`;
    } else if (item.type === "calc") {
      thumb   = `<div style="width:48pt;height:36pt;display:flex;align-items:center;justify-content:center;border:1px solid #e5e7eb;border-radius:4pt;font-size:22pt">🔧</div>`;
      const purPart = item.pur > 0 ? ` · покупни ${fmt(item.pur)} лв` : "";
      subLine = `мат. ${fmt(item.mat)} лв · труд ${fmt(item.op)} лв${purPart}`;
      qtyCol  = item.qty;
      unitCol = `${fmt(item.totalEUR)} €/бр.`;
    } else {
      thumb   = `<div style="width:48pt;height:36pt;display:flex;align-items:center;justify-content:center;border:1px solid #e5e7eb;border-radius:4pt;font-size:22pt">🎨</div>`;
      subLine = `${esc(item.coatName || "")}${item.color ? ", " + esc(item.color) : ""} · ${fmt(item.totalArea)} м²`;
      qtyCol  = `${fmt(item.totalArea)} м²`;
      unitCol = `${fmt(item.rateM2)} лв/м²`;
    }
    return `<tr>
      <td style="width:52pt;padding:4pt 8pt">${thumb}</td>
      <td style="padding:4pt 8pt">
        <b>${esc(item.name)}</b>${item.notes ? `<br><span style="color:#6b7280;font-size:8.5pt">${esc(item.notes)}</span>` : ""}
        <br><span style="font-size:8.5pt;color:#6b7280">${subLine}</span>
      </td>
      <td style="padding:4pt 8pt;text-align:center">${qtyCol}</td>
      <td style="padding:4pt 8pt;text-align:right">${unitCol}</td>
      <td style="padding:4pt 8pt;text-align:right;font-weight:700">${fmt(item.totalCost)} лв</td>
    </tr>`;
  }).join("");

  const emptyMsg = !items.length
    ? `<tr><td colspan="5" style="padding:24pt;text-align:center;color:#9ca3af">Проектът няма позиции</td></tr>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="bg"><head>
<meta charset="UTF-8"/>
<title>${esc(projName)} — ${date}</title>
<style>
  @page { size: A4; margin: 14mm 14mm 16mm 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Segoe UI", Roboto, Arial, sans-serif; font-size: 10pt; color: #1f2a37; }
  .hdr { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:3px solid #1F3864; padding-bottom:10px; margin-bottom:18px; }
  .brand { font-size:20pt; font-weight:800; color:#1F3864; }
  .proj-title { font-size:12pt; font-weight:700; color:#1F3864; margin-top:3px; }
  .sub { font-size:9pt; color:#6b7280; margin-top:2px; }
  .meta { text-align:right; font-size:9pt; color:#6b7280; line-height:1.7; }
  table { width:100%; border-collapse:collapse; }
  thead tr { background:#1F3864; color:#fff; }
  thead th { padding:6pt 8pt; text-align:left; font-size:9pt; }
  thead th:nth-child(3),thead th:nth-child(4),thead th:nth-child(5) { text-align:right; }
  tbody tr { border-bottom:1px solid #f3f4f6; }
  tbody tr:nth-child(even) { background:#f8fafc; }
  .total-row td { background:#eff6ff; font-weight:800; font-size:11pt; color:#1d4ed8; padding:7pt 8pt; border-top:2px solid #bfdbfe; }
  .total-row td:last-child { text-align:right; }
  .footer { margin-top:20pt; border-top:1px solid #e5e7eb; padding-top:7pt; font-size:8pt; color:#9ca3af; display:flex; justify-content:space-between; }
</style>
</head><body>
  <div class="hdr">
    <div>
      <div class="brand">DankoSystems</div>
      <div class="proj-title">${esc(projName)}</div>
      <div class="sub">Производствена калкулация</div>
    </div>
    <div class="meta">Дата: ${date}<br>Позиции: ${items.length}</div>
  </div>
  <table>
    <thead><tr>
      <th style="width:52pt"></th>
      <th>Позиция</th>
      <th style="text-align:right">Бр.</th>
      <th style="text-align:right">Ед. цена</th>
      <th style="text-align:right">Общо (лв)</th>
    </tr></thead>
    <tbody>
      ${rows}${emptyMsg}
      <tr class="total-row">
        <td colspan="4">ОБЩО</td>
        <td>${fmt(Math.round(grand * 100) / 100)} лв</td>
      </tr>
    </tbody>
  </table>
  <div class="footer">
    <span>DankoSystems · ${esc(projName)}</span>
    <span>${date}</span>
  </div>
  <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}<\/script>
</body></html>`;

  const win = window.open("", "_blank");
  if (win) { win.document.write(html); win.document.close(); }
}

// ---- Сваляне на проект като JSON файл ----
function downloadProjectJSON(p) {
  const blob = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = (p.name || "проект").replace(/[^а-яА-Яa-zA-Z0-9_\- ]/g, "").trim() || "проект";
  a.href = url;
  a.download = `${safeName}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- Модал "Всички проекти" ----
function openProjectsModal(currentId, onSwitch) {
  const projects = getProjects();

  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:9999;
    display:flex;align-items:flex-start;justify-content:center;padding:60px 16px 16px;
  `;

  const ACT_BTN = `padding:4px 10px;border-radius:6px;border:1px solid #a5b4fc;font-size:11px;font-weight:700;cursor:pointer;background:#fff;color:#3730a3;white-space:nowrap;`;
  const DL_BTN  = `padding:4px 10px;border-radius:6px;border:1px solid #d1d5db;font-size:11px;font-weight:700;cursor:pointer;background:#fff;color:#374151;white-space:nowrap;`;

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
    const hasItems = (p.items || []).length > 0;

    return `
      <tr data-id="${esc(p.id)}" style="${isCurrent ? "background:#eff6ff;" : ""}">
        <td style="padding:10px 12px;font-weight:${isCurrent ? "700" : "400"};color:${isCurrent ? "#1d4ed8" : "#1f2a37"}">
          ${isCurrent ? "▶ " : ""}${esc(p.name || "Без име")}
        </td>
        <td style="padding:10px 12px;font-size:12px;color:#6b7280">${itemsStr}</td>
        <td style="padding:10px 12px;text-align:right;font-family:monospace;font-size:13px;color:#6b7280">${date}</td>
        <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:14px;color:${total > 0 ? "#1d4ed8" : "#9ca3af"}">
          ${total > 0 ? fmt(total) + " лв" : "—"}
        </td>
        <td style="padding:6px 12px;white-space:nowrap;text-align:right">
          <button class="pb-open-btn" data-id="${esc(p.id)}" style="${ACT_BTN}">Отвори</button>
          <button class="pb-pdf-btn" data-id="${esc(p.id)}" style="${ACT_BTN};margin-left:4px;${!hasItems ? "opacity:.45;cursor:not-allowed;" : ""}" ${!hasItems ? "disabled" : ""}>📄 PDF</button>
          <button class="pb-dl-btn" data-id="${esc(p.id)}" style="${DL_BTN};margin-left:4px">⬇ Файл</button>
        </td>
      </tr>`;
  }).join("");

  overlay.innerHTML = `
    <div style="background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.2);width:100%;max-width:820px;overflow:hidden">
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
              <th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em">Действия</th>
            </tr>
          </thead>
          <tbody id="pb-modal-tbody" style="border-top:1px solid #e5e7eb">${rows}</tbody>
        </table>
        ${!projects.length ? `<p style="text-align:center;color:#9ca3af;padding:32px">Няма проекти</p>` : ""}
      </div>
      <div style="padding:12px 20px;border-top:1px solid #e5e7eb;background:#f8fafc;font-size:12px;color:#9ca3af">
        📄 PDF — отваря за печат &nbsp;|&nbsp; ⬇ Файл — сваля като JSON &nbsp;|&nbsp; Отвори — превключва към проекта
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector("#pb-modal-close").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector("#pb-modal-tbody").addEventListener("click", e => {
    // PDF бутон
    const pdfBtn = e.target.closest(".pb-pdf-btn");
    if (pdfBtn && !pdfBtn.disabled) {
      const proj = getProjects().find(p => p.id === pdfBtn.dataset.id);
      if (proj) generateProjectPDF(proj);
      return;
    }
    // Свали файл бутон
    const dlBtn = e.target.closest(".pb-dl-btn");
    if (dlBtn) {
      const proj = getProjects().find(p => p.id === dlBtn.dataset.id);
      if (proj) downloadProjectJSON(proj);
      return;
    }
    // Отвори бутон
    const openBtn = e.target.closest(".pb-open-btn");
    if (openBtn) {
      onSwitch(openBtn.dataset.id);
      overlay.remove();
    }
  });
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
