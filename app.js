import { addItem, initSync } from "./project-store.js";
import { initProjectBar } from "./project-bar.js";
import { initProjectSidebar } from "./project-sidebar.js";

// --- Supabase клиент ---
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const loginView = document.getElementById("login-view");
const appView = document.getElementById("app-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const userEmail = document.getElementById("user-email");

// --- Вход / изход ---
let _pbInited = false;

function showView(session) {
  if (session) {
    loginView.classList.add("hidden");
    appView.classList.remove("hidden");
    userEmail.textContent = session.user.email;
    if (!_pbInited) {
      // Supabase sync за проекти — зарежда от cloud и активира auto-save
      initSync(SUPABASE_URL, SUPABASE_ANON_KEY).then(() => {
        if (window._appProjectBar) window._appProjectBar.refresh();
        if (window._calcSidebar) window._calcSidebar.render();
      });
      const calcSidebar = initProjectSidebar(document.getElementById("calc-proj-sidebar-root"));
      window._appProjectBar = initProjectBar(document.getElementById("project-bar-root"), {
        onChange: () => calcSidebar.render(),
      });
      window._calcSidebar = calcSidebar;
      _pbInited = true;
    }
    loadWorkshops();
    populateWorkshopSelect();
    loadMachines();
    loadOperationRates();
    loadLaserRates();
    loadMaterials();
    loadSwissParams();
    initCalculator();
  } else {
    appView.classList.add("hidden");
    loginView.classList.remove("hidden");
  }
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) loginError.textContent = "Грешка при вход: " + error.message;
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  await db.auth.signOut();
});

db.auth.onAuthStateChange((_event, session) => showView(session));

// --- Цехове (CRUD) ---
const workshopsBody = document.getElementById("workshops-body");
const workshopForm = document.getElementById("workshop-form");
const workshopError = document.getElementById("workshop-error");

async function loadWorkshops() {
  workshopError.textContent = "";
  const { data, error } = await db.from("workshops").select("*").order("created_at", { ascending: true });
  if (error) { workshopError.textContent = "Грешка при зареждане: " + error.message; return; }
  if (!data.length) {
    workshopsBody.innerHTML = '<tr><td colspan="2" class="muted">Още няма цехове. Добави първия отгоре.</td></tr>';
    return;
  }
  workshopsBody.innerHTML = data.map(workshopRowHtml).join("");
}

function workshopRowHtml(w) {
  return `<tr>
    <td>${esc(w.name)}</td>
    <td><button class="ghost danger" data-del-workshop="${w.id}">Изтрий</button></td>
  </tr>`;
}

workshopForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  workshopError.textContent = "";
  const { error } = await db.from("workshops").insert({ name: val("w-name") });
  if (error) { workshopError.textContent = "Грешка при запис: " + error.message; return; }
  workshopForm.reset();
  loadWorkshops();
});

workshopsBody.addEventListener("click", async (e) => {
  const id = e.target.getAttribute("data-del-workshop");
  if (!id) return;
  if (!confirm("Да изтрия ли този цех?")) return;
  const { error } = await db.from("workshops").delete().eq("id", id);
  if (error) { workshopError.textContent = "Грешка при триене: " + error.message; return; }
  loadWorkshops();
});

// --- Машини (CRUD) ---
const machinesBody = document.getElementById("machines-body");
const machineForm = document.getElementById("machine-form");
const machineError = document.getElementById("machine-error");
const macWorkshopSelect = document.getElementById("mac-workshop");

async function populateWorkshopSelect() {
  const { data, error } = await db.from("workshops").select("id,name").order("name", { ascending: true });
  if (error || !data) return;
  macWorkshopSelect.innerHTML =
    '<option value="">— цех —</option>' +
    data.map((w) => `<option value="${w.id}">${esc(w.name)}</option>`).join("");
}

async function loadMachines() {
  machineError.textContent = "";
  const { data, error } = await db.from("machines").select("*, workshops(name)").order("name", { ascending: true });
  if (error) { machineError.textContent = "Грешка при зареждане: " + error.message; return; }
  if (!data.length) {
    machinesBody.innerHTML = '<tr><td colspan="6" class="muted">Още няма машини.</td></tr>';
    return;
  }
  machinesBody.innerHTML = data.map(machineRowHtml).join("");
}

