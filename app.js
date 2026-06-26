import { addItem } from "./project-store.js";

// --- Supabase клиент ---
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const loginView = document.getElementById("login-view");
const appView = document.getElementById("app-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const userEmail = document.getElementById("user-email");

// --- Вход / изход ---
function showView(session) {
  if (session) {
    loginView.classList.add("hidden");
    appView.classList.remove("hidden");
    userEmail.textContent = session.user.email;
    loadWorkshops();
    populateWorkshopSelect();
    loadMachines();
    loadOperationRates();
    loadLaserRates();
    loadMaterials();
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

// --- КАЛКУЛАТОР (Фаза 2) ---
const BGN_EUR = 1.95583;
const MARGIN_MAT_LABOR = 0.5; // +50% върху материали + труд
const MARGIN_LASER = 1.5; // +150% върху лазер

let refMat = [], refLaser = [], refOp = [];
let lastCalcResult = null;
let lastCalcResult = null;

async function initCalculator() {
  const [m, l, o] = await Promise.all([
    db.from("material_weights").select("*").order("profile_type", { ascending: true }).order("size", { ascending: true }),
    db.from("laser_rates").select("*").order("material", { ascending: true }).order("thickness_mm", { ascending: true }),
    db.from("operation_rates").select("*").order("operation", { ascending: true }),
  ]);
  refMat = m.data || [];
  refLaser = l.data || [];
  refOp = o.data || [];
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

function addLaserRow() {
  const tr = document.createElement("tr");
  const mats = uniq(refLaser.map((r) => r.material));
  tr.innerHTML =
    `<td><select class="l-mat">${mats.map((m) => `<option>${esc(m)}</option>`).join("")}</select></td>` +
    `<td><select class="l-th"></select></td>` +
    `<td><input type="number" step="any" class="l-len" /></td>` +
    `<td><input type="number" step="any" class="l-cont" value="0" /></td>` +
    `<td><input type="number" step="any" class="l-qty" value="1" /></td>` +
    `<td class="right l-cost">0.00</td>` +
    `<td><button type="button" class="ghost danger l-del">✕</button></td>`;
  document.getElementById("calc-laser-body").appendChild(tr);
  const matSel = tr.querySelector(".l-mat");
  const fillTh = () => {
    const ths = refLaser.filter((r) => r.material === matSel.value);
    tr.querySelector(".l-th").innerHTML = ths.map((r) => `<option value="${r.id}">${r.thickness_mm} мм</option>`).join("");
  };
  fillTh();
  matSel.addEventListener("change", fillTh);
  ["input", "change"].forEach((ev) => tr.addEventListener(ev, () => recalcLaser(tr)));
  tr.querySelector(".l-del").addEventListener("click", () => tr.remove());
  recalcLaser(tr);
}

function recalcLaser(tr) {
  const rec = refLaser.find((r) => r.id === tr.querySelector(".l-th").value);
  const len = parseFloat(tr.querySelector(".l-len").value) || 0;
  const cont = parseFloat(tr.querySelector(".l-cont").value) || 0;
  const qty = parseFloat(tr.querySelector(".l-qty").value) || 0;
  let cost = 0;
  if (rec) cost = (len * Number(rec.price_per_meter || 0) + cont * Number(rec.price_per_contour || 0)) * qty;
  tr.querySelector(".l-cost").textContent = cost.toFixed(2);
  tr.dataset.cost = cost;
}

function addOpRow() {
  const tr = document.createElement("tr");
  tr.innerHTML =
    `<td><select class="o-op">${refOp.map((r) => `<option value="${r.id}">${esc(r.operation)}${r.machine ? " / " + esc(r.machine) : ""}</option>`).join("")}</select></td>` +
    `<td class="right o-rate">—</td>` +
    `<td><input type="number" step="any" class="o-ops" value="1" /></td>` +
    `<td><input type="number" step="any" class="o-qty" value="1" /></td>` +
    `<td class="right o-cost">0.00</td>` +
    `<td><button type="button" class="ghost danger o-del">✕</button></td>`;
  document.getElementById("calc-op-body").appendChild(tr);
  ["input", "change"].forEach((ev) => tr.addEventListener(ev, () => recalcOp(tr)));
  tr.querySelector(".o-del").addEventListener("click", () => tr.remove());
  recalcOp(tr);
}

function recalcOp(tr) {
  const rec = refOp.find((r) => r.id === tr.querySelector(".o-op").value);
  const rate = rec ? Number(rec.rate || 0) : 0;
  const ops = parseFloat(tr.querySelector(".o-ops").value) || 0;
  const qty = parseFloat(tr.querySelector(".o-qty").value) || 0;
  const cost = rate * ops * qty;
  tr.querySelector(".o-rate").textContent = rec ? rate + " " + esc(rec.unit || "") : "—";
  tr.querySelector(".o-cost").textContent = cost.toFixed(2);
  tr.dataset.cost = cost;
}

function sumRows(sel) {
  let s = 0;
  document.querySelectorAll(sel + " tr").forEach((tr) => (s += parseFloat(tr.dataset.cost || 0)));
  return s;
}

function computeCalc() {
  const mat = sumRows("#calc-mat-body");
  const op = sumRows("#calc-op-body");
  const laser = sumRows("#calc-laser-body");
  const matLabor = (mat + op) * (1 + MARGIN_MAT_LABOR);
  const laserM = laser * (1 + MARGIN_LASER);
  const totalBGN = matLabor + laserM;
  const totalEUR = totalBGN / BGN_EUR;
  const qty = parseFloat(document.getElementById("calc-qty").value) || 1;
  const name = document.getElementById("calc-name").value.trim() || "Изделие";
  document.getElementById("calc-breakdown").innerHTML =
    `<table class="data-table">` +
    `<tr><td>Материали</td><td class="right">${mat.toFixed(2)} лв</td></tr>` +
    `<tr><td>Операции (труд)</td><td class="right">${op.toFixed(2)} лв</td></tr>` +
    `<tr><td>Материали + труд + надценка 50%</td><td class="right">${matLabor.toFixed(2)} лв</td></tr>` +
    `<tr><td>Лазер</td><td class="right">${laser.toFixed(2)} лв</td></tr>` +
    `<tr><td>Лазер + надценка 150%</td><td class="right">${laserM.toFixed(2)} лв</td></tr>` +
    `<tr><td><b>Цена за 1 брой</b></td><td class="right result-total">${totalEUR.toFixed(2)} €</td></tr>` +
    `<tr><td class="muted">(= ${totalBGN.toFixed(2)} лв)</td><td></td></tr>` +
    `<tr><td><b>За ${qty} бр.</b></td><td class="right"><b>${(totalEUR * qty).toFixed(2)} €</b></td></tr>` +
    `</table>`;

  lastCalcResult = { name, qty, mat, op, laser, matLabor, laserM, totalBGN, totalEUR };

  const bar = document.getElementById("calc-add-proj-bar");
  bar.classList.remove("hidden");
  document.getElementById("calc-proj-summary").textContent =
    `${name} — ${qty} бр. × ${totalEUR.toFixed(2)} € = ${(totalEUR * qty).toFixed(2)} €`;
}

document.getElementById("calc-mat-add").addEventListener("click", addMatRow);
document.getElementById("calc-laser-add").addEventListener("click", addLaserRow);
document.getElementById("calc-op-add").addEventListener("click", addOpRow);
document.getElementById("calc-compute").addEventListener("click", computeCalc);

document.getElementById("calc-add-to-proj-btn").addEventListener("click", () => {
  if (!lastCalcResult) return;
  const r = lastCalcResult;
  addItem({
    type: "calc",
    name: r.name,
    qty: r.qty,
    mat: Math.round(r.mat * 100) / 100,
    op: Math.round(r.op * 100) / 100,
    laser: Math.round(r.laser * 100) / 100,
    totalBGN: Math.round(r.totalBGN * 100) / 100,
    totalEUR: Math.round(r.totalEUR * 10000) / 10000,
    totalCost: Math.round(r.totalBGN * r.qty * 100) / 100,
  });

  const btn = document.getElementById("calc-add-to-proj-btn");
  btn.textContent = "✓ Добавено!";
  btn.style.background = "#15803d";
  setTimeout(() => { btn.textContent = "+ Добави към проекта"; btn.style.background = ""; }, 1500);
});

function activateTab(tabName) {
  document.querySelectorAll(".tab-btn[data-tab]").forEach((b) => b.classList.remove("active"));
  const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  if (btn) btn.classList.add("active");
  document.getElementById("tab-calc").classList.toggle("hidden", tabName !== "calc");
  document.getElementById("tab-data").classList.toggle("hidden", tabName !== "data");
}

document.querySelectorAll(".tab-btn[data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => activateTab(btn.getAttribute("data-tab")));
});

document.getElementById("data-tab-btn").addEventListener("click", () => activateTab("data"));

// --- помощни ---
function val(id) { return document.getElementById(id).value.trim(); }
function num(id) { const v = document.getElementById(id).value; return v === "" ? null : Number(v); }
function esc(s) {
  return (s ?? "").toString().replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
