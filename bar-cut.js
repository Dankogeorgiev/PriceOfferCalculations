// Прътов разкрой — 1D Bin Packing (First Fit Decreasing)
import { addItem, getCurrentProject } from "./project-store.js";
import { initProjectBar } from "./project-bar.js";
import { initProjectSidebar } from "./project-sidebar.js";
import { MAT, P, computeWeightPerM } from "./metals-data.js";

const COLORS = [
  "#2563eb","#16a34a","#d97706","#9333ea","#0891b2",
  "#dc2626","#059669","#7c3aed","#ea580c","#0284c7",
  "#65a30d","#db2777","#0d9488","#6d28d9","#b45309",
  "#1d4ed8","#15803d","#b45309","#7e22ce","#0369a1",
];

// ---- Проект лента + странична лента ----
const sidebar = initProjectSidebar(document.getElementById("proj-sidebar-root"));
const bar = initProjectBar(document.getElementById("project-bar-root"), {
  onChange: () => { refreshProjName(); sidebar.render(); },
});

function refreshProjName() {
  const proj = getCurrentProject();
  const el = document.getElementById("add-proj-name");
  if (el) el.textContent = proj?.name || "—";
}
refreshProjName();

// ---- Профил selector ----
let bcProfileKey = 'round';
let bcDims = {};
let bcDesig = null;
let lastBarsResult = null;

(function buildProfileSelect() {
  const sel = document.getElementById("bc-profile-sel");
  const groups = {};
  Object.entries(P).forEach(([k, p]) => { (groups[p.g] = groups[p.g] || []).push([k, p.label]); });
  sel.innerHTML = Object.entries(groups).map(([g, arr]) =>
    `<optgroup label="${g}">${arr.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</optgroup>`
  ).join("");
})();

(function buildMatSelect() {
  const sel = document.getElementById("bc-mat-sel");
  sel.innerHTML = Object.keys(MAT).map(m => `<option value="${m}">${m}</option>`).join("");
})();

function buildBcDims() {
  const p = P[bcProfileKey];
  const container = document.getElementById("bc-dims");
  bcDims = {}; bcDesig = null;

  if (p.mode === "table") {
    const keys = Object.keys(p.table);
    bcDesig = keys[Math.floor(keys.length / 3)] || keys[0];
    const u = p.unitDesig || "";
    container.innerHTML = `<div class="field"><label>Типоразмер</label>
      <select id="bc-desig" style="width:160px">
        ${keys.map(k => `<option value="${k}"${k == bcDesig ? " selected" : ""}>${u}${k}</option>`).join("")}
      </select></div>`;
  } else if (p.mode === "plate") {
    bcDims = { t: 2, w: 1000, l: 2000, factor: p.factor };
    container.innerHTML = p.dims ? p.dims.map(d => {
      bcDims[d[0]] = d[2];
      return `<div class="field"><label>${d[1]} (мм)</label><input type="number" class="bc-dim" data-k="${d[0]}" value="${d[2]}" style="width:110px"/></div>`;
    }).join("") : "";
    container.innerHTML += `<div class="field"><label>Широчина (мм)</label><input type="number" class="bc-dim" data-k="w" value="1000" style="width:110px"/></div>` +
      `<div class="field"><label>Дебелина (мм)</label><input type="number" class="bc-dim" data-k="t" value="2" style="width:110px"/></div>`;
  } else {
    container.innerHTML = p.dims.map(d => {
      bcDims[d[0]] = d[2];
      return `<div class="field"><label>${d[1]} (мм)</label><input type="number" class="bc-dim" data-k="${d[0]}" value="${d[2]}" style="width:110px"/></div>`;
    }).join("");
  }
  updateBcWeight();
}

const BGN_PER_EUR = 1.95583;

