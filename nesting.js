/**
 * nesting.js — UI за DXF нестинг.
 * DXF парсването е тук; NFP нестингът върви в nesting-worker.js (Web Worker).
 */

import { analyzeDxf } from "./dxf-analyzer.js";
import { initProjectBar } from "./project-bar.js";
import { initProjectSidebar } from "./project-sidebar.js";
import { initSync } from "./project-store.js";

// Supabase sync за проекти
if (typeof SUPABASE_URL !== "undefined") {
  initSync(SUPABASE_URL, SUPABASE_ANON_KEY).catch(() => {});
}

// ============================================================
// DXF → полигон (main thread)
// ============================================================

const WELD = 0.15;

function polyArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

function polyBbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

function normalizePoly(pts) {
  const { x0, y0 } = polyBbox(pts);
  return pts.map(([x, y]) => [x - x0, y - y0]);
}

function sampleArc(cx, cy, r, a1, a2, tol = 0.25) {
  if (r <= 0) return [];
  if (a2 <= a1) a2 += 360;
  const n = Math.max(4, Math.ceil(((a2 - a1) / 360) * 2 * Math.PI * r / tol));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a1 + (a2 - a1) * i / n) * Math.PI) / 180;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function bulgePts(x1, y1, x2, y2, bulge, tol = 0.25) {
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
  let s = Math.atan2(y1 - cy, x1 - cx) * 180 / Math.PI;
  let e = Math.atan2(y2 - cy, x2 - cx) * 180 / Math.PI;
  if (bulge > 0 && e < s) e += 360;
  if (bulge < 0 && e > s) e -= 360;
  return sampleArc(cx, cy, r, s, e, tol).slice(1);
}

function entitiesToSegs(entities, factor) {
  const segs = [];
  for (const e of entities) {
    const f = factor;
    switch (e.type) {
      case "LINE":
        segs.push([[e.x1 * f, e.y1 * f], [e.x2 * f, e.y2 * f]]); break;
      case "CIRCLE": {
        const pts = sampleArc(e.cx * f, e.cy * f, e.radius * f, 0, 360);
        if (pts.length > 2) segs.push([...pts, pts[0]]); break;
      }
      case "ARC": {
        const pts = sampleArc(e.cx * f, e.cy * f, e.radius * f, e.startAngle ?? 0, e.endAngle ?? 360);
        if (pts.length >= 2) segs.push(pts); break;
      }
      case "LWPOLYLINE":
      case "POLYLINE": {
        const verts = e.vertices ?? [];
        if (verts.length < 2) break;
        const pts = [[verts[0].x * f, verts[0].y * f]];
        for (let i = 0; i < verts.length; i++) {
          const v = verts[i];
          const nx = i + 1 < verts.length ? verts[i + 1] : (e.closed ? verts[0] : null);
          if (!nx) continue;
          if (Math.abs(v.bulge ?? 0) > 1e-10)
            pts.push(...bulgePts(v.x * f, v.y * f, nx.x * f, nx.y * f, v.bulge));
          else
            pts.push([nx.x * f, nx.y * f]);
        }
        if (e.closed && pts.length > 2) pts.push(pts[0]);
        if (pts.length >= 2) segs.push(pts); break;
      }
      case "SPLINE": {
        const xs = e.ctrlX ?? [], ys = e.ctrlY ?? [];
        if (xs.length >= 2) segs.push(xs.map((x, i) => [x * f, ys[i] * f])); break;
      }
    }
  }
  return segs;
}

function chainSegments(segs) {
  const chains = segs.map(s => [...s]);
  const used = new Array(chains.length).fill(false);
  const loops = [];
  const closed = ch =>
    Math.hypot(ch[0][0] - ch[ch.length - 1][0], ch[0][1] - ch[ch.length - 1][1]) <= WELD;

  for (let i = 0; i < chains.length; i++) {
    if (used[i]) continue;
    let chain = [...chains[i]]; used[i] = true;
    let changed = true;
    while (changed && !closed(chain)) {
      changed = false;
      const end = chain[chain.length - 1];
      for (let j = 0; j < chains.length; j++) {
        if (used[j]) continue;
        const a = chains[j][0], b = chains[j][chains[j].length - 1];
        if (Math.hypot(end[0] - a[0], end[1] - a[1]) <= WELD) {
          chain = [...chain, ...chains[j].slice(1)]; used[j] = true; changed = true; break;
        }
        if (Math.hypot(end[0] - b[0], end[1] - b[1]) <= WELD) {
          chain = [...chain, ...[...chains[j]].reverse().slice(1)];
          used[j] = true; changed = true; break;
        }
      }
    }
    if (chain.length >= 3) loops.push(chain);
  }
  return loops;
}

