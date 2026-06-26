/**
 * dxf-analyzer.js
 * JS порт на dxf_analyzer.py — извлича геометрия от DXF текст за остойностяване.
 *
 * Поддържани ентити: LINE, ARC, CIRCLE, LWPOLYLINE, POLYLINE+VERTEX, SPLINE
 * Логика за единици, огъвки, дублирани контури — идентична с Python оригинала.
 */

// --- единици $INSUNITS → коефициент към мм ---
const INSUNITS_TO_MM = {
  0: 1.0,    // без единици → mm по подразбиране
  1: 25.4,   // инчове
  2: 304.8,  // фута
  4: 1.0,    // mm
  5: 10.0,   // cm
  6: 1000.0, // m
  8: 0.0254, // microinch
  9: 1.0,    // mm (milliinch е рядко)
  10: 914.4, // yard
};
const INSUNITS_NAME = { 0: "без единици", 1: "инчове", 2: "фута", 4: "mm", 5: "cm", 6: "m" };

const BEND_PATTERNS = ["bend", "biegen", "biegung", "falz", "огъв"];
const CUT_TYPES = new Set(["LINE","ARC","CIRCLE","ELLIPSE","LWPOLYLINE","POLYLINE","SPLINE"]);

// ---- Парсване на DXF в двойки [код, стойност] ----
function parsePairs(text) {
  const pairs = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    const val  = lines[i + 1].trim();
    if (!isNaN(code)) pairs.push([code, val]);
  }
  return pairs;
}

// ---- Извличане на секции ----
function extractSections(pairs) {
  const sections = {};
  let inSection = false, secName = "", buf = [];
  for (const [c, v] of pairs) {
    if (c === 0 && v === "SECTION") { inSection = true; buf = []; continue; }
    if (inSection && c === 2 && !secName) { secName = v; continue; }
    if (c === 0 && v === "ENDSEC") {
      if (secName) sections[secName] = buf;
      inSection = false; secName = ""; buf = []; continue;
    }
    if (inSection) buf.push([c, v]);
  }
  return sections;
}

// ---- $INSUNITS от HEADER ----
function getInsunits(headerPairs) {
  let next = false;
  for (const [c, v] of headerPairs) {
    if (c === 9 && v === "$INSUNITS") { next = true; continue; }
    if (next && c === 70) return parseInt(v, 10);
    if (c === 9) next = false;
  }
  return 0;
}