function machineRowHtml(m) {
  return `<tr>
    <td>${esc(m.name)}</td>
    <td>${esc(m.workshops?.name)}</td>
    <td>${m.power_kw ?? ""}</td>
    <td>${m.energy_kwh_per_hour ?? ""}</td>
    <td>${m.operators_needed ?? ""}</td>
    <td><button class="ghost danger" data-del-machine="${m.id}">Изтрий</button></td>
  </tr>`;
}

machineForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  machineError.textContent = "";
  const payload = {
    name: val("mac-name"),
    workshop_id: val("mac-workshop") || null,
    power_kw: num("mac-power"),
    energy_kwh_per_hour: num("mac-energy"),
    operators_needed: num("mac-operators"),
  };
  const { error } = await db.from("machines").insert(payload);
  if (error) { machineError.textContent = "Грешка при запис: " + error.message; return; }
  machineForm.reset();
  loadMachines();
});

machinesBody.addEventListener("click", async (e) => {
  const id = e.target.getAttribute("data-del-machine");
  if (!id) return;
  if (!confirm("Да изтрия ли тази машина?")) return;
  const { error } = await db.from("machines").delete().eq("id", id);
  if (error) { machineError.textContent = "Грешка при триене: " + error.message; return; }
  loadMachines();
});

// --- Материали (CRUD) ---
const materialsBody = document.getElementById("materials-body");
const materialForm = document.getElementById("material-form");
const materialError = document.getElementById("material-error");

async function loadMaterials() {
  materialError.textContent = "";
  const { data, error } = await db.from("materials").select("*").order("created_at", { ascending: true });
  if (error) { materialError.textContent = "Грешка при зареждане: " + error.message; return; }
  if (!data.length) {
    materialsBody.innerHTML = '<tr><td colspan="6" class="muted">Още няма материали. Добави първия отгоре.</td></tr>';
    return;
  }
  materialsBody.innerHTML = data.map(rowHtml).join("");
}

function rowHtml(m) {
  return `<tr>
    <td>${esc(m.name)}</td>
    <td>${esc(m.unit)}</td>
    <td>${m.unit_price ?? ""}</td>
    <td>${esc(m.supplier)}</td>
    <td>${m.waste_percent ?? ""}</td>
    <td><button class="ghost danger" data-del="${m.id}">Изтрий</button></td>
  </tr>`;
}

materialForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  materialError.textContent = "";
  const payload = {
    name: val("m-name"),
    unit: val("m-unit") || null,
    unit_price: num("m-price"),
    supplier: val("m-supplier") || null,
    waste_percent: num("m-waste"),
  };
  const { error } = await db.from("materials").insert(payload);
  if (error) { materialError.textContent = "Грешка при запис: " + error.message; return; }
  materialForm.reset();
  loadMaterials();
});

materialsBody.addEventListener("click", async (e) => {
  const id = e.target.getAttribute("data-del");
  if (!id) return;
  if (!confirm("Да изтрия ли този материал?")) return;
  const { error } = await db.from("materials").delete().eq("id", id);
  if (error) { materialError.textContent = "Грешка при триене: " + error.message; return; }
  loadMaterials();
});

// --- Ставки по операция (CRUD) ---
const opratesBody = document.getElementById("oprates-body");
const oprateForm = document.getElementById("oprate-form");
const oprateError = document.getElementById("oprate-error");

async function loadOperationRates() {
  oprateError.textContent = "";
  const { data, error } = await db.from("operation_rates").select("*").order("operation", { ascending: true });
  if (error) { oprateError.textContent = "Грешка при зареждане: " + error.message; return; }
  if (!data.length) {
    opratesBody.innerHTML = '<tr><td colspan="5" class="muted">Още няма ставки.</td></tr>';
    return;
  }
  opratesBody.innerHTML = data.map(oprateRowHtml).join("");
}

function oprateRowHtml(r) {
  return `<tr>
    <td>${esc(r.operation)}</td>
    <td>${esc(r.machine)}</td>
    <td>${r.rate ?? ""}</td>
    <td>${esc(r.unit)}</td>
    <td><button class="ghost danger" data-del-oprate="${r.id}">Изтрий</button></td>
  </tr>`;
}

oprateForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  oprateError.textContent = "";
  const payload = {
    operation: val("op-operation"),
    machine: val("op-machine") || null,
    rate: num("op-rate"),
    unit: val("op-unit") || null,
  };
  const { error } = await db.from("operation_rates").insert(payload);
  if (error) { oprateError.textContent = "Грешка при запис: " + error.message; return; }
  oprateForm.reset();
  loadOperationRates();
});

opratesBody.addEventListener("click", async (e) => {
  const id = e.target.getAttribute("data-del-oprate");
  if (!id) return;
  if (!confirm("Да изтрия ли тази ставка?")) return;
  const { error } = await db.from("operation_rates").delete().eq("id", id);
  if (error) { oprateError.textContent = "Грешка при триене: " + error.message; return; }
  loadOperationRates();
});

// --- Лазерно рязане (CRUD) ---
const laserBody = document.getElementById("laser-body");
const laserForm = document.getElementById("laser-form");
const laserError = document.getElementById("laser-error");

async function loadLaserRates() {
  laserError.textContent = "";
  const { data, error } = await db
    .from("laser_rates")
    .select("*")
    .order("material", { ascending: true })
    .order("thickness_mm", { ascending: true });
  if (error) { laserError.textContent = "Грешка при зареждане: " + error.message; return; }
  if (!data.length) {
    laserBody.innerHTML = '<tr><td colspan="6" class="muted">Още няма лазерни цени.</td></tr>';
    return;
  }
  laserBody.innerHTML = data.map(laserRowHtml).join("");
}

function laserRowHtml(r) {
  return `<tr>
    <td>${esc(r.material)}</td>
    <td>${r.thickness_mm ?? ""}</td>
    <td>${r.speed_m_min ?? ""}</td>
    <td>${r.price_per_meter ?? ""}</td>
    <td>${r.price_per_contour ?? ""}</td>
    <td><button class="ghost danger" data-del-laser="${r.id}">Изтрий</button></td>
  </tr>`;
}

laserForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  laserError.textContent = "";
  const payload = {
    material: val("lz-material"),
    thickness_mm: num("lz-thickness"),
    speed_m_min: num("lz-speed"),
    price_per_meter: num("lz-meter"),
    price_per_contour: num("lz-contour"),
  };
  const { error } = await db.from("laser_rates").insert(payload);
  if (error) { laserError.textContent = "Грешка при запис: " + error.message; return; }
  laserForm.reset();
  loadLaserRates();
});

laserBody.addEventListener("click", async (e) => {
  const id = e.target.getAttribute("data-del-laser");
  if (!id) return;
  if (!confirm("Да изтрия ли този ред?")) return;
  const { error } = await db.from("laser_rates").delete().eq("id", id);
  if (error) { laserError.textContent = "Грешка при триене: " + error.message; return; }
  loadLaserRates();
});

// --- SWISS TYPE параметри ---
const SWISS_INV_KEYS = ["swiss_i_base","swiss_i_bar","swiss_i_chip","swiss_i_tool1","swiss_i_tool2","swiss_i_cool","swiss_i_mist"];
const BGN_EUR_SWISS = 1.95583;

async function loadSwissParams() {
  const { data } = await db.from("settings").select("key,value");
  if (data && data.length) {
    data.forEach(row => {
      const el = document.querySelector(`[data-key="${row.key}"]`);
      if (el) el.value = row.value;
    });
  }
  updateSwissEur();
}

function updateSwissEur() {
  let total = 0;
  SWISS_INV_KEYS.forEach(key => {
    const inp = document.querySelector(`[data-key="${key}"]`);
    const v = parseFloat(inp?.value) || 0;
    total += v;
    const eurEl = document.getElementById(key + "_eur");
    if (eurEl) eurEl.textContent = (v / BGN_EUR_SWISS).toFixed(0) + " EUR";
  });
  const totalEl = document.getElementById("swiss_total_bgn");
  const totalEurEl = document.getElementById("swiss_total_eur");
  if (totalEl) totalEl.textContent = total.toLocaleString("bg-BG") + " лв";
  if (totalEurEl) totalEurEl.textContent = (total / BGN_EUR_SWISS).toFixed(0) + " EUR";
}

document.querySelectorAll(".sw-inv").forEach(el => el.addEventListener("input", updateSwissEur));

