/**
 * nesting.js — NFP нестинг (No-Fit Polygon) за DXF детайли.
 *
 * Алгоритъм: идентичен с nfp_nesting.py (SVGnest/Deepnest метод).
 *   1. За всяка ориентация на „движещия" детайл:
 *      - offset на collision полигон с clearance/2
 *      - inner-fit правоъгълник за референтната точка (0,0)
 *      - NFP(поставени, движещ) = MinkowskiSum(A, −B)
 *      - позволена зона = IFP − union(NFPs)
 *      - избира bottom-left vertex
 *   2. Поставя детайл, повтаря докато не остане място.
 *
 * Зависи от ClipperLib (зареден като глобален от CDN в nesting.html).
 */

import { analyzeDxf } from "./dxf-analyzer.js";
import { initProjectBar } from "./project-bar.js";
import { initProjectSidebar } from "./project-sidebar.js";

// ============================================================
// Геометрични помощни (без Clipper)
// ============================================================

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

function rotatePoly(pts, deg) {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return pts.map(([x, y]) => [x * c - y * s, x * s + y * c]);
}

function normalizePoly(pts) {
  const { x0, y0 } = polyBbox(pts);
  return pts.map(([x, y]) => [x - x0, y - y0]);
}

function sampleArc(cx, cy, r, a1deg, a2deg, tol = 0.25) {
  if (r <= 0) return [];
  let a1 = a1deg, a2 = a2deg;
  if (a2 <= a1) a2 += 360;
  const arcLen = ((a2 - a1) / 360) * 2 * Math.PI * r;
  const n = Math.max(4, Math.ceil(arcLen / tol));
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
  const a1 = Math.atan2(y1 - cy, x1 - cx) * 180 / Math.PI;
  const a2 = Math.atan2(y2 - cy, x2 - cx) * 180 / Math.PI;
  let s = a1, e = a2;
  if (bulge > 0 && e < s) e += 360;
  if (bulge < 0 && e > s) e -= 360;
  return sampleArc(cx, cy, r, s, e, tol).slice(1);
}

const WELD = 0.15;

function entitiesToSegs(entities, factor) {
  const segs = [];
  for (const e of entities) {
    const f = factor;
    switch (e.type) {
      case "LINE": {
        segs.push([[e.x1 * f, e.y1 * f], [e.x2 * f, e.y2 * f]]);
        break;
      }
      case "CIRCLE": {
        const pts = sampleArc(e.cx * f, e.cy * f, e.radius * f, 0, 360);
        if (pts.length > 2) segs.push([...pts, pts[0]]);
        break;
      }
      case "ARC": {
        const pts = sampleArc(e.cx * f, e.cy * f, e.radius * f, e.startAngle ?? 0, e.endAngle ?? 360);
        if (pts.length >= 2) segs.push(pts);
        break;
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
          if (Math.abs(v.bulge ?? 0) > 1e-10) {
            pts.push(...bulgePts(v.x * f, v.y * f, nx.x * f, nx.y * f, v.bulge ?? 0));
          } else {
            pts.push([nx.x * f, nx.y * f]);
          }
        }
        if (e.closed && pts.length > 2) pts.push(pts[0]);
        if (pts.length >= 2) segs.push(pts);
        break;
      }
      case "SPLINE": {
        const xs = e.ctrlX ?? [], ys = e.ctrlY ?? [];
        if (xs.length >= 2) segs.push(xs.map((x, i) => [x * f, ys[i] * f]));
        break;
      }
    }
  }
  return segs;
}