function updateBcWeight() {
  const density = MAT[document.getElementById("bc-mat-sel").value] || 7850;
  const barLenM = (Number(document.getElementById("bc-barlen").value) || 6000) / 1000;
  const pricePerKg = Number(document.getElementById("bc-price-per-kg").value) || 0;

  const { kgPerM, valid } = computeWeightPerM(bcProfileKey, bcDims, bcDesig, density);
  const kgPerBar = kgPerM * barLenM;

  // Вземаме totalBars от последния резултат ако е наличен
  const totalBars = lastBarsResult?.totalBars || 1;
  const kgTotal = kgPerBar * totalBars;

  const numFmt = n => n.toLocaleString("bg-BG", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  document.getElementById("bc-kgm").textContent   = valid && kgPerM  ? numFmt(kgPerM)   : "—";
  document.getElementById("bc-kgbar").textContent  = valid && kgPerBar ? numFmt(kgPerBar) : "—";
  document.getElementById("bc-kgtot").textContent  = valid && kgTotal  ? numFmt(kgTotal)  : "—";

  // Авто цена прът = кг/прът × €/кг × 1.95583 (лв/прът)
  let pricePerBar = 0;
  if (valid && kgPerBar > 0 && pricePerKg > 0) {
    pricePerBar = kgPerBar * pricePerKg * BGN_PER_EUR;
    document.getElementById("bc-price-per-bar-display").value = pricePerBar.toFixed(2) + " лв";
  } else {
    document.getElementById("bc-price-per-bar-display").value = "—";
  }
  document.getElementById("bc-price-per-bar").value = pricePerBar.toFixed(4);
}

// Слушатели за профил/материал/размери
document.getElementById("bc-profile-sel").addEventListener("change", e => {
  bcProfileKey = e.target.value;
  buildBcDims();
});
document.getElementById("bc-mat-sel").addEventListener("change", () => updateBcWeight());
document.getElementById("bc-barlen").addEventListener("input", () => updateBcWeight());
document.getElementById("bc-price-per-kg").addEventListener("input", () => updateBcWeight());

document.addEventListener("input", e => {
  if (e.target.classList.contains("bc-dim")) {
    bcDims[e.target.dataset.k] = parseFloat(e.target.value) || 0;
    updateBcWeight();
  }
});
document.addEventListener("change", e => {
  if (e.target.id === "bc-desig") {
    bcDesig = e.target.value;
    updateBcWeight();
  }
});

buildBcDims();

// ---- Таблица с редове ----
let rowIdx = 0;
const piecesBody = document.getElementById("pieces-body");

function addRow(len, qty, desc) {
  rowIdx++;
  const n = rowIdx;
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td class="idx">${n}</td>
    <td><input type="number" class="p-len" min="1" placeholder="мм" value="${len ?? ""}" /></td>
    <td class="num"><input type="number" class="p-qty" min="1" placeholder="1" value="${qty ?? 1}" /></td>
    <td><input type="text" class="p-desc" placeholder="—" value="${desc ?? ""}" /></td>
    <td class="act"><button class="del-btn" title="Изтрий ред">✕</button></td>
  `;
  piecesBody.appendChild(tr);
}

document.getElementById("add-row-btn").addEventListener("click", () => {
  addRow();
  piecesBody.lastElementChild.querySelector(".p-len").focus();
});

piecesBody.addEventListener("click", e => {
  if (e.target.classList.contains("del-btn")) e.target.closest("tr").remove();
});

// Стартираме с 5 празни реда
for (let i = 0; i < 5; i++) addRow();

// ---- FFD алгоритъм ----
function ffd(pieces, barLen, kerf) {
  const all = [];
  pieces.forEach(p => {
    for (let i = 0; i < p.qty; i++) all.push({ len: p.len, userDesc: p.userDesc, colorIdx: p.colorIdx });
  });
  all.sort((a, b) => b.len - a.len);

  const bars = [];
  for (const piece of all) {
    let placed = false;
    for (const bar of bars) {
      const need = bar.cuts.length > 0 ? piece.len + kerf : piece.len;
      if (bar.used + need <= barLen) {
        bar.used += need;
        bar.cuts.push(piece);
        placed = true;
        break;
      }
    }
    if (!placed) bars.push({ cuts: [piece], used: piece.len });
  }
  return bars;
}

// ---- Изчисли ----
document.getElementById("calc-btn").addEventListener("click", () => {
  const errEl = document.getElementById("bc-error");
  errEl.textContent = "";

  const barLen = Number(document.getElementById("bc-barlen").value);
  const kerf   = Number(document.getElementById("bc-kerf").value) || 0;

  if (!barLen || barLen <= 0) {
    errEl.textContent = "Въведи дължина на пръта.";
    return;
  }

  const colorMap = {};
  let colorCounter = 0;
  const pieces = [];

  for (const tr of piecesBody.querySelectorAll("tr")) {
    const lenVal  = tr.querySelector(".p-len").value;
    const qtyVal  = tr.querySelector(".p-qty").value;
    const userDesc = tr.querySelector(".p-desc").value.trim();
    const len = Number(lenVal);
    const qty = Number(qtyVal) || 1;

    if (!lenVal || !len) continue;

    if (len > barLen) {
      errEl.textContent = `Парче ${len} мм е по-дълго от пръта (${barLen} мм)!`;
      return;
    }
    if (len <= 0) continue;

    const key = String(len);
    if (!(key in colorMap)) { colorMap[key] = colorCounter % COLORS.length; colorCounter++; }
    pieces.push({ len, qty, userDesc, colorIdx: colorMap[key] });
  }

  if (!pieces.length) {
    errEl.textContent = "Въведи поне едно парче.";
    return;
  }

  const bars = ffd(pieces, barLen, kerf);

  const totalBars  = bars.length;
  const totalCuts  = bars.reduce((s, b) => s + b.cuts.length, 0);
  const totalUsed  = bars.reduce((s, b) => s + b.used, 0);
  const totalMat   = totalBars * barLen;
  const totalWaste = totalMat - totalUsed;
  const utilPct    = (totalUsed / totalMat * 100).toFixed(1);
  const wastePct   = (totalWaste / totalMat * 100).toFixed(1);

  const pricePerBar = Number(document.getElementById("bc-price-per-bar").value) || 0;
  const totalCost   = Math.round(totalBars * pricePerBar * 100) / 100;

  // Профил — вземаме label от селектора
  const profileSel = document.getElementById("bc-profile-sel");
  const profile = profileSel.options[profileSel.selectedIndex]?.text || "";
  const notes   = document.getElementById("bc-notes").value.trim();

  // Авто-тегло: изчисли с актуалния брой пръти
  const density = MAT[document.getElementById("bc-mat-sel").value] || 7850;
  const barLenM = barLen / 1000;
  const { kgPerM, valid: wValid } = computeWeightPerM(bcProfileKey, bcDims, bcDesig, density);
  const kgPerBar  = wValid ? kgPerM * barLenM : 0;
  const kgTotal   = kgPerBar * totalBars;
  const numFmt3   = n => n.toLocaleString("bg-BG", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  document.getElementById("bc-kgm").textContent  = wValid && kgPerM  ? numFmt3(kgPerM)  : "—";
  document.getElementById("bc-kgbar").textContent = wValid && kgPerBar ? numFmt3(kgPerBar) : "—";
  document.getElementById("bc-kgtot").textContent = wValid && kgTotal  ? numFmt3(kgTotal)  : "—";

  // Запази за "Добави към проекта"
  lastBarsResult = { bars, totalBars, totalCuts, totalUsed, totalMat, totalWaste,
                     utilPct, wastePct, barLen, kerf, pricePerBar, totalCost,
                     profile, notes, pieces,
                     kgPerM, kgPerBar, kgTotal };

  // Обнови проект name и summary
  refreshProjName();
  const addSummary = document.getElementById("add-proj-summary");
  if (pricePerBar > 0 && kgTotal > 0) {
    addSummary.textContent = `${totalBars} пр. · ${numFmt3(kgTotal)} кг · ${fmt(totalCost)} лв`;
  } else if (pricePerBar > 0) {
    addSummary.textContent = `${totalBars} пр. × ${fmt(pricePerBar)} лв = ${fmt(totalCost)} лв`;
  } else if (kgTotal > 0) {
    addSummary.textContent = `${totalBars} пр. · ${numFmt3(kgTotal)} кг — въведи €/кг за сума`;
  } else {
    addSummary.textContent = `${totalBars} пр. — задай профил и €/кг за сума`;
  }

  // Print header
  const dateStr = new Date().toLocaleDateString("bg-BG");
  document.getElementById("print-header").textContent =
    `DankoSystems · Прътов разкрой${profile ? " · " + profile : ""} · ${dateStr}`;

  document.getElementById("res-count").textContent = totalBars;
  document.getElementById("res-chips").innerHTML = `
    <div class="chip">Общо разрези: <b>${totalCuts} бр.</b></div>
    <div class="chip green">Използване: <b>${utilPct}%</b></div>
    <div class="chip red">Отпадък: <b>${fmt(totalWaste)} мм</b> (${wastePct}%)</div>
    <div class="chip">Материал: <b>${(totalMat / 1000).toFixed(2)} м</b></div>
    ${kgTotal > 0 ? `<div class="chip" style="background:#f0fdf4;border-color:#bbf7d0;color:#15803d">Маса: <b>${numFmt3(kgTotal)} кг</b></div>` : ""}
    ${pricePerBar > 0 ? `<div class="chip" style="background:#eff6ff;border-color:#bfdbfe;color:#1d4ed8">Цена: <b>${fmt(totalCost)} лв</b></div>` : ""}
  `;

  document.getElementById("bars-container").innerHTML = bars.map((bar, i) => {
    const waste  = barLen - bar.used;
    const utilB  = (bar.used / barLen * 100).toFixed(1);
    const segments = bar.cuts.map(c => {
      const pct = (c.len / barLen * 100).toFixed(3);
      const col = COLORS[c.colorIdx];
      const segLabel = c.userDesc ? `${c.len} · ${esc(c.userDesc)}` : `${c.len}`;
      return `<div class="seg" style="width:${pct}%;background:${col}" title="${c.len} мм${c.userDesc ? " — " + esc(c.userDesc) : ""}">${segLabel}</div>`;
    }).join("");
    const wasteSeg = waste > 0
      ? `<div class="seg-waste" style="width:${(waste/barLen*100).toFixed(3)}%" title="Отпадък ${waste} мм"></div>`
      : "";
    const tags = bar.cuts.map(c => {
      const label = c.userDesc ? `${c.len} мм · ${esc(c.userDesc)}` : `${c.len} мм`;
      return `<span class="tag" style="background:${COLORS[c.colorIdx]}">${label}</span>`;
    }).join("");

    return `<div class="bar-card">
      <div class="bar-header">
        <span class="bar-title">Прът ${i + 1}</span>
        <span class="bar-meta">${fmt(bar.used)} / ${fmt(barLen)} мм използвани &nbsp;·&nbsp; ${utilB}% &nbsp;·&nbsp; отпадък ${fmt(waste)} мм</span>
      </div>
      <div class="bar-track">${segments}${wasteSeg}</div>
      <div class="bar-tags">${tags}</div>
    </div>`;
  }).join("");

  const res = document.getElementById("results");
  res.classList.remove("hidden");
  res.scrollIntoView({ behavior: "smooth", block: "start" });
});

// ---- Добави към проекта ----
document.getElementById("add-to-proj-btn").addEventListener("click", () => {
  if (!lastBarsResult) return;
  const r = lastBarsResult;
  const name = r.profile || `Прът ${(r.barLen / 1000).toFixed(2)} м`;

  addItem({
    type: "barcut",
    name,
    notes: r.notes,
    bars: r.totalBars,
    qty: r.totalBars,
    barLenM: (r.barLen / 1000).toFixed(2),
    kerf: r.kerf,
    pricePerBar: r.pricePerBar,
    totalCost: r.totalCost,
    utilPct: r.utilPct,
    totalCuts: r.totalCuts,
    kgPerM: r.kgPerM || 0,
    kgPerBar: r.kgPerBar || 0,
    kgTotal: r.kgTotal || 0,
  });

  bar.refresh();
  refreshProjName();
  sidebar.render();

  const projName = getCurrentProject()?.name || "—";
  const confirmEl = document.getElementById("add-proj-confirm");
  document.getElementById("add-proj-confirm-name").textContent = projName;
  confirmEl.style.display = "block";

  const btn = document.getElementById("add-to-proj-btn");
  btn.textContent = "✓ Добавено!";
  btn.style.background = "#15803d";
  setTimeout(() => {
    btn.textContent = "+ Добави към проекта";
    btn.style.background = "";
    confirmEl.style.display = "none";
  }, 3000);
});

// ---- Помощни ----
function fmt(n) { return Number(n).toLocaleString("bg-BG"); }
function esc(s) {
  return (s ?? "").toString().replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);
}
