/**
 * nesting.js — DXF Нестинг: колко детайла се събират на лист?
 *
 * Алгоритъм: shelf-packing с въртене (0/90/180/270°).
 * За DXF: извлича затворени контури → взема най-голямото (outer контур).
 * Опционално: ако формата е много нередовна, ползва convex hull бокс.
 */

import { analyzeDxf } from "./dxf-analyzer.js";
import { initProjectBar } from "./project-bar.js";
import { initProjectSidebar } from "./project-sidebar.js";

// ============================================================
// Геометрични помощни
// ============================================================

function polyBbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

function rotatePoly(pts, deg) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return pts.map(([x, y]) => [x * c - y * s, x * s + y * c]);
}

function normalizePoly(pts) {
  const { x0, y0 } = polyBbox(pts);
  return pts.map(([x, y]) => [x - x0, y - y0]);
}

function polyArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

// ============================================================
// Извличане на контури от DXF ентити
// ============================================================

const WELD = 0.1; // мм — затваряне на хлабини

function sampleArc(cx, cy, r, startDeg, endDeg, tol = 0.2) {
  if (r <= 0) return [];
  // normalize angles
  let s = startDeg, e = endDeg;
  if (e <= s) e += 360;
  const arcLen = ((e - s) / 360) * 2 * Math.PI * r;
  const n = Math.max(4, Math.ceil(arcLen / tol));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((s + (e - s) * i / n) * Math.PI) / 180;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function sampleCircle(cx, cy, r, tol = 0.2) {
  if (r <= 0) return [];
  const n = Math.max(16, Math.ceil((2 * Math.PI * r) / tol));
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function bulgePts(x1, y1, x2, y2, bulge, tol = 0.2) {
  if (Math.abs(bulge) < 1e-10) return [[x2, y2]];
  const chord = Math.hypot(x2 - x1, y2 - y1);
  if (chord < 1e-9) return [[x2, y2]];
  const theta = 4 * Math.atan(Math.abs(bulge));
  const r = chord / (2 * Math.sin(theta / 2));
  const d = r * Math.cos(theta / 2);
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const nx = -(y2 - y1) / chord, ny = (x2 - x1) / chord;
  const sign = bulge > 0 ? 1 : -1;
  const cx = mx + sign * d * nx, cy = my + sign * d * ny;
  const a1 = Math.atan2(y1 - cy, x1 - cx);
  const a2 = Math.atan2(y2 - cy, x2 - cx);
  let startDeg = (a1 * 180) / Math.PI, endDeg = (a2 * 180) / Math.PI;
  if (bulge > 0 && endDeg < startDeg) endDeg += 360;
  if (bulge < 0 && endDeg > startDeg) endDeg -= 360;
  return sampleArc(cx, cy, r, startDeg, endDeg, tol).slice(1);
}

/**
 * Извлича сегменти от ентити → масив от сегменти [[x,y],...]
 * factor = unit → mm scaling
 */
function entitiesToSegments(entities, factor) {
  const segs = [];
  for (const e of entities) {
    const f = factor;
    switch (e.type) {
      case "LINE": {
        const x1 = (e.x1 ?? 0) * f, y1 = (e.y1 ?? 0) * f;
        const x2 = (e.x2 ?? 0) * f, y2 = (e.y2 ?? 0) * f;
        segs.push([[x1, y1], [x2, y2]]);
        break;
      }
      case "CIRCLE": {
        const pts = sampleCircle((e.cx ?? 0) * f, (e.cy ?? 0) * f, (e.radius ?? 0) * f);
        if (pts.length > 2) segs.push([...pts, pts[0]]); // closed
        break;
      }
      case "ARC": {
        const pts = sampleArc(
          (e.cx ?? 0) * f, (e.cy ?? 0) * f, (e.radius ?? 0) * f,
          e.startAngle ?? 0, e.endAngle ?? 360
        );
        if (pts.length >= 2) segs.push(pts);
        break;
      }
      case "LWPOLYLINE":
      case "POLYLINE": {
        const verts = e.vertices ?? [];
        if (verts.length < 2) break;
        const pts = [];
        for (let i = 0; i < verts.length; i++) {
          const v = verts[i], nx = i + 1 < verts.length ? verts[i + 1] : (e.closed ? verts[0] : null);
          pts.push([v.x * f, v.y * f]);
          if (nx && Math.abs(v.bulge ?? 0) > 1e-10) {
            pts.push(...bulgePts(v.x * f, v.y * f, nx.x * f, nx.y * f, v.bulge ?? 0));
          }
        }
        if (e.closed && pts.length > 2) pts.push(pts[0]);
        if (pts.length >= 2) segs.push(pts);
        break;
      }
      case "SPLINE": {
        const xs = e.ctrlX ?? [], ys = e.ctrlY ?? [];
        if (xs.length < 2) break;
        segs.push(xs.map((x, i) => [x * f, ys[i] * f]));
        break;
      }
    }
  }
  return segs;
}

/**
 * Сглобява сегменти в затворени вериги.
 */
function chainSegments(segs) {
  const chains = segs.map(s => [...s]);
  const used = new Array(chains.length).fill(false);
  const loops = [];

  for (let i = 0; i < chains.length; i++) {
    if (used[i]) continue;
    let chain = [...chains[i]];
    used[i] = true;

    // проверка дали сегментът вече е затворен
    const isClosedSeg = () => Math.hypot(
      chain[0][0] - chain[chain.length - 1][0],
      chain[0][1] - chain[chain.length - 1][1]
    ) <= WELD;

    if (!isClosedSeg()) {
      let changed = true;
      while (changed && !isClosedSeg()) {
        changed = false;
        const end = chain[chain.length - 1];
        for (let j = 0; j < chains.length; j++) {
          if (used[j]) continue;
          const a = chains[j][0], b = chains[j][chains[j].length - 1];
          if (Math.hypot(end[0] - a[0], end[1] - a[1]) <= WELD) {
            chain = [...chain, ...chains[j].slice(1)];
            used[j] = true; changed = true; break;
          }
          if (Math.hypot(end[0] - b[0], end[1] - b[1]) <= WELD) {
            chain = [...chain, ...[...chains[j]].reverse().slice(1)];
            used[j] = true; changed = true; break;
          }
        }
      }
    }
    if (chain.length >= 3) loops.push(chain);
  }
  return loops;
}

/**
 * Основна функция: DXF текст → масив от полигони (точки).
 * Връща { parts: [{outer, area, bbox}], warnings, factor }
 */
export function extractDxfParts(text) {
  const geo = analyzeDxf(text);
  const factor = geo.unit_factor ?? 1.0;

  const segs = entitiesToSegments(geo.entities, factor);
  const loops = chainSegments(segs);

  if (loops.length === 0) {
    return { parts: [], warnings: geo.warnings.concat(["Няма затворени контури."] ), factor };
  }

  // Изчисли площ и класифицирай
  const withArea = loops
    .map(l => ({ pts: l, area: polyArea(l) }))
    .filter(l => l.area > 1) // минимум 1 мм²
    .sort((a, b) => b.area - a.area);

  // Взима само най-голямата (outer контур); игнорира дупки
  const parts = withArea.slice(0, 1).map(l => {
    const bbox = polyBbox(l.pts);
    return { outer: l.pts, area: l.area, bbox };
  });

  return { parts, warnings: geo.warnings, factor };
}

// ============================================================
// Нестинг алгоритъм — shelf packing с въртене
// ============================================================

const ROTATIONS = [0, 90, 180, 270];

/**
 * Нарежда максимален брой копия на детайла в лист.
 * @param {number[][]} outerPoly - точки на контура
 * @param {object} opts
 * @returns {{placements, count, utilization, sheetW, sheetH}}
 */
export function nestPart(outerPoly, { sheetW, sheetH, clearance = 2, margin = 5, rotations = ROTATIONS }) {
  const normalized = (deg) => normalizePoly(rotatePoly(outerPoly, deg));

  // Подготви ориентации
  const orientations = rotations.map(deg => {
    const pts = normalized(deg);
    const bb = polyBbox(pts);
    return { deg, pts, w: bb.w, h: bb.h };
  });

  // Shelf packing: bottom-left, с clearance между детайлите
  const usableW = sheetW - 2 * margin;
  const usableH = sheetH - 2 * margin;

  const placements = [];
  // Shelves: [{y, h, x_used}]
  const shelves = [];

  const tryPlace = () => {
    // Намери най-добра ориентация + позиция
    for (const shelf of (shelves.length ? shelves : [{ y: 0, h: 0, xUsed: 0 }])) {
      for (const ori of orientations) {
        const pw = ori.w + clearance;
        const ph = ori.h + clearance;
        if (shelf.xUsed + pw > usableW) continue;
        if (shelf.y + ph > usableH) continue;
        return { ori, shelf };
      }
    }

    // Нова рафт
    if (shelves.length === 0) {
      for (const ori of orientations) {
        if (ori.w + clearance <= usableW && ori.h + clearance <= usableH) {
          return { ori, shelf: null };
        }
      }
      return null;
    }

    const lastShelf = shelves[shelves.length - 1];
    const nextY = lastShelf.y + lastShelf.h + clearance;
    for (const ori of orientations) {
      const ph = ori.h + clearance;
      if (ori.w + clearance <= usableW && nextY + ph <= usableH) {
        return { ori, shelf: null, newShelfY: nextY };
      }
    }
    return null;
  };

  let cap = Math.ceil((sheetW * sheetH) / Math.max(polyArea(outerPoly), 1)) + 5;
  cap = Math.min(cap, 5000);

  while (placements.length < cap) {
    let best = null;

    // Намери shelf с минимален x usage (BL heuristic)
    let bestShelfIdx = -1;
    let bestOri = null;

    for (let si = 0; si < shelves.length; si++) {
      const sh = shelves[si];
      for (const ori of orientations) {
        const pw = ori.w + clearance;
        const ph = ori.h + clearance;
        if (sh.xUsed + pw <= usableW && sh.y + ph <= usableH) {
          if (bestShelfIdx === -1) { bestShelfIdx = si; bestOri = ori; }
          else if (sh.xUsed < shelves[bestShelfIdx].xUsed) { bestShelfIdx = si; bestOri = ori; }
          break; // first fit per shelf
        }
      }
    }

    if (bestShelfIdx >= 0) {
      const sh = shelves[bestShelfIdx];
      const ori = bestOri;
      const x = margin + sh.xUsed;
      const y = margin + sh.y;
      const realPts = ori.pts.map(([px, py]) => [px + x, py + y]);
      placements.push({ x, y, rot: ori.deg, poly: realPts });
      sh.xUsed += ori.w + clearance;
      sh.h = Math.max(sh.h, ori.h + clearance);
    } else {
      // Нова рафт
      const prevH = shelves.length
        ? shelves[shelves.length - 1].y + shelves[shelves.length - 1].h
        : 0;
      let placed = false;
      for (const ori of orientations) {
        if (ori.w + clearance <= usableW && prevH + ori.h + clearance <= usableH) {
          const x = margin;
          const y = margin + prevH;
          const realPts = ori.pts.map(([px, py]) => [px + x, py + y]);
          placements.push({ x, y, rot: ori.deg, poly: realPts });
          shelves.push({ y: prevH, h: ori.h + clearance, xUsed: ori.w + clearance });
          placed = true;
          break;
        }
      }
      if (!placed) break;
    }
  }

  const partArea = polyArea(outerPoly);
  const utilization = (placements.length * partArea) / (sheetW * sheetH);

  return { placements, count: placements.length, utilization, sheetW, sheetH };
}

// ============================================================
// SVG рендер на резултата
// ============================================================

const COLORS = [
  "#2563eb","#16a34a","#d97706","#9333ea","#0891b2","#dc2626",
  "#059669","#7c3aed","#ea580c","#0284c7","#65a30d","#db2777",
];

export function nestToSvg(result, svgW = 700) {
  const { placements, sheetW, sheetH } = result;
  const scale = svgW / sheetW;
  const svgH = sheetH * scale;

  const rects = placements.map((pl, i) => {
    const color = COLORS[i % COLORS.length];
    const pts = pl.poly.map(([x, y]) => `${(x * scale).toFixed(1)},${(svgH - y * scale).toFixed(1)}`).join(" ");
    return `<polygon points="${pts}" fill="${color}33" stroke="${color}" stroke-width="0.8"/>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 ${svgW.toFixed(0)} ${svgH.toFixed(0)}"
    style="width:100%;height:auto;display:block;max-height:520px">
    <rect x="0" y="0" width="${svgW.toFixed(0)}" height="${svgH.toFixed(0)}"
      fill="#f8fafc" stroke="#1F3864" stroke-width="2"/>
    ${rects}
  </svg>`;
}

// ============================================================
// UI инициализация
// ============================================================

const fmtN = (n, d = 1) => n.toLocaleString("bg-BG", { minimumFractionDigits: d, maximumFractionDigits: d });

function init() {
  initProjectSidebar(document.getElementById("proj-sidebar-root"));
  initProjectBar(document.getElementById("project-bar-root"));

  const dropZone   = document.getElementById("nest-drop");
  const fileInput  = document.getElementById("nest-file-input");
  const fileName   = document.getElementById("nest-file-name");
  const runBtn     = document.getElementById("nest-run-btn");
  const resultsDiv = document.getElementById("nest-results");
  const svgDiv     = document.getElementById("nest-svg");
  const statsDiv   = document.getElementById("nest-stats");
  const warnDiv    = document.getElementById("nest-warnings");

  let currentText  = null;

  // Drag & drop
  dropZone.addEventListener("click", () => fileInput.click());
  dropZone.addEventListener("dragover", e => { e.preventDefault(); dropZone.classList.add("dragover"); });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
  dropZone.addEventListener("drop", e => {
    e.preventDefault(); dropZone.classList.remove("dragover");
    const f = e.dataTransfer.files[0];
    if (f) readFile(f);
  });
  fileInput.addEventListener("change", () => { if (fileInput.files[0]) readFile(fileInput.files[0]); });

  function readFile(f) {
    if (!f.name.toLowerCase().endsWith(".dxf")) {
      alert("Моля качи .dxf файл."); return;
    }
    fileName.textContent = f.name;
    const reader = new FileReader();
    reader.onload = e => { currentText = e.target.result; runBtn.disabled = false; };
    reader.readAsText(f, "utf-8");
  }

  runBtn.addEventListener("click", () => {
    if (!currentText) return;
    runNesting(currentText);
  });

  // Auto-run when params change
  ["nest-w", "nest-h", "nest-clearance", "nest-margin"].forEach(id => {
    document.getElementById(id).addEventListener("change", () => {
      if (currentText) runNesting(currentText);
    });
  });
  document.querySelectorAll("input[name='nest-rot']").forEach(cb => {
    cb.addEventListener("change", () => { if (currentText) runNesting(currentText); });
  });

  function runNesting(text) {
    const sheetW = parseFloat(document.getElementById("nest-w").value) || 1000;
    const sheetH = parseFloat(document.getElementById("nest-h").value) || 2000;
    const clearance = parseFloat(document.getElementById("nest-clearance").value) || 2;
    const margin = parseFloat(document.getElementById("nest-margin").value) || 5;
    const rotations = [...document.querySelectorAll("input[name='nest-rot']:checked")]
      .map(cb => parseInt(cb.value));
    if (rotations.length === 0) { alert("Избери поне един ъгъл на въртене."); return; }

    const { parts, warnings } = extractDxfParts(text);

    warnDiv.innerHTML = warnings.length
      ? warnings.map(w => `<div class="nest-warn">⚠ ${w}</div>`).join("")
      : "";

    if (parts.length === 0) {
      resultsDiv.classList.remove("hidden");
      statsDiv.innerHTML = `<div class="nest-empty">Не е намерен подходящ контур в DXF файла.</div>`;
      svgDiv.innerHTML = "";
      return;
    }

    const part = parts[0];
    const result = nestPart(part.outer, { sheetW, sheetH, clearance, margin, rotations });

    // Stats
    const bbW = part.bbox.w.toFixed(1), bbH = part.bbox.h.toFixed(1);
    const netArea = (part.area / 1e6).toFixed(4);

    statsDiv.innerHTML = `
      <div class="nest-hero">${result.count}</div>
      <div class="nest-hero-lbl">детайла на лист</div>
      <div class="nest-chips">
        <span class="nest-chip">${fmtN(result.utilization * 100)}% оползотворяване</span>
        <span class="nest-chip green">Лист ${sheetW}×${sheetH} мм</span>
        <span class="nest-chip">${bbW}×${bbH} мм габарит</span>
        <span class="nest-chip">${fmtN(part.area, 0)} мм² нетна площ</span>
      </div>
    `;

    svgDiv.innerHTML = nestToSvg(result);
    resultsDiv.classList.remove("hidden");
  }
}

init();