function chainSegments(segs) {
  const chains = segs.map(s => [...s]);
  const used = new Array(chains.length).fill(false);
  const loops = [];
  const isClosed = ch =>
    Math.hypot(ch[0][0] - ch[ch.length - 1][0], ch[0][1] - ch[ch.length - 1][1]) <= WELD;

  for (let i = 0; i < chains.length; i++) {
    if (used[i]) continue;
    let chain = [...chains[i]]; used[i] = true;
    let changed = true;
    while (changed && !isClosed(chain)) {
      changed = false;
      const end = chain[chain.length - 1];
      for (let j = 0; j < chains.length; j++) {
        if (used[j]) continue;
        const a = chains[j][0], b = chains[j][chains[j].length - 1];
        if (Math.hypot(end[0] - a[0], end[1] - a[1]) <= WELD) {
          chain = [...chain, ...chains[j].slice(1)]; used[j] = true; changed = true; break;
        }
        if (Math.hypot(end[0] - b[0], end[1] - b[1]) <= WELD) {
          chain = [...chain, ...[...chains[j]].reverse().slice(1)]; used[j] = true; changed = true; break;
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
  if (!loops.length) return { parts: [], warnings: geo.warnings.concat(["Няма затворени контури."]), factor };

  const withArea = loops
    .map(l => ({ pts: l, area: polyArea(l) }))
    .filter(l => l.area > 1)
    .sort((a, b) => b.area - a.area);

  const parts = withArea.slice(0, 1).map(l => ({
    outer: normalizePoly(l.pts),
    area: l.area,
    bbox: polyBbox(l.pts),
  }));
  return { parts, warnings: geo.warnings, factor };
}

// ============================================================
// Clipper helpers
// ============================================================

const SC = 1000; // 0.001 мм резолюция

function toC(pts) {
  return pts.map(([x, y]) => ({ X: Math.round(x * SC), Y: Math.round(y * SC) }));
}
function fromC(cpts) {
  return cpts.map(p => [p.X / SC, p.Y / SC]);
}
function bboxC(path) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of path) {
    if (p.X < x0) x0 = p.X; if (p.X > x1) x1 = p.X;
    if (p.Y < y0) y0 = p.Y; if (p.Y > y1) y1 = p.Y;
  }
  return { x0, y0, x1, y1 };
}
function largestPath(paths) {
  if (!paths || !paths.length) return null;
  return paths.reduce((best, p) =>
    (p.length > (best?.length ?? 0) ? p : best), null);
}

function offsetPath(cpath, distMm) {
  if (Math.abs(distMm) < 1e-9) return cpath;
  const co = new ClipperLib.ClipperOffset();
  co.AddPath(cpath, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
  const res = new ClipperLib.Paths();
  co.Execute(res, distMm * SC);
  return largestPath(res) ?? cpath;
}

function cUnion(paths) {
  if (!paths.length) return [];
  const c = new ClipperLib.Clipper();
  c.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
  const res = new ClipperLib.Paths();
  c.Execute(ClipperLib.ClipType.ctUnion, res,
    ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return res;
}

function cDiff(subj, clip) {
  const c = new ClipperLib.Clipper();
  c.AddPaths(subj, ClipperLib.PolyType.ptSubject, true);
  c.AddPaths(clip, ClipperLib.PolyType.ptClip, true);
  const res = new ClipperLib.Paths();
  c.Execute(ClipperLib.ClipType.ctDifference, res,
    ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return res;
}

/**
 * NFP(A, B) = MinkowskiSum(A, −B)
 * Забранена зона за реф. точката на B, когато е поставена близо до A.
 */
function computeNFP(stationaryC, movingC) {
  const Bneg = movingC.map(p => ({ X: -p.X, Y: -p.Y }));
  try {
    return ClipperLib.Clipper.MinkowskiSum(stationaryC, Bneg, true) ?? [];
  } catch {
    return [];
  }
}

// ============================================================
// NFP нестинг алгоритъм
// ============================================================

export function nestPart(outerPoly, { sheetW, sheetH, clearance = 2, margin = 5, rotations = [0, 90, 180, 270] }) {
  const half = clearance / 2;
  const Ws = Math.round(sheetW * SC), Hs = Math.round(sheetH * SC), Ms = Math.round(margin * SC);

  // Подготви ориентации: collision polygon (раздут с half) в Clipper координати
  const oris = rotations.map(deg => {
    const rotated = rotatePoly(outerPoly, deg);
    const norm = normalizePoly(rotated);       // реф. точка = (0,0) = bbox bottom-left
    const cp = toC(norm);
    const coll = offsetPath(cp, half);         // collision polygon
    const bb = bboxC(coll);
    return { deg, norm, coll, bb };
  });

  const placed = []; // [{worldColl, poly, x, y, rot}]
  const partArea_ = polyArea(outerPoly);
  const cap = Math.min(5000, Math.ceil(sheetW * sheetH / Math.max(partArea_, 1)) + 5);

  while (placed.length < cap) {
    let best = null; // {score:[Y,X], ori, rx, ry}

    for (const ori of oris) {
      const { bb, coll } = ori;
      // Inner-fit правоъгълник за реф. точката
      const lx = Ms - bb.x0, hx = Ws - Ms - bb.x1;
      const ly = Ms - bb.y0, hy = Hs - Ms - bb.y1;
      if (hx < lx || hy < ly) continue;

      const ifp = [[
        { X: lx, Y: ly }, { X: hx, Y: ly },
        { X: hx, Y: hy }, { X: lx, Y: hy },
      ]];

      // Забранена зона = union на NFP(поставен, движещ) за всеки поставен
      let forb = [];
      for (const pl of placed) {
        const nfps = computeNFP(pl.worldColl, coll);
        if (nfps.length) forb = forb.concat(nfps);
      }
      const forbidden = forb.length ? cUnion(forb) : [];
      const allowed  = forbidden.length ? cDiff(ifp, forbidden) : ifp;
      if (!allowed.length) continue;

      // Bottom-left: минимален Y, после минимален X
      for (const path of allowed) {
        for (const pt of path) {
          if (!best || pt.Y < best.score[0] || (pt.Y === best.score[0] && pt.X < best.score[1])) {
            best = { score: [pt.Y, pt.X], ori, rx: pt.X, ry: pt.Y };
          }
        }
      }
    }

    if (!best) break;

    const { ori, rx, ry } = best;
    const worldColl = ori.coll.map(p => ({ X: p.X + rx, Y: p.Y + ry }));
    const realPoly  = ori.norm.map(([x, y]) => [x + rx / SC, y + ry / SC]);
    placed.push({ worldColl, poly: realPoly, x: rx / SC, y: ry / SC, rot: ori.deg });
  }

  return {
    placements: placed,
    count: placed.length,
    utilization: placed.length * partArea_ / (sheetW * sheetH),
    sheetW, sheetH,
  };
}

// ============================================================
// SVG визуализация
// ============================================================

const COLORS = [
  "#2563eb","#16a34a","#d97706","#9333ea","#0891b2","#dc2626",
  "#059669","#7c3aed","#ea580c","#0284c7","#65a30d","#db2777",
];

export function nestToSvg(result, svgW = 700) {
  const { placements, sheetW, sheetH } = result;
  const sc = svgW / sheetW;
  const svgH = Math.round(sheetH * sc);

  const shapes = placements.map((pl, i) => {
    const color = COLORS[i % COLORS.length];
    const pts = pl.poly.map(([x, y]) =>
      `${(x * sc).toFixed(1)},${(svgH - y * sc).toFixed(1)}`
    ).join(" ");
    return `<polygon points="${pts}" fill="${color}44" stroke="${color}" stroke-width="0.7" stroke-linejoin="round"/>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 ${svgW} ${svgH}"
      style="width:100%;height:auto;display:block">
    <rect x="0" y="0" width="${svgW}" height="${svgH}"
      fill="#f8fafc" stroke="#1F3864" stroke-width="2"/>
    ${shapes}
  </svg>`;
}

// ============================================================
// UI
// ============================================================

const fmtN = (n, d = 1) =>
  n.toLocaleString("bg-BG", { minimumFractionDigits: d, maximumFractionDigits: d });

function setStatus(msg, type = "info") {
  const el = document.getElementById("nest-status");
  if (!el) return;
  el.textContent = msg;
  el.style.color = type === "error" ? "#dc2626" : type === "ok" ? "#16a34a" : "#6b7280";
  el.style.display = msg ? "" : "none";
}

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

  let currentText = null;

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
    if (!f.name.toLowerCase().endsWith(".dxf")) { alert("Моля качи .dxf файл."); return; }
    fileName.textContent = f.name;
    const reader = new FileReader();
    reader.onload = e => { currentText = e.target.result; runBtn.disabled = false; };
    reader.readAsText(f, "utf-8");
  }

  runBtn.addEventListener("click", () => { if (currentText) runNesting(currentText); });

  // Auto-re-run on param change
  ["nest-w", "nest-h", "nest-clearance", "nest-margin"].forEach(id =>
    document.getElementById(id).addEventListener("change", () => { if (currentText) runNesting(currentText); })
  );
  document.querySelectorAll("input[name='nest-rot']").forEach(cb =>
    cb.addEventListener("change", () => { if (currentText) runNesting(currentText); })
  );

  function runNesting(text) {
    const sheetW     = parseFloat(document.getElementById("nest-w").value) || 1000;
    const sheetH     = parseFloat(document.getElementById("nest-h").value) || 2000;
    const clearance  = parseFloat(document.getElementById("nest-clearance").value) ?? 2;
    const margin     = parseFloat(document.getElementById("nest-margin").value) ?? 5;
    const rotations  = [...document.querySelectorAll("input[name='nest-rot']:checked")]
      .map(cb => parseInt(cb.value));
    if (!rotations.length) { alert("Избери поне един ъгъл на въртене."); return; }

    if (typeof ClipperLib === "undefined") {
      setStatus("ClipperLib не е заредена — провери интернет връзката.", "error");
      return;
    }

    setStatus("Изчислява се…");
    runBtn.disabled = true;

    // Run async so browser can paint the status first
    setTimeout(() => {
      try {
        const { parts, warnings } = extractDxfParts(text);

        warnDiv.innerHTML = warnings.length
          ? warnings.map(w => `<div class="nest-warn">⚠ ${w}</div>`).join("") : "";

        if (!parts.length) {
          resultsEl.classList.remove("hidden");
          statsDiv.innerHTML = `<div class="nest-empty">Не е намерен подходящ контур в DXF файла.</div>`;
          svgDiv.innerHTML = ""; setStatus(""); runBtn.disabled = false; return;
        }

        const t0 = performance.now();
        const result = nestPart(parts[0].outer, { sheetW, sheetH, clearance, margin, rotations });
        const ms = Math.round(performance.now() - t0);

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
      } catch (err) {
        setStatus("Грешка: " + err.message, "error");
        console.error(err);
      }
      runBtn.disabled = false;
    }, 30);
  }
}

init();
