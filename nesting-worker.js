/**
 * nesting-worker.js — Web Worker за NFP нестинг.
 * Зарежда ClipperLib и изпълнява nestPart() извън главния thread.
 */

importScripts('https://unpkg.com/clipper-lib@6.4.2/clipper.js');

// ============================================================
// Геометрични помощни
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
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

function normalizePoly(pts) {
  const { x0, y0 } = polyBbox(pts);
  return pts.map(([x, y]) => [x - x0, y - y0]);
}

// Douglas-Peucker опростяване
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

function simplifyPoly(pts, maxVerts = 64) {
  if (pts.length <= maxVerts) return pts;
  // Адаптивна толеранция
  let tol = 0.1;
  let simplified = pts;
  while (simplified.length > maxVerts && tol < 10) {
    // затвори контура преди опростяване
    const closed = [...pts, pts[0]];
    simplified = dpSimplify(closed, tol);
    simplified = simplified.slice(0, -1); // маха последната = първата
    tol *= 2;
  }
  return simplified.length >= 3 ? simplified : pts.slice(0, maxVerts);
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

function computeNFP(stationaryC, movingC) {
  const Bneg = movingC.map(p => ({ X: -p.X, Y: -p.Y }));
  try {
    return ClipperLib.Clipper.MinkowskiSum(stationaryC, Bneg, true) ?? [];
  } catch { return []; }
}

// ============================================================
// NFP нестинг
// ============================================================

function nestPart(outerPoly, { sheetW, sheetH, clearance, margin, rotations }) {
  const MAX_VERTS = 60;
  const simplified = simplifyPoly(outerPoly, MAX_VERTS);
  const half = clearance / 2;
  const Ws = Math.round(sheetW * SC), Hs = Math.round(sheetH * SC), Ms = Math.round(margin * SC);

  const oris = rotations.map(deg => {
    const rotated = rotatePoly(simplified, deg);
    const norm = normalizePoly(rotated);
    const cp = toC(norm);
    const coll = offsetPath(cp, half);
    const bb = bboxC(coll);
    return { deg, norm, coll, bb };
  });

  const placed = [];
  const partArea_ = polyArea(outerPoly);
  const cap = Math.min(300, Math.ceil(sheetW * sheetH / Math.max(partArea_, 1)) + 5);
  const total = cap; // за прогрес

  while (placed.length < cap) {
    // Изпрати прогрес
    if (placed.length % 5 === 0) {
      self.postMessage({ type: 'progress', placed: placed.length, total });
    }

    let best = null;

    for (const ori of oris) {
      const { bb, coll } = ori;
      const lx = Ms - bb.x0, hx = Ws - Ms - bb.x1;
      const ly = Ms - bb.y0, hy = Hs - Ms - bb.y1;
      if (hx < lx || hy < ly) continue;

      const ifp = [[
        { X: lx, Y: ly }, { X: hx, Y: ly },
        { X: hx, Y: hy }, { X: lx, Y: hy },
      ]];

      let forb = [];
      for (const pl of placed) {
        const nfps = computeNFP(pl.worldColl, coll);
        if (nfps.length) forb = forb.concat(nfps);
      }
      const forbidden = forb.length ? cUnion(forb) : [];
      const allowed   = forbidden.length ? cDiff(ifp, forbidden) : ifp;
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
    const worldColl = ori.coll.map(p => ({ X: p.X + rx, Y: p.Y + ry }));
    // realPoly се изпраща на main thread — използва оригиналния (не опростения) за SVG
    const displayPoly = normalizePoly(rotatePoly(outerPoly, ori.deg))
      .map(([x, y]) => [x + rx / SC, y + ry / SC]);
    placed.push({ worldColl, poly: displayPoly, x: rx / SC, y: ry / SC, rot: ori.deg });
  }

  return {
    placements: placed.map(({ worldColl: _wc, ...rest }) => rest), // не изпращай worldColl
    count: placed.length,
    utilization: placed.length * partArea_ / (sheetW * sheetH),
    sheetW, sheetH,
  };
}

// ============================================================
// Worker message handler
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