document.getElementById("swiss-params-save")?.addEventListener("click", async () => {
  const msg = document.getElementById("swiss-params-msg");
  msg.textContent = "Запазване…";
  const rows = [...document.querySelectorAll(".sw-p")].map(el => ({
    key: el.dataset.key, value: el.value
  }));
  const { error } = await db.from("settings").upsert(rows, { onConflict: "key" });
  if (error) { msg.textContent = "Грешка: " + error.message; return; }
  msg.textContent = "✓ Запазено!";
  setTimeout(() => { msg.textContent = ""; }, 3000);
});

// --- КАЛКУЛАТОР (Фаза 2) ---
const BGN_EUR = 1.95583;
const MARGIN_MAT_LABOR = 0.5;

let refMat = [], refOp = [];
let lastCalcResult = null;

const DEFAULT_OPS = [
  { id: "_dop_1", operation: "Заварка малка",    rate: 0, unit: "€/оп" },
  { id: "_dop_2", operation: "Заварка бърза",    rate: 0, unit: "€/оп" },
  { id: "_dop_3", operation: "Точкова заварка",  rate: 0, unit: "€/оп" },
  { id: "_dop_4", operation: "Огъвка на преса",  rate: 0, unit: "€/оп" },
];

async function initCalculator() {
  const [m, o] = await Promise.all([
    db.from("material_weights").select("*").order("profile_type", { ascending: true }).order("size", { ascending: true }),
    db.from("operation_rates").select("*").order("operation", { ascending: true }),
  ]);
  refMat = m.data || [];
  // Merge DB ops with defaults (DB takes precedence for same name)
  const dbOps = o.data || [];
  const dbNames = new Set(dbOps.map(r => r.operation));
  refOp = [...dbOps, ...DEFAULT_OPS.filter(d => !dbNames.has(d.operation))];
  for (let i = 0; i < 3; i++) addOpRow();
  for (let i = 0; i < 3; i++) addPurRow();
}

function uniq(a) { return [...new Set(a)]; }

function addMatRow() {
  const tr = document.createElement("tr");
  const profiles = uniq(refMat.map((r) => r.profile_type));
  tr.innerHTML =
    `<td><select class="m-profile">${profiles.map((p) => `<option>${esc(p)}</option>`).join("")}</select></td>` +
    `<td><select class="m-size"></select></td>` +
    `<td><input type="number" step="any" class="m-amount" /></td>` +
    `<td><input type="number" step="any" class="m-qty" value="1" /></td>` +
    `<td><input type="number" step="any" class="m-price" /></td>` +
    `<td class="right m-weight">—</td>` +
    `<td class="right m-cost">0.00</td>` +
    `<td><button type="button" class="ghost danger m-del">✕</button></td>`;
  document.getElementById("calc-mat-body").appendChild(tr);
  const profileSel = tr.querySelector(".m-profile");
  const fillSizes = () => {
    const sizes = refMat.filter((r) => r.profile_type === profileSel.value);
    tr.querySelector(".m-size").innerHTML = sizes
      .map((r) => `<option value="${r.id}">${esc(r.size)} — ${r.kg_per_unit} ${esc(r.unit)}</option>`).join("");
  };
  fillSizes();
  profileSel.addEventListener("change", fillSizes);
  ["input", "change"].forEach((ev) => tr.addEventListener(ev, () => recalcMat(tr)));
  tr.querySelector(".m-del").addEventListener("click", () => tr.remove());
  recalcMat(tr);
}

function recalcMat(tr) {
  const rec = refMat.find((r) => r.id === tr.querySelector(".m-size").value);
  const amount = parseFloat(tr.querySelector(".m-amount").value) || 0;
  const qty = parseFloat(tr.querySelector(".m-qty").value) || 0;
  const price = parseFloat(tr.querySelector(".m-price").value) || 0;
  const kg = rec ? amount * Number(rec.kg_per_unit) : 0;
  const cost = kg * qty * price;
  tr.querySelector(".m-weight").textContent = kg ? kg.toFixed(2) : "—";
  tr.querySelector(".m-cost").textContent = cost.toFixed(2);
  tr.dataset.cost = cost;
}

