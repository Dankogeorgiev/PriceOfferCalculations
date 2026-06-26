// Прътов разкрой — 1D Bin Packing (First Fit Decreasing)

const COLORS = [
  "#2563eb","#16a34a","#d97706","#9333ea","#0891b2",
  "#dc2626","#059669","#7c3aed","#ea580c","#0284c7",
  "#65a30d","#db2777","#0d9488","#6d28d9","#b45309",
];

let rowCount = 0;
const piecesBody = document.getElementById("pieces-body");

function addRow(len = "", qty = "", desc = "") {
  rowCount++;
  const tr = document.createElement("tr");
  tr.dataset.row = rowCount;
  tr.innerHTML = `
    <td style="color:var(--muted);font-size:13px">${rowCount}</td>
    <td><input type="number" class="p-len" min="1" placeholder="мм" value="${len}" /></td>
    <td><input type="number" class="p-qty" min="1" placeholder="1" value="${qty}" style="width:60px" /></td>
    <td><input type="text" class="p-desc" placeholder="описание" value="${desc}" /></td>
    <td><button class="ghost danger del-row" style="padding:4px 10px;font-size:13px">✕</button></td>
  `;
  piecesBody.appendChild(tr);
}

document.getElementById("add-row-btn").addEventListener("click", () => addRow());

piecesBody.addEventListener("click", (e) => {
  if (e.target.classList.contains("del-row")) {
    e.target.closest("tr").remove();
  }
});

// Предзапълни с примерните данни от Excel файла
const demo = [
  [3141,4,""], [4266,9,""], [3116,1,""], [2926,2,""],
  [3126,2,""], [3456,3,""], [4570,1,""], [3536,1,""],
  [3606,1,""], [4720,1,""], [3686,1,""],
];
document.getElementById("bc-profile").value = "200×200×4";
demo.forEach(([l,q,d]) => addRow(l,q,d));

// --- Алгоритъм FFD (First Fit Decreasing) ---
function optimize(pieces, barLen, kerf) {
  // Разгъни всяко парче по количество
  const all = [];
  pieces.forEach(({ len, qty, desc, colorIdx }) => {
    for (let i = 0; i < qty; i++) all.push({ len, desc, colorIdx });
  });

  // Сортирай низходящо по дължина
  all.sort((a, b) => b.len - a.len);

  const bars = []; // всеки bar = { pieces: [{len,desc,colorIdx}], used: number }

  for (const piece of all) {
    let placed = false;
    for (const bar of bars) {
      const spaceNeeded = bar.pieces.length > 0 ? piece.len + kerf : piece.len;
      if (bar.used + spaceNeeded <= barLen) {
        bar.used += spaceNeeded;
        bar.pieces.push(piece);
        placed = true;
        break;
      }
    }
    if (!placed) {
      bars.push({ pieces: [piece], used: piece.len });
    }
  }

  return bars;
}

// --- Render ---
document.getElementById("calc-btn").addEventListener("click", () => {
  const errEl = document.getElementById("bc-error");
  errEl.textContent = "";

  const barLen = Number(document.getElementById("bc-barlen").value);
  const kerf = Number(document.getElementById("bc-kerf").value) || 0;

  if (!barLen || barLen <= 0) { errEl.textContent = "Въведи дължина на пръта."; return; }

  const rows = [...piecesBody.querySelectorAll("tr")];
  const pieces = [];
  let colorIdx = 0;
  let hasError = false;

  // Групирай уникалните дължини за оцветяване
  const colorMap = {};

  for (const tr of rows) {
    const len = Number(tr.querySelector(".p-len").value);
    const qty = Number(tr.querySelector(".p-qty").value) || 1;
    const desc = tr.querySelector(".p-desc").value.trim();

    if (!len || len <= 0) continue;
    if (len > barLen) {
      errEl.textContent = `Разрез ${len} мм е по-дълъг от пръта (${barLen} мм)!`;
      hasError = true;
      break;
    }

    const key = `${len}`;
    if (!(key in colorMap)) { colorMap[key] = colorIdx % COLORS.length; colorIdx++; }
    pieces.push({ len, qty, desc: desc || `${len} мм`, colorIdx: colorMap[key] });
  }

  if (hasError) return;
  if (!pieces.length) { errEl.textContent = "Добави поне един разрез."; return; }

  const bars = optimize(pieces, barLen, kerf);

  // Изчисли обща статистика
  const totalBars = bars.length;
  const totalUsed = bars.reduce((s, b) => s + b.used, 0);
  const totalMaterial = totalBars * barLen;
  const overallUtil = (totalUsed / totalMaterial * 100).toFixed(1);
  const totalWaste = totalMaterial - totalUsed;
  const totalPieces = bars.reduce((s, b) => s + b.pieces.length, 0);

  // Summary chips
  const chips = document.getElementById("summary-chips");
  chips.innerHTML = `
    <div class="chip">Прътове: <b>${totalBars}</b></div>
    <div class="chip">Разрези: <b>${totalPieces} бр.</b></div>
    <div class="chip green">Използване: <b>${overallUtil}%</b></div>
    <div class="chip red">Отпадък: <b>${totalWaste} мм</b> (${(totalWaste/totalMaterial*100).toFixed(1)}%)</div>
    <div class="chip">Общо материал: <b>${(totalMaterial/1000).toFixed(2)} м</b></div>
  `;

  // Bars
  const container = document.getElementById("bars-container");
  container.innerHTML = bars.map((bar, i) => {
    const waste = barLen - bar.used;
    const utilPct = (bar.used / barLen * 100).toFixed(1);

    const segs = bar.pieces.map(p => {
      const pct = (p.len / barLen * 100).toFixed(2);
      const col = COLORS[p.colorIdx];
      return `<div class="bar-seg" style="width:${pct}%;background:${col}" title="${p.len} мм — ${p.desc}">${p.len}</div>`;
    }).join("");

    const wastePct = (waste / barLen * 100).toFixed(2);
    const wasteSeg = waste > 0
      ? `<div class="bar-waste" style="width:${wastePct}%" title="Отпадък: ${waste} мм"></div>`
      : "";

    const tags = bar.pieces.map(p =>
      `<span class="piece-tag" style="background:${COLORS[p.colorIdx]}">${p.len} мм${p.desc && p.desc !== p.len + " мм" ? " · " + esc(p.desc) : ""}</span>`
    ).join("");

    return `
      <div class="bar-card">
        <div class="bar-label">Прът ${i + 1} <span>използвано ${bar.used} / ${barLen} мм &nbsp;·&nbsp; ${utilPct}% &nbsp;·&nbsp; отпадък ${waste} мм</span></div>
        <div class="bar-track">${segs}${wasteSeg}</div>
        <div class="bar-pieces-list">${tags}</div>
      </div>
    `;
  }).join("");

  document.getElementById("results").style.display = "block";
  document.getElementById("results").scrollIntoView({ behavior: "smooth", block: "start" });
});

function esc(s) {
  return (s ?? "").toString().replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
}
