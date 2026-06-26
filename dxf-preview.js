/**
 * dxf-preview.js
 * Рендира DXF ентити върху HTML Canvas — JS порт на dxf_preview.py.
 *
 * Поддържа: LINE, ARC, CIRCLE, ELLIPSE, LWPOLYLINE (bulge arcs), POLYLINE, SPLINE
 * Координатна система: DXF Y е нагоре → Canvas Y е надолу (flip при трансформация)
 */

const BRAND_COLOR = "#1F3864";

// ---- Bounding box на ентитите ----
function entityBounds(entities) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  function pt(x, y) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  function arcBounds(cx, cy, r, startDeg, endDeg) {
    // грубо — bounding box на целия кръг (консервативно, но бързо)
    pt(cx - r, cy - r); pt(cx + r, cy + r);
  }

  for (const e of entities) {
    switch (e.type) {
      case "LINE":
        pt(e.x1 ?? 0, e.y1 ?? 0); pt(e.x2 ?? 0, e.y2 ?? 0); break;
      case "ARC":
        arcBounds(e.cx ?? 0, e.cy ?? 0, e.radius ?? 0, e.startAngle ?? 0, e.endAngle ?? 360); break;
      case "CIRCLE":
        arcBounds(e.cx ?? 0, e.cy ?? 0, e.radius ?? 0, 0, 360); break;
      case "ELLIPSE": {
        const mj = Math.sqrt((e.majorX ?? 0) ** 2 + (e.majorY ?? 0) ** 2);
        arcBounds(e.cx ?? 0, e.cy ?? 0, mj, 0, 360); break;
      }
      case "LWPOLYLINE":
      case "POLYLINE":
        (e.vertices ?? []).forEach(v => pt(v.x ?? 0, v.y ?? 0)); break;
      case "SPLINE":
        (e.ctrlX ?? []).forEach((x, i) => pt(x, (e.ctrlY ?? [])[i] ?? 0)); break;
    }
  }

  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  return { minX, minY, maxX, maxY };
}

// ---- Трансформация: DXF → Canvas пиксели ----
function makeTransform(bounds, canvasW, canvasH, padding = 20) {
  const dw = bounds.maxX - bounds.minX || 1;
  const dh = bounds.maxY - bounds.minY || 1;
  const scale = Math.min(
    (canvasW - padding * 2) / dw,
    (canvasH - padding * 2) / dh
  );
  // центриране
  const offX = padding + (canvasW - padding * 2 - dw * scale) / 2;
  const offY = padding + (canvasH - padding * 2 - dh * scale) / 2;

  const tx = x => (x - bounds.minX) * scale + offX;
  // DXF Y нагоре → canvas Y надолу
  const ty = y => canvasH - ((y - bounds.minY) * scale + offY);

  return { tx, ty, scale };
}

// ---- Дъга от bulge (LWPOLYLINE сегмент) ----
function drawBulgeSegment(ctx, x1, y1, x2, y2, bulge, tx, ty, scale) {
  const EPS = 1e-10;
  if (Math.abs(bulge) < EPS) {
    ctx.lineTo(tx(x2), ty(y2));
    return;
  }

  const chord = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  if (chord < EPS) return;

  const theta = 4 * Math.atan(Math.abs(bulge));        // included angle [rad]
  const r = chord / (2 * Math.sin(theta / 2));
  const d_mc = r * Math.cos(theta / 2);                // dist midpoint → center

  const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
  const ux = (x2 - x1) / chord, uy = (y2 - y1) / chord;  // unit dir
  const px = -uy, py = ux;                                  // perp (CCW)

  // bulge > 0 → center to left of p1→p2 (CCW arc); bulge < 0 → right (CW)
  const sign = Math.sign(bulge);
  const cx = midX - sign * px * d_mc;
  const cy = midY - sign * py * d_mc;

  // ъгли в DXF пространство (рад)
  const aStart = Math.atan2(y1 - cy, x1 - cx);
  const aEnd   = Math.atan2(y2 - cy, x2 - cx);

  // след flip на Y: ъглите се отрицават, посоката се обръща
  // bulge > 0 → CCW в DXF → CW в canvas (anticlockwise=false)
  // bulge < 0 → CW  в DXF → CCW в canvas (anticlockwise=true)
  const anticlockwise = bulge > 0;

  ctx.arc(tx(cx), ty(cy), r * scale, -aStart, -aEnd, anticlockwise);
}