// ---- Помощни изчисления ----
function dist2d(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

function arcLengthFromBulge(x1, y1, x2, y2, bulge) {
  // bulge = tan(θ/4) ; θ = included angle
  if (bulge === 0) return dist2d(x1, y1, x2, y2);
  const theta = 4 * Math.atan(Math.abs(bulge)); // included angle [rad]
  const chord = dist2d(x1, y1, x2, y2);
  if (chord < 1e-10) return 0;
  const r = chord / (2 * Math.sin(theta / 2));
  return r * theta;
}

function normAngle(a) {
  // normalize degrees to [0, 360)
  return ((a % 360) + 360) % 360;
}

function arcAngleDiff(startDeg, endDeg) {
  // CCW angular span in degrees (always positive, ≤ 360)
  let diff = normAngle(endDeg) - normAngle(startDeg);
  if (diff <= 0) diff += 360;
  return diff;
}

// ---- Ключ за дубликати ----
function entityKey(type, data) {
  const R = 3; // закръгляне до микрон
  const r = v => Math.round(v * Math.pow(10, R)) / Math.pow(10, R);
  if (type === "LINE") {
    const a = [r(data.x1), r(data.y1)], b = [r(data.x2), r(data.y2)];
    const sorted = [a, b].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    return `L|${sorted[0]}|${sorted[1]}`;
  }
  if (type === "CIRCLE")  return `C|${r(data.cx)}|${r(data.cy)}|${r(data.radius)}`;
  if (type === "ARC")     return `A|${r(data.cx)}|${r(data.cy)}|${r(data.radius)}|${r(data.startAngle)}|${r(data.endAngle)}`;
  if (type === "LWPOLYLINE") {
    const pts = data.vertices.map(v => `${r(v.x)},${r(v.y)}`).join("|");
    return `P|${data.closed}|${pts}`;
  }
  return null;
}

// ---- Парсване на ентити от ENTITIES секция ----
function parseEntities(pairs) {
  const entities = [];
  let current = null;
  // За LWPOLYLINE — временни vertex данни
  let lwVertices = [], lwLastX = null, lwLastY = null, lwBulge = 0;
  // За POLYLINE — vertices се добавят след
  let polyVertices = [];
  let inPolyVertex = false;
  let pvX = null, pvY = null, pvBulge = 0;

  function flushLwpoly() {
    if (current && current.type === "LWPOLYLINE" && lwVertices.length) {
      current.vertices = lwVertices.slice();
    }
  }
  function flushPolyVertex() {
    if (inPolyVertex && pvX !== null && pvY !== null) {
      polyVertices.push({ x: pvX, y: pvY, bulge: pvBulge });
    }
    inPolyVertex = false; pvX = null; pvY = null; pvBulge = 0;
  }

  for (const [c, v] of pairs) {
    if (c === 0) {
      // Flush previous entity
      if (current) {
        if (current.type === "LWPOLYLINE") flushLwpoly();
        if (current.type === "POLYLINE") {
          flushPolyVertex();
          current.vertices = polyVertices.slice();
          polyVertices = [];
        }
        entities.push(current);
        current = null;
      }
      if (v === "VERTEX") {
        inPolyVertex = true; pvX = null; pvY = null; pvBulge = 0;
        continue;
      }
      if (v === "SEQEND") { flushPolyVertex(); continue; }
      if (v === "ENDSEC" || v === "EOF") continue;

      current = { type: v, layer: "0" };
      lwVertices = []; lwLastX = null; lwLastY = null; lwBulge = 0;
      continue;
    }

    // VERTEX of POLYLINE
    if (inPolyVertex) {
      if (c === 10) pvX = parseFloat(v);
      else if (c === 20) pvY = parseFloat(v);
      else if (c === 42) pvBulge = parseFloat(v);
      continue;
    }

    if (!current) continue;

    // Общи полета
    if (c === 8)  { current.layer = v; continue; }

    switch (current.type) {
      case "LINE":
        if (c === 10) current.x1 = parseFloat(v);
        else if (c === 20) current.y1 = parseFloat(v);
        else if (c === 11) current.x2 = parseFloat(v);
        else if (c === 21) current.y2 = parseFloat(v);
        break;
      case "ARC":
        if (c === 10) current.cx = parseFloat(v);
        else if (c === 20) current.cy = parseFloat(v);
        else if (c === 40) current.radius = parseFloat(v);
        else if (c === 50) current.startAngle = parseFloat(v);
        else if (c === 51) current.endAngle = parseFloat(v);
        break;
      case "CIRCLE":
        if (c === 10) current.cx = parseFloat(v);
        else if (c === 20) current.cy = parseFloat(v);
        else if (c === 40) current.radius = parseFloat(v);
        break;
      case "ELLIPSE":
        if (c === 10) current.cx = parseFloat(v);
        else if (c === 20) current.cy = parseFloat(v);
        else if (c === 11) current.majorX = parseFloat(v);
        else if (c === 21) current.majorY = parseFloat(v);
        else if (c === 40) current.ratio = parseFloat(v);  // minor/major ratio
        else if (c === 41) current.startParam = parseFloat(v);
        else if (c === 42) current.endParam = parseFloat(v);
        break;
      case "LWPOLYLINE":
        if (c === 70) current.closed = !!(parseInt(v, 10) & 1);
        else if (c === 10) {
          if (lwLastX !== null) {
            lwVertices.push({ x: lwLastX, y: lwLastY ?? 0, bulge: lwBulge });
            lwBulge = 0;
          }
          lwLastX = parseFloat(v); lwLastY = null;
        }
        else if (c === 20) lwLastY = parseFloat(v);
        else if (c === 42) lwBulge = parseFloat(v);
        break;
      case "POLYLINE":
        if (c === 70) current.closed = !!(parseInt(v, 10) & 1);
        break;
      case "SPLINE":
        if (c === 73) current.closed = !!(parseInt(v, 10) & 1);
        if (!current.ctrlX) { current.ctrlX = []; current.ctrlY = []; }
        if (c === 10) current.ctrlX.push(parseFloat(v));
        else if (c === 20) current.ctrlY.push(parseFloat(v));
        break;
    }
  }
  // Flush last entity
  if (current) {
    if (current.type === "LWPOLYLINE") flushLwpoly();
    if (current.type === "POLYLINE") { flushPolyVertex(); current.vertices = polyVertices; }
    entities.push(current);
  }
  return entities;
}

// ---- Дължина на ентит ----
function entityLength(e) {
  switch (e.type) {
    case "LINE": {
      const x1 = e.x1 ?? 0, y1 = e.y1 ?? 0, x2 = e.x2 ?? 0, y2 = e.y2 ?? 0;
      return dist2d(x1, y1, x2, y2);
    }
    case "ARC": {
      const r = e.radius ?? 0;
      const diff = arcAngleDiff(e.startAngle ?? 0, e.endAngle ?? 360);
      return r * diff * Math.PI / 180;
    }
    case "CIRCLE":
      return 2 * Math.PI * (e.radius ?? 0);
    case "ELLIPSE": {
      // Приближение на периметъра чрез Рамануджан
      const majorLen = Math.sqrt((e.majorX ?? 0) ** 2 + (e.majorY ?? 0) ** 2);
      const minorLen = majorLen * (e.ratio ?? 1);
      const a = majorLen, b = minorLen;
      const h = ((a - b) / (a + b)) ** 2;
      const sp = e.startParam ?? 0, ep = e.endParam ?? (2 * Math.PI);
      const fullPerim = Math.PI * (a + b) * (1 + 3 * h / (10 + Math.sqrt(4 - 3 * h)));
      const fraction = Math.abs(ep - sp) / (2 * Math.PI);
      return fullPerim * fraction;
    }
    case "LWPOLYLINE":
    case "POLYLINE": {
      const verts = e.vertices ?? [];
      if (verts.length < 2) return 0;
      let len = 0;
      const n = verts.length;
      const limit = e.closed ? n : n - 1;
      for (let i = 0; i < limit; i++) {
        const a = verts[i], b = verts[(i + 1) % n];
        len += arcLengthFromBulge(a.x, a.y, b.x, b.y, a.bulge ?? 0);
      }
      return len;
    }
    case "SPLINE": {
      // Апроксимация по контролни точки (достатъчно за оценка на дължина)
      const xs = e.ctrlX ?? [], ys = e.ctrlY ?? [];
      let len = 0;
      for (let i = 0; i + 1 < xs.length; i++) {
        len += dist2d(xs[i], ys[i], xs[i + 1], ys[i + 1]);
      }
      if (e.closed && xs.length > 1) {
        len += dist2d(xs[xs.length - 1], ys[ys.length - 1], xs[0], ys[0]);
      }
      return len;
    }
  }
  return 0;
}

// ---- Проверка за затворен контур (пробивание) ----
function isClosed(e) {
  if (e.type === "CIRCLE") return true;
  if (e.type === "ELLIPSE") {
    const sp = e.startParam ?? 0, ep = e.endParam ?? (2 * Math.PI);
    return Math.abs(ep - sp - 2 * Math.PI) < 0.01;
  }
  return !!(e.closed);
}

function isBendLayer(layer) {
  const low = (layer || "").toLowerCase();
  return BEND_PATTERNS.some(p => low.includes(p));
}

// ---- Gabrit (bounding box) ----
function boundingBox(entities, factor) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  function point(x, y) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }

  for (const e of entities) {
    switch (e.type) {
      case "LINE":
        point(e.x1 ?? 0, e.y1 ?? 0); point(e.x2 ?? 0, e.y2 ?? 0); break;
      case "ARC":
      case "CIRCLE": {
        const cx = e.cx ?? 0, cy = e.cy ?? 0, r = e.radius ?? 0;
        point(cx - r, cy - r); point(cx + r, cy + r); break;
      }
      case "ELLIPSE": {
        const cx = e.cx ?? 0, cy = e.cy ?? 0;
        const mj = Math.sqrt((e.majorX ?? 0) ** 2 + (e.majorY ?? 0) ** 2);
        point(cx - mj, cy - mj); point(cx + mj, cy + mj); break;
      }
      case "LWPOLYLINE":
      case "POLYLINE":
        (e.vertices ?? []).forEach(v => point(v.x, v.y)); break;
      case "SPLINE":
        (e.ctrlX ?? []).forEach((x, i) => point(x, (e.ctrlY ?? [])[i] ?? 0)); break;
    }
  }

  if (!isFinite(minX)) return { x: 0, y: 0, area: 0 };
  const bx = (maxX - minX) * factor;
  const by = (maxY - minY) * factor;
  return { x: Math.round(bx * 100) / 100, y: Math.round(by * 100) / 100, area: Math.round(bx * by * 100) / 100 };
}