function addOpRow() {
  const tr = document.createElement("tr");
  const opts = `<option value="">— Избери операция (труд) —</option>` +
    refOp.map((r) => `<option value="${r.id}">${esc(r.operation)}${r.machine ? " / " + esc(r.machine) : ""}</option>`).join("");
  tr.innerHTML =
    `<td style="min-width:200px;width:35%"><select class="o-op" style="min-width:180px">${opts}</select></td>` +
    `<td style="width:110px;white-space:nowrap"><input type="number" step="any" class="o-rate-input" placeholder="0.00" style="width:72px;text-align:right" /> <span class="o-rate-unit" style="font-size:11px;color:#6b7280"></span></td>` +
    `<td style="width:80px"><input type="number" step="any" class="o-ops" value="1" style="width:60px" /></td>` +
    `<td><textarea class="o-desc" placeholder="описание…" rows="2" style="width:100%;min-width:120px"></textarea></td>` +
    `<td class="right o-cost" style="width:70px">0.00</td>` +
    `<td style="width:36px"><button type="button" class="ghost danger o-del">✕</button></td>`;
  document.getElementById("calc-op-body").appendChild(tr);
  ["input", "change"].forEach((ev) => tr.addEventListener(ev, () => recalcOp(tr)));
  tr.querySelector(".o-del").addEventListener("click", () => tr.remove());
  recalcOp(tr);
}

function recalcOp(tr) {
  const rec = refOp.find((r) => r.id === tr.querySelector(".o-op").value);
  const rateInput = tr.querySelector(".o-rate-input");
  const unitSpan  = tr.querySelector(".o-rate-unit");
  // При смяна на операцията — попълни ставката автоматично, но само ако полето е празно
  if (rec && rateInput.dataset.userEdited !== "1") {
    rateInput.value = Number(rec.rate || 0);
    rateInput.dataset.userEdited = "0";
  }
  if (rec) unitSpan.textContent = rec.unit || "€";
  const rate = parseFloat(rateInput.value) || 0;
  const ops  = parseFloat(tr.querySelector(".o-ops").value) || 0;
  const cost = rate * ops;
  tr.querySelector(".o-cost").textContent = cost.toFixed(2);
  tr.dataset.cost = cost;
}
// Маркира ръчна редакция на ставката
document.getElementById("calc-op-body").addEventListener("input", e => {
  if (e.target.classList.contains("o-rate-input")) e.target.dataset.userEdited = "1";
});

function addPurRow() {
  const tr = document.createElement("tr");
  tr.innerHTML =
    `<td><input type="text" class="pur-name" placeholder="Наименование" /></td>` +
    `<td><input type="number" step="any" class="pur-qty" value="1" style="max-width:60px" /></td>` +
    `<td class="right"><input type="number" step="any" class="pur-price" placeholder="0.00" /></td>` +
    `<td class="right pur-cost">0.00</td>` +
    `<td><button type="button" class="ghost danger pur-del">✕</button></td>`;
  document.getElementById("calc-pur-body").appendChild(tr);
  ["input"].forEach((ev) => tr.addEventListener(ev, () => recalcPur(tr)));
  tr.querySelector(".pur-del").addEventListener("click", () => tr.remove());
  recalcPur(tr);
}

function recalcPur(tr) {
  const qty = parseFloat(tr.querySelector(".pur-qty").value) || 0;
  const price = parseFloat(tr.querySelector(".pur-price").value) || 0;
  const cost = qty * price;
  tr.querySelector(".pur-cost").textContent = cost.toFixed(2);
  tr.dataset.cost = cost;
}

function sumRows(sel) {
  let s = 0;
  document.querySelectorAll(sel + " tr").forEach((tr) => (s += parseFloat(tr.dataset.cost || 0)));
  return s;
}

