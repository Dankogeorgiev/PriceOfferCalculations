/**
 * nesting-worker.js — NFP нестинг с кешираниNFP.
 *
 * Ключова оптимизация: MinkowskiSum се изчислява само ВЕДНЪЖ за всяка двойка
 * ориентации (rotations² пъти), след което всяко поставяне само транслира
 * кешираните резултати. Forbidden zone се поддържа инкрементално.
 */

importScripts('https://unpkg.com/clipper-lib@6.4.2/clipper.js');

// ============================================================
// Геометрия
// ============================================================

function polyArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

function rotatePoly(pts, deg) {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return pts.map(([x, y]) => [x * c - y * s, x * s + y * c]);
}

function polyBbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

function normalizePoly(pts) {
  const { x0, y0 } = polyBbox(pts);
  return pts.map(([x, y]) => [x - x0, y - y0]);
}

// Douglas-Peucker
function dpSimplify(pts, tol) {
  if (pts.length <= 2) return pts;
  let maxD = 0, maxI = 0;
  const [x1, y1] = pts[0], [x2, y2] = pts[pts.length - 1];
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  for (let i = 1; i < pts.length - 1; i++) {
    const d = len < 1e-9
      ? Math.hypot(pts[i][0] - x1, pts[i][1] - y1)
      : Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / len;
    if (d > maxD) { maxD = d; maxI = i; }
  }
  if (maxD > tol) {
    const l = dpSimplify(pts.slice(0, maxI + 1), tol);
    const r = dpSimplify(pts.slice(maxI), tol);
    return [...l.slice(0, -1), ...r];
  }
  return [pts[0], pts[pts.length - 1]];
}

function simplifyPoly(pts, maxVerts = 48) {
  if (pts.length <= maxVerts) return pts;
  let tol = 0.2, result = pts;
  while (result.length > maxVerts && tol < 20) {
    const closed = [...pts, pts[0]];
    const s = dpSimplify(closed, tol);
    result = s.slice(0, -1);
    tol *= 2;
  }
  return result.length >= 3 ? result : pts.slice(0, maxVerts);
}

// ============================================================
// Clipper helpers
// ============================================================

const SC = 1000;