// ---- Главна функция — анализирай DXF текст ----
export function analyzeDxf(text, { cutLayers = null, bendLayers = [] } = {}) {
  const result = {
    cut_length_mm: 0,
    pierces: 0,
    blank_x_mm: 0,
    blank_y_mm: 0,
    blank_area_mm2: 0,
    bends: 0,
    units: "",
    unit_factor: 1.0,
    duplicate_entities: 0,
    entity_count: 0,
    warnings: [],
  };

  const pairs = parsePairs(text);
  const sections = extractSections(pairs);

  // Единици
  const insunits = sections.HEADER ? getInsunits(sections.HEADER) : 0;
  const factor = INSUNITS_TO_MM[insunits] ?? 1.0;
  result.units = INSUNITS_NAME[insunits] ?? `код ${insunits}`;
  result.unit_factor = factor;
  if (insunits === 0) result.warnings.push("Файлът е без единици — приети са mm.");

  const entPairs = sections.ENTITIES ?? sections.BLOCKS ?? [];
  if (!entPairs.length) {
    result.warnings.push("Не е намерена ENTITIES секция.");
    return result;
  }

  const entities = parseEntities(entPairs);
  const bendExtra = new Set(bendLayers.map(l => l.toLowerCase()));
  const seen = new Set();
  const cutEntities = [];

  for (const e of entities) {
    if (!CUT_TYPES.has(e.type)) continue;
    result.entity_count++;

    // Огъвки
    if (isBendLayer(e.layer) || bendExtra.has((e.layer || "").toLowerCase())) {
      if (["LINE", "LWPOLYLINE", "POLYLINE"].includes(e.type)) result.bends++;
      continue;
    }

    // Филтър по слой
    if (cutLayers && !cutLayers.includes(e.layer)) continue;

    // Дубликати
    const key = entityKey(e.type, e);
    if (key !== null) {
      if (seen.has(key)) { result.duplicate_entities++; continue; }
      seen.add(key);
    }

    const len = entityLength(e);
    if (len > 0) {
      result.cut_length_mm += len;
      cutEntities.push(e);
      if (isClosed(e)) result.pierces++;
    }
  }

  result.cut_length_mm = Math.round(result.cut_length_mm * factor * 100) / 100;

  const bb = boundingBox(cutEntities, factor);
  result.blank_x_mm  = bb.x;
  result.blank_y_mm  = bb.y;
  result.blank_area_mm2 = bb.area;

  if (result.duplicate_entities > 0)
    result.warnings.push(`Пропуснати ${result.duplicate_entities} дублирани/застъпени контура.`);

  return result;
}

// ---- Тегло по площ на габарит ----
export function partWeightKg(geo, thicknessMm, densityKgM3 = 7850) {
  const areaM2    = geo.blank_area_mm2 / 1_000_000;
  const volumeM3  = areaM2 * (thicknessMm / 1000);
  return Math.round(volumeM3 * densityKgM3 * 10000) / 10000;
}

// ---- Оценка на лазерно рязане ----
export function estimateLaser(geo, { feedMmPerMin, pierceTimeSec, ratePerHour }) {
  if (!feedMmPerMin) return { minutes: 0, cost: 0 };
  const cutMin    = geo.cut_length_mm / feedMmPerMin;
  const pierceMin = geo.pierces * pierceTimeSec / 60;
  const minutes   = cutMin + pierceMin;
  return {
    minutes:  Math.round(minutes * 100) / 100,
    cost:     Math.round(minutes / 60 * ratePerHour * 100) / 100,
  };
}
