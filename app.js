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
    loadMaterials();
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

// --- помощни ---
function val(id) { return document.getElementById(id).value.trim(); }
function num(id) { const v = document.getElementById(id).value; return v === "" ? null : Number(v); }
function esc(s) {
  return (s ?? "").toString().replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