function toC(pts) {
  return pts.map(([x, y]) => ({ X: Math.round(x * SC), Y: Math.round(y * SC) }));
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
  return paths.reduce((b, p) => (!b || p.length > b.length ? p : b), null);
}
function offsetPath(cpath, distMm) {
  if (Math.abs(distMm) < 1e-9) return cpath;
  const co = new ClipperLib.ClipperOffset();
  co.AddPath(cpath, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
  const res = new ClipperLib.Paths();
  co.Execute(res, distMm * SC);
  return largestPath(res) ?? cpath;
}

function cUnionAdd(existing, newPaths) {
  // Добавя newPaths към съществуващ union (инкрементално)
  if (!newPaths.length) return existing;
  const all = [...existing, ...newPaths];
  const c = new ClipperLib.Clipper();
  c.AddPaths(all, ClipperLib.PolyType.ptSubject, true);
  const res = new ClipperLib.Paths();
  c.Execute(ClipperLib.ClipType.ctUnion, res,
    ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return res;
}

function cDiff(subj, clip) {
  if (!clip.length) return subj;
  const c = new ClipperLib.Clipper();
  c.AddPaths(subj, ClipperLib.PolyType.ptSubject, true);
  c.AddPaths(clip, ClipperLib.PolyType.ptClip, true);
  const res = new ClipperLib.Paths();
  c.Execute(ClipperLib.ClipType.ctDifference, res,
    ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return res;
}

// ============================================================
// NFP нестинг с кеш
// ============================================================

function nestPart(outerPoly, { sheetW, sheetH, clearance, margin, rotations }) {
  const MAX_VERTS = 48;
  const simple = simplifyPoly(outerPoly, MAX_VERTS);
  const half   = clearance / 2;
  const Ws = Math.round(sheetW * SC), Hs = Math.round(sheetH * SC), Ms = Math.round(margin * SC);

  // 1. Подготви ориентации
  const oris = rotations.map(deg => {
    const norm = normalizePoly(rotatePoly(simple, deg));
    const cp   = toC(norm);
    const coll = offsetPath(cp, half);
    const bb   = bboxC(coll);
    return { deg, norm, coll, bb };
  });

  // 2. КЕШИРАЙ NFP за всяка двойка ориентации (само rotations² MinkowskiSum-а!)
  self.postMessage({ type: 'status', msg: `Предизчислява NFP (${oris.length * oris.length} комбинации)…` });
  const nfpCache = {}; // nfpCache[degA][degB] = масив от Clipper paths
  for (const oriA of oris) {
    nfpCache[oriA.deg] = {};
    for (const oriB of oris) {
      const Bneg = oriB.coll.map(p => ({ X: -p.X, Y: -p.Y }));
      try {
        nfpCache[oriA.deg][oriB.deg] = ClipperLib.Clipper.MinkowskiSum(oriA.coll, Bneg, true) ?? [];
      } catch { nfpCache[oriA.deg][oriB.deg] = []; }
    }
  }

  // 3. Инкрементален forbidden zone за всяка moving ориентация
  // cumForb[deg] = union на всички NFP-та на вече поставените части спрямо тази ориентация
  const cumForb = {};
  for (const ori of oris) cumForb[ori.deg] = [];

  const placed  = [];
  const partArea_ = polyArea(outerPoly);
  const cap = Math.min(500, Math.ceil(sheetW * sheetH / Math.max(partArea_, 1)) + 5);

  self.postMessage({ type: 'status', msg: 'Нарежда детайлите…' });

  while (placed.length < cap) {
    if (placed.length % 5 === 0)
      self.postMessage({ type: 'progress', placed: placed.length, total: cap });

    let best = null; // { score:[Y,X], ori, rx, ry }

    for (const ori of oris) {
      const { bb } = ori;
      const lx = Ms - bb.x0, hx = Ws - Ms - bb.x1;
      const ly = Ms - bb.y0, hy = Hs - Ms - bb.y1;
      if (hx < lx || hy < ly) continue;

      const ifp = [[
        { X: lx, Y: ly }, { X: hx, Y: ly },
        { X: hx, Y: hy }, { X: lx, Y: hy },
      ]];

      const allowed = cDiff(ifp, cumForb[ori.deg]);
      if (!allowed.length) continue;

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

    // 4. Актуализирай cumForb за всички moving ориентации (използва кеша)
    for (const oriB of oris) {
      const cached = nfpCache[ori.deg][oriB.deg];
      if (!cached.length) continue;
      const translated = cached.map(path => path.map(p => ({ X: p.X + rx, Y: p.Y + ry })));
      cumForb[oriB.deg] = cUnionAdd(cumForb[oriB.deg], translated);
    }

    // Съхрани полигона за SVG (по оригинален контур, не опростен)
    const displayPoly = normalizePoly(rotatePoly(outerPoly, ori.deg))
      .map(([x, y]) => [x + rx / SC, y + ry / SC]);
    placed.push({ rot: ori.deg, rx, ry, poly: displayPoly, x: rx / SC, y: ry / SC });
  }

  return {
    placements: placed.map(({ rx: _r, ry: _r2, ...rest }) => rest),
    count: placed.length,
    utilization: placed.length * partArea_ / (sheetW * sheetH),
    sheetW, sheetH,
  };
}

// ============================================================
// Worker entry point
// ============================================================

self.onmessage = function (e) {
  const { outerPoly, sheetW, sheetH, clearance, margin, rotations } = e.data;
  try {
    const result = nestPart(outerPoly, { sheetW, sheetH, clearance, margin, rotations });
    self.postMessage({ type: 'done', result });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message });
  }
};