function computeCalc() {
  const mat   = sumRows("#calc-mat-body");
  const op    = sumRows("#calc-op-body");
  const pur   = sumRows("#calc-pur-body");
  const total = mat + op + pur;
  document.getElementById("calc-breakdown").innerHTML =
    `<table class="data-table">` +
    `<tr><td>Материали</td><td class="right">${mat.toFixed(2)} €</td></tr>` +
    `<tr><td>Операции (труд)</td><td class="right">${op.toFixed(2)} €</td></tr>` +
    `<tr><td>Покупни изделия</td><td class="right">${pur.toFixed(2)} €</td></tr>` +
    `<tr><td><b>Себестойност</b></td><td class="right result-total">${total.toFixed(2)} €</td></tr>` +
    `</table>`;

  // Collect operation rows detail for PDF/project
  const opRows = [];
  document.querySelectorAll("#calc-op-body tr").forEach(tr => {
    const sel  = tr.querySelector(".o-op");
    const rec  = refOp.find(r => r.id === sel?.value);
    const opName = rec ? rec.operation : (sel?.options[sel.selectedIndex]?.text || "");
    if (!opName) return;
    const rate = parseFloat(tr.querySelector(".o-rate-input")?.value) || 0;
    const ops  = parseFloat(tr.querySelector(".o-ops")?.value) || 0;
    const desc = tr.querySelector(".o-desc")?.value || "";
    const cost = parseFloat(tr.dataset.cost) || 0;
    opRows.push({ opName, rate, ops, desc, cost });
  });

  lastCalcResult = { mat, op, pur, totalBGN: total, totalEUR: total, totalCost: total, opRows };

  document.getElementById("calc-add-proj-bar").classList.remove("hidden");
  document.getElementById("calc-proj-summary").textContent =
    `Мат. ${mat.toFixed(2)} + Труд ${op.toFixed(2)} + Покупни ${pur.toFixed(2)} = ${total.toFixed(2)} €`;
}

document.getElementById("calc-mat-add").addEventListener("click", addMatRow);
document.getElementById("calc-op-add").addEventListener("click", addOpRow);
document.getElementById("calc-pur-add").addEventListener("click", addPurRow);
document.getElementById("calc-compute").addEventListener("click", computeCalc);

document.getElementById("calc-add-to-proj-btn").addEventListener("click", () => {
  if (!lastCalcResult) return;
  const r = lastCalcResult;
  window._appProjectBar?.pickAndAdd({
    type: "calc",
    name: "Калкулатор операции",
    qty: 1,
    mat: Math.round(r.mat * 100) / 100,
    op: Math.round(r.op * 100) / 100,
    pur: Math.round(r.pur * 100) / 100,
    totalBGN: Math.round(r.totalBGN * 100) / 100,
    totalEUR: Math.round(r.totalEUR * 10000) / 10000,
    totalCost: Math.round(r.totalBGN * 100) / 100,
    opRows: r.opRows || [],
  }, {
    onDone: () => {
      window._calcSidebar?.render();
      const btn = document.getElementById("calc-add-to-proj-btn");
      btn.textContent = "✓ Добавено!";
      btn.style.background = "#15803d";
      setTimeout(() => { btn.textContent = "+ Добави към проекта"; btn.style.background = ""; }, 2000);
    },
  });
});

const IFRAME_TABS = { dxf: "frame-dxf", barcut: "frame-barcut", paint: "frame-paint", metali: "frame-metali", swiss: "frame-swiss", nesting: "frame-nesting", step: "frame-step" };

function activateTab(tabName) {
  document.querySelectorAll(".tab-btn[data-tab]").forEach((b) => b.classList.remove("active"));
  const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  if (btn) btn.classList.add("active");

  ["calc", "data", "dxf", "barcut", "paint", "metali", "swiss", "nesting", "step"].forEach((t) => {
    document.getElementById(`tab-${t}`)?.classList.toggle("hidden", t !== tabName);
  });

  if (IFRAME_TABS[tabName]) {
    const frame = document.getElementById(IFRAME_TABS[tabName]);
    if (frame && !frame.dataset.loaded) {
      frame.src = frame.dataset.src;
      frame.dataset.loaded = "1";
    }
  }
}

document.querySelectorAll(".tab-btn[data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => activateTab(btn.getAttribute("data-tab")));
});

document.getElementById("data-tab-btn").addEventListener("click", () => activateTab("data"));

// Auto-focus iframes on mouseenter so scroll works without clicking first
document.addEventListener("mouseover", (e) => {
  const frame = e.target.closest(".tool-frame");
  if (frame) try { frame.contentWindow?.focus(); } catch (_) {}
});

// --- помощни ---
function val(id) { return document.getElementById(id).value.trim(); }
function num(id) { const v = document.getElementById(id).value; return v === "" ? null : Number(v); }
function esc(s) {
  return (s ?? "").toString().replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