// ---- Главна функция: рендира ентити върху canvas ----
export function renderDxfToCanvas(entities, canvas, {
  color = BRAND_COLOR,
  background = "#FFFFFF",
  lineWidth = 1.5,
  padding = 24,
} = {}) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  // Фон
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, W, H);

  if (!entities || !entities.length) return;

  const bounds = entityBounds(entities);
  const { tx, ty, scale } = makeTransform(bounds, W, H, padding);

  ctx.strokeStyle = color;
  ctx.lineWidth   = lineWidth;
  ctx.lineCap     = "round";
  ctx.lineJoin    = "round";

  for (const e of entities) {
    ctx.beginPath();

    switch (e.type) {
      case "LINE": {
        ctx.moveTo(tx(e.x1 ?? 0), ty(e.y1 ?? 0));
        ctx.lineTo(tx(e.x2 ?? 0), ty(e.y2 ?? 0));
        break;
      }
      case "CIRCLE": {
        const cx = e.cx ?? 0, cy = e.cy ?? 0, r = (e.radius ?? 0) * scale;
        ctx.arc(tx(cx), ty(cy), r, 0, 2 * Math.PI);
        break;
      }
      case "ARC": {
        const cx = e.cx ?? 0, cy = e.cy ?? 0, r = (e.radius ?? 0) * scale;
        const sa = (e.startAngle ?? 0) * Math.PI / 180;
        const ea = (e.endAngle   ?? 360) * Math.PI / 180;
        // flip Y: negate angles, swap direction → anticlockwise=true draws CCW in DXF
        ctx.arc(tx(cx), ty(cy), r, -sa, -ea, true);
        break;
      }
      case "ELLIPSE": {
        const cx = e.cx ?? 0, cy = e.cy ?? 0;
        const majorLen = Math.sqrt((e.majorX ?? 0) ** 2 + (e.majorY ?? 0) ** 2);
        const minorLen = majorLen * (e.ratio ?? 1);
        const angle = Math.atan2(e.majorY ?? 0, e.majorX ?? 1);
        const sp = e.startParam ?? 0;
        const ep = e.endParam   ?? (2 * Math.PI);
        ctx.ellipse(tx(cx), ty(cy), majorLen * scale, minorLen * scale,
                    -angle, -sp, -ep, true);
        break;
      }
      case "LWPOLYLINE":
      case "POLYLINE": {
        const verts = e.vertices ?? [];
        if (!verts.length) break;
        ctx.moveTo(tx(verts[0].x), ty(verts[0].y));
        const n = verts.length;
        const limit = e.closed ? n : n - 1;
        for (let i = 0; i < limit; i++) {
          const a = verts[i], b = verts[(i + 1) % n];
          const bulge = a.bulge ?? 0;
          if (Math.abs(bulge) < 1e-10) {
            ctx.lineTo(tx(b.x), ty(b.y));
          } else {
            drawBulgeSegment(ctx, a.x, a.y, b.x, b.y, bulge, tx, ty, scale);
          }
        }
        if (e.closed) ctx.closePath();
        break;
      }
      case "SPLINE": {
        const xs = e.ctrlX ?? [], ys = e.ctrlY ?? [];
        if (xs.length < 2) break;
        ctx.moveTo(tx(xs[0]), ty(ys[0]));
        // Cubic bezier через control points (групи от 4)
        if (xs.length >= 4) {
          for (let i = 0; i + 3 < xs.length; i += 3) {
            ctx.bezierCurveTo(
              tx(xs[i+1]), ty(ys[i+1]),
              tx(xs[i+2]), ty(ys[i+2]),
              tx(xs[i+3]), ty(ys[i+3])
            );
          }
        } else {
          for (let i = 1; i < xs.length; i++) ctx.lineTo(tx(xs[i]), ty(ys[i]));
        }
        if (e.closed) ctx.closePath();
        break;
      }
    }

    ctx.stroke();
  }
}

// ---- Помощна: canvas → Data URL за PNG export ----
export function canvasToPng(canvas) {
  return canvas.toDataURL("image/png");
}
