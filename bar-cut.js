// Прътов разкрой — 1D Bin Packing (First Fit Decreasing)

const COLORS = [
  "#2563eb","#16a34a","#d97706","#9333ea","#0891b2",
  "#dc2626","#059669","#7c3aed","#ea580c","#0284c7",
  "#65a30d","#db2777","#0d9488","#6d28d9","#b45309",
  "#1d4ed8","#15803d","#b45309","#7e22ce","#0369a1",
];

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
  // Разгъни по количество и сортирай низходящо
  const all = [];
  pieces.forEach(p => {
    for (let i = 0; i < p.qty; i++) all.push({ len: p.len, userDesc: p.userDesc, colorIdx: p.colorIdx });
  });
  all.sort((a, b) => b.len - a.len);

  const bars = [];
  for (const piece of all) {
    let placed = false;
    for (const bar of bars) {
      // Резервираме kerf преди всяко следващо парче (не преди първото)
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

  // Прочети редовете
  const colorMap = {};
  let colorCounter = 0;
  const pieces = [];

  for (const tr of piecesBody.querySelectorAll("tr")) {
    const lenVal = tr.querySelector(".p-len").value;
    const qtyVal = tr.querySelector(".p-qty").value;
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

  // ---- Обобщение ----
  const totalBars    = bars.length;
  const totalCuts    = bars.reduce((s, b) => s + b.cuts.length, 0);
  const totalUsed    = bars.reduce((s, b) => s + b.used, 0);
  const totalMat     = totalBars * barLen;
  const totalWaste   = totalMat - totalUsed;
  const utilPct      = (totalUsed / totalMat * 100).toFixed(1);
  const wastePct     = (totalWaste / totalMat * 100).toFixed(1);

  // Print header
  const profile = document.getElementById("bc-profile").value.trim();
  const dateStr = new Date().toLocaleDateString("bg-BG");
  document.getElementById("print-header").textContent =
    `DankoSystems · Прътов разкрой${profile ? " · " + profile : ""} · ${dateStr}`;

  // Hero
  document.getElementById("res-count").textContent = totalBars;
  document.getElementById("res-chips").innerHTML = `
    <div class="chip">Общо разрези: <b>${totalCuts} бр.</b></div>
    <div class="chip green">Използване: <b>${utilPct}%</b></div>
    <div class="chip red">Отпадък: <b>${fmt(totalWaste)} мм</b> (${wastePct}%)</div>
    <div class="chip">Материал: <b>${(totalMat / 1000).toFixed(2)} м</b></div>
  `;

  // Per-bar визуализация
  document.getElementById("bars-container").innerHTML = bars.map((bar, i) => {
    const waste    = barLen - bar.used;
    const utilB    = (bar.used / barLen * 100).toFixed(1);
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

// ---- Помощни ----
function fmt(n) { return Number(n).toLocaleString("bg-BG"); }
function esc(s) {
  return (s ?? "").toString().replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);
}
