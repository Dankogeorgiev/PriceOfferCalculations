/**
 * project-sidebar.js — страничен панел „Проект" за всички инструментални страници.
 *
 * Използване:
 *   import { initProjectSidebar } from "./project-sidebar.js";
 *   const sb = initProjectSidebar(document.getElementById("proj-sidebar-root"));
 *   // При нужда: sb.render();
 */

import { getCurrentProject, removeItem, clearCurrentProject } from "./project-store.js";
import { generateProjectPDF } from "./project-bar.js";

function fmt(n) {
  if (n == null) return "—";
  const num = Number(n);
  return isNaN(num) ? "—" : num.toLocaleString("bg-BG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function esc(s) {
  return (s ?? "").toString().replace(/[&<>"]/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

const SIDEBAR_CSS = `
  .ps-wrap { font-family: inherit; }
  .ps-wrap .ps-title { margin: 0 0 4px; font-size: 15px; font-weight: 700; color: #1f2a37; }
  .ps-wrap .ps-projname { font-size: 12px; color: #6366f1; font-weight: 700; margin-bottom: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ps-wrap .ps-empty { color: #9ca3af; font-size: 13px; text-align: center; padding: 20px 0; }
  .ps-wrap .ps-list { max-height: 420px; overflow-y: auto; }
  .ps-item { display: flex; align-items: flex-start; gap: 8px; padding: 7px 0; border-bottom: 1px solid #f3f4f6; }
  .ps-item:last-child { border-bottom: none; }
  .ps-icon { width: 44px; height: 36px; border: 1px solid #e5e7eb; border-radius: 6px; background: #f8fafc;
             flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 18px; overflow: hidden; }
  .ps-icon img { width: 100%; height: 100%; object-fit: contain; }
  .ps-info { flex: 1; min-width: 0; }
  .ps-name { font-size: 12px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ps-sub  { font-size: 11px; color: #6b7280; }
  .ps-badge { display: inline-block; font-size: 9px; font-weight: 700; padding: 1px 5px;
              border-radius: 4px; margin-right: 3px; vertical-align: middle; }
  .ps-price { font-size: 13px; font-weight: 800; color: #1d4ed8; white-space: nowrap; }
  .ps-del { background: none; border: none; color: #d1d5db; font-size: 15px; cursor: pointer; padding: 0 2px; flex-shrink: 0; line-height: 1; }
  .ps-del:hover { color: #dc2626; }
  .ps-total { margin-top: 10px; padding-top: 8px; border-top: 2px solid #e5e7eb;
              display: flex; justify-content: space-between; align-items: baseline; }
  .ps-total .ps-tot-lbl { font-size: 12px; color: #6b7280; font-weight: 600; }
  .ps-total .ps-tot-val { font-size: 18px; font-weight: 800; color: #1d4ed8; }
  .ps-btn-pdf { display: block; width: 100%; margin-top: 10px; background: #1F3864; color: #fff;
                border: none; border-radius: 8px; padding: 9px; font-size: 13px; font-weight: 700;
                cursor: pointer; text-align: center; }
  .ps-btn-pdf:hover { background: #162b4d; }
  .ps-btn-pdf:disabled { background: #9ca3af; cursor: default; }
  .ps-btn-clear { display: block; width: 100%; margin-top: 5px; background: none; color: #9ca3af;
                  border: 1px solid #e5e7eb; border-radius: 8px; padding: 6px; font-size: 12px; cursor: pointer; }
  .ps-btn-clear:hover { background: #fef2f2; color: #dc2626; border-color: #fca5a5; }
`;

function injectStyles() {
  if (document.getElementById("ps-styles")) return;
  const style = document.createElement("style");
  style.id = "ps-styles";
  style.textContent = SIDEBAR_CSS;
  document.head.appendChild(style);
}

export function initProjectSidebar(containerEl) {
  if (!containerEl) return { render: () => {} };
  injectStyles();

  containerEl.innerHTML = `
    <div class="ps-wrap">
      <div class="ps-title">📋 Проект</div>
      <div class="ps-projname" id="ps-projname">—</div>
      <div class="ps-list" id="ps-list">
        <div class="ps-empty" id="ps-empty">Все още няма добавени позиции.</div>
      </div>
      <div class="ps-total" id="ps-total" style="display:none">
        <span class="ps-tot-lbl">Общо</span>
        <span class="ps-tot-val" id="ps-tot-val">0.00 лв</span>
      </div>
      <button class="ps-btn-pdf" id="ps-btn-pdf" disabled>🔍 Преглед / PDF</button>
      <button class="ps-btn-clear" id="ps-btn-clear" style="display:none">Изчисти проекта</button>
    </div>
  `;

  function render() {
    const p = getCurrentProject();
    const items = p?.items || [];

    containerEl.querySelector("#ps-projname").textContent = p?.name || "—";

    const listEl  = containerEl.querySelector("#ps-list");
    const emptyEl = containerEl.querySelector("#ps-empty");
    const totalEl = containerEl.querySelector("#ps-total");
    const totVal  = containerEl.querySelector("#ps-tot-val");
    const pdfBtn  = containerEl.querySelector("#ps-btn-pdf");
    const clearBtn= containerEl.querySelector("#ps-btn-clear");

    if (!items.length) {
      listEl.innerHTML = "";
      listEl.appendChild(emptyEl);
      emptyEl.style.display = "";
      totalEl.style.display = "none";
      pdfBtn.disabled = true;
      clearBtn.style.display = "none";
      return;
    }

    emptyEl.style.display = "none";
    listEl.innerHTML = items.map((item, i) => {
      let icon, badge, sub;
      if (item.type === "dxf") {
        icon  = item.png ? `<img src="${item.png}" alt="">` : "📐";
        badge = `<span class="ps-badge" style="background:#dbeafe;color:#1d4ed8">DXF</span>`;
        sub   = `${item.qty} бр. × ${fmt(item.unitCost)} лв`;
      } else if (item.type === "barcut") {
        icon  = "🔩";
        badge = `<span class="ps-badge" style="background:#d1fae5;color:#065f46">ПРЪТ</span>`;
        const kgLine = item.kgTotal > 0 ? ` · ${Number(item.kgTotal).toLocaleString("bg-BG",{maximumFractionDigits:1})} кг` : "";
        sub   = `${item.bars} пр.${kgLine} · ${fmt(item.pricePerBar)} лв/пр.`;
      } else if (item.type === "calc") {
        icon  = "🔧";
        badge = `<span class="ps-badge" style="background:#eff6ff;color:#1d4ed8">КАЛК</span>`;
        const purLine = item.pur > 0 ? ` + покупни ${fmt(item.pur)} €` : "";
        sub   = `мат. ${fmt(item.mat)} + труд ${fmt(item.op)} €${purLine}`;
      } else if (item.type === "swiss") {
        icon  = item.png ? `<img src="${item.png}" alt="">` : "⚙️";
        badge = `<span class="ps-badge" style="background:#fef3c7;color:#92400e">SWISS</span>`;
        sub   = `мат. ${fmt(item.mat)} € · машинно ${fmt(item.proc)} €`;
      } else {
        icon  = "🎨";
        badge = `<span class="ps-badge" style="background:#fae8ff;color:#7e22ce">БОЯ</span>`;
        sub   = item.displaySub || `${fmt(item.totalArea)} м²`;
      }
      const iconHtml = typeof icon === "string" && icon.startsWith("<img")
        ? icon
        : `<span style="font-size:18px">${icon}</span>`;
      return `<div class="ps-item">
        <div class="ps-icon">${iconHtml}</div>
        <div class="ps-info">
          <div class="ps-name" title="${esc(item.name)}">${badge}${esc(item.name)}</div>
          <div class="ps-sub">${sub}</div>
          ${item.notes ? `<div class="ps-sub" style="font-style:italic">${esc(item.notes)}</div>` : ""}
        </div>
        <div class="ps-price">${fmt(item.totalCost)} лв</div>
        <button class="ps-del" data-idx="${i}" title="Премахни позицията">✕</button>
      </div>`;
    }).join("");
    listEl.appendChild(emptyEl);

    const grand = items.reduce((s, it) => s + (it.totalCost || 0), 0);
    totVal.textContent = fmt(Math.round(grand * 100) / 100) + " лв";
    totalEl.style.display = "";
    pdfBtn.disabled = false;
    clearBtn.style.display = "";
  }

  containerEl.querySelector("#ps-list").addEventListener("click", e => {
    const idx = e.target.getAttribute("data-idx");
    if (idx === null) return;
    removeItem(Number(idx));
    render();
  });

  containerEl.querySelector("#ps-btn-pdf").addEventListener("click", () => {
    const p = getCurrentProject();
    if (p) generateProjectPDF(p);
  });

  containerEl.querySelector("#ps-btn-clear").addEventListener("click", () => {
    if (!confirm("Да изчистя ли всички позиции в текущия проект?")) return;
    clearCurrentProject();
    render();
  });

  render();
  return { render };
}