export function extractDxfParts(text) {
  const geo = analyzeDxf(text);
  const factor = geo.unit_factor ?? 1.0;
  const segs = entitiesToSegs(geo.entities, factor);
  const loops = chainSegments(segs);
  if (!loops.length)
    return { parts: [], warnings: geo.warnings.concat(["Няма затворени контури."]) };

  const withArea = loops
    .map(l => ({ pts: l, area: polyArea(l) }))
    .filter(l => l.area > 1)
    .sort((a, b) => b.area - a.area);

  const parts = withArea.slice(0, 1).map(l => ({
    outer: normalizePoly(l.pts),
    area: l.area,
    bbox: polyBbox(l.pts),
  }));
  return { parts, warnings: geo.warnings };
}

// ============================================================
// SVG рендер (main thread)
// ============================================================

const COLORS = [
  "#2563eb","#16a34a","#d97706","#9333ea","#0891b2","#dc2626",
  "#059669","#7c3aed","#ea580c","#0284c7","#65a30d","#db2777",
];

function nestToSvg(result, svgW = 700) {
  const { placements, sheetW, sheetH } = result;
  const sc = svgW / sheetW;
  const svgH = Math.round(sheetH * sc);
  const shapes = placements.map((pl, i) => {
    const color = COLORS[i % COLORS.length];
    const pts = pl.poly.map(([x, y]) =>
      `${(x * sc).toFixed(1)},${(svgH - y * sc).toFixed(1)}`).join(" ");
    return `<polygon points="${pts}" fill="${color}44" stroke="${color}" stroke-width="0.7" stroke-linejoin="round"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}"
      style="width:100%;height:auto;display:block">
    <rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#f8fafc" stroke="#1F3864" stroke-width="2"/>
    ${shapes}</svg>`;
}

// ============================================================
// UI
// ============================================================

const fmtN = (n, d = 1) =>
  n.toLocaleString("bg-BG", { minimumFractionDigits: d, maximumFractionDigits: d });

function init() {
  initProjectSidebar(document.getElementById("proj-sidebar-root"));
  initProjectBar(document.getElementById("project-bar-root"));

  const dropZone  = document.getElementById("nest-drop");
  const fileInput = document.getElementById("nest-file-input");
  const fileName  = document.getElementById("nest-file-name");
  const runBtn    = document.getElementById("nest-run-btn");
  const resultsEl = document.getElementById("nest-results");
  const svgDiv    = document.getElementById("nest-svg");
  const statsDiv  = document.getElementById("nest-stats");
  const warnDiv   = document.getElementById("nest-warnings");
  const statusEl  = document.getElementById("nest-status");
  const progressEl= document.getElementById("nest-progress");

  let currentText = null;
  let worker      = null;

  function setStatus(msg, type = "info") {
    statusEl.textContent = msg;
    statusEl.style.color = type === "error" ? "#dc2626" : type === "ok" ? "#16a34a" : "#6b7280";
    statusEl.style.display = msg ? "" : "none";
  }
  function setProgress(pct) {
    progressEl.style.display = pct == null ? "none" : "";
    if (pct != null) progressEl.value = pct;
  }

  // Drag & drop
  dropZone.addEventListener("click", () => fileInput.click());
  dropZone.addEventListener("dragover", e => { e.preventDefault(); dropZone.classList.add("dragover"); });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
  dropZone.addEventListener("drop", e => {
    e.preventDefault(); dropZone.classList.remove("dragover");
    const f = e.dataTransfer.files[0]; if (f) readFile(f);
  });
  fileInput.addEventListener("change", () => { if (fileInput.files[0]) readFile(fileInput.files[0]); });

  function readFile(f) {
    if (!f.name.toLowerCase().endsWith(".dxf")) { alert("Моля качи .dxf файл."); return; }
    fileName.textContent = f.name;
    const reader = new FileReader();
    reader.onload = e => { currentText = e.target.result; runBtn.disabled = false; setStatus(""); };
    reader.readAsText(f, "utf-8");
  }

  runBtn.addEventListener("click", () => { if (currentText) startNesting(currentText); });
  ["nest-sheet","nest-clearance","nest-margin"].forEach(id =>
    document.getElementById(id).addEventListener("change", () => { if (currentText) startNesting(currentText); }));
  document.querySelectorAll("input[name='nest-rot']").forEach(cb =>
    cb.addEventListener("change", () => { if (currentText) startNesting(currentText); }));

  function startNesting(text) {
    // Стоп на предишен worker ако тече
    if (worker) { worker.terminate(); worker = null; }

    const [sheetW, sheetH] = (document.getElementById("nest-sheet").value || "1000x2000")
      .split("x").map(Number);
    const clearance = parseFloat(document.getElementById("nest-clearance").value) || 2;
    const margin    = parseFloat(document.getElementById("nest-margin").value) || 5;
    const rotations = [...document.querySelectorAll("input[name='nest-rot']:checked")]
      .map(cb => parseInt(cb.value));
    if (!rotations.length) { alert("Избери поне един ъгъл на въртене."); return; }

    // 1. Парсване на DXF (main thread — бързо)
    setStatus("Четене на DXF…");
    setProgress(0);
    runBtn.disabled = true;

    let parts, warnings;
    try {
      ({ parts, warnings } = extractDxfParts(text));
    } catch (err) {
      setStatus("Грешка при четене: " + err.message, "error");
      runBtn.disabled = false; setProgress(null); return;
    }

    warnDiv.innerHTML = warnings.length
      ? warnings.map(w => `<div class="nest-warn">⚠ ${w}</div>`).join("") : "";

    if (!parts.length) {
      resultsEl.classList.remove("hidden");
      statsDiv.innerHTML = `<div class="nest-empty">Не е намерен подходящ контур.</div>`;
      svgDiv.innerHTML = ""; setStatus(""); setProgress(null); runBtn.disabled = false; return;
    }

    // 2. Нестинг в Web Worker
    setStatus("Изчислява се нестинг (NFP)…");
    const t0 = performance.now();

    worker = new Worker("nesting-worker.js");
    worker.postMessage({
      outerPoly: parts[0].outer,
      sheetW, sheetH, clearance, margin, rotations,
    });

    worker.onmessage = function (e) {
      const msg = e.data;
      if (msg.type === "status") { setStatus(msg.msg); return; }
      if (msg.type === "progress") {
        const pct = msg.total > 0 ? Math.min(99, (msg.placed / msg.total) * 100) : 0;
        setProgress(pct);
        setStatus(`Изчислява се… ${msg.placed} наредени`);
        return;
      }
      if (msg.type === "error") {
        setStatus("Грешка: " + msg.message, "error");
        runBtn.disabled = false; setProgress(null); worker = null; return;
      }
      // done
      const ms = Math.round(performance.now() - t0);
      const result = msg.result;
      const bb = parts[0].bbox;

      statsDiv.innerHTML = `
        <div class="nest-hero">${result.count}</div>
        <div class="nest-hero-lbl">детайла на лист</div>
        <div class="nest-chips">
          <span class="nest-chip green">${fmtN(result.utilization * 100)}% оползотворяване</span>
          <span class="nest-chip">Лист ${sheetW}×${sheetH} мм</span>
          <span class="nest-chip">${bb.w.toFixed(1)}×${bb.h.toFixed(1)} мм габарит</span>
          <span class="nest-chip">${fmtN(parts[0].area, 0)} мм² нетна площ</span>
        </div>`;

      svgDiv.innerHTML = nestToSvg(result);
      resultsEl.classList.remove("hidden");
      setStatus(`Готово за ${ms} мс`, "ok");
      setProgress(null);
      runBtn.disabled = false;
      worker = null;
    };

    worker.onerror = function (err) {
      setStatus("Worker грешка: " + err.message, "error");
      runBtn.disabled = false; setProgress(null); worker = null;
    };
  }
}

init();
