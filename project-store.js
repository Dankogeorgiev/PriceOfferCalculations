/**
 * project-store.js — споделени проекти между всички администратори + Supabase sync.
 *
 * Модел: всеки потребител пише в settings таблицата под свой ключ
 *   "ds_projects_v2_<userId>".  При зареждане се четат ВСИЧКИ такива редове
 *   и се обединяват в един списък — всеки вижда проектите на всички.
 *
 * Локален кеш (localStorage) = обединения списък за бързо зареждане без мрежа.
 *
 * Извикай initSync(url, anonKey) веднъж след логин.
 */

const KEY_PREFIX = "ds_projects_v2";
const LOCAL_KEY  = "ds_projects_v2";   // localStorage ключ (обединен)
const OLD_KEY    = "ds_project";

let _sb      = null;  // Supabase client
let _userKey = null;  // "ds_projects_v2_<userId>" — само моите проекти в Supabase

// ---------- localStorage ----------

function _getLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) return JSON.parse(raw);
    // Миграция от стар формат
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      const p = JSON.parse(old);
      if (p && Array.isArray(p.items)) {
        const migrated = _makeStore([{ id: _uid(), name: p.name || "Проект 1", items: p.items, createdAt: new Date().toISOString() }]);
        _saveLocal(migrated);
        localStorage.removeItem(OLD_KEY);
        return migrated;
      }
    }
  } catch { /* ignore */ }
  return _makeStore([]);
}

function _makeStore(projects) {
  return { projects, currentId: projects[0]?.id || null };
}

function _saveLocal(s) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(s));
}

function _uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ---------- Supabase remote ----------

// Записва САМО проектите на текущия потребител под неговия ключ
async function _saveRemote(s) {
  if (!_sb || !_userKey) return;
  try {
    // Взимаме само "моите" проекти — тези, маркирани като мои, или всичко при липса на маркиране
    const myProjects = s.projects.filter(p => !p._owner || p._owner === _userKey);
    const payload = { projects: myProjects, currentId: s.currentId };
    await _sb.from("settings").upsert(
      { key: _userKey, value: JSON.stringify(payload) },
      { onConflict: "key" }
    );
  } catch (e) {
    console.warn("[project-store] remote save failed:", e);
  }
}

function _save(s) {
  _saveLocal(s);
  _saveRemote(s); // fire-and-forget
}

function getStore() {
  return _getLocal();
}

// ---------- Supabase инициализация ----------

export async function initSync(supabaseUrl, supabaseKey) {
  try {
    const mod = (typeof supabase !== "undefined" ? supabase : null)
              || window.supabase || window.__supabase;
    if (!mod?.createClient) return;
    _sb = mod.createClient(supabaseUrl, supabaseKey);

    // Вземи текущия потребител
    const { data: { session } } = await _sb.auth.getSession();
    if (!session?.user) return; // не е влязъл
    _userKey = `${KEY_PREFIX}_${session.user.id}`;

    // Зареди проектите на ВСИЧКИ потребители
    const { data: rows } = await _sb
      .from("settings")
      .select("key, value")
      .like("key", `${KEY_PREFIX}_%`);

    const byId = {};

    // Първо от Supabase — всички потребители
    if (rows) {
      for (const row of rows) {
        try {
          const store = JSON.parse(row.value);
          for (const p of (store.projects || [])) {
            byId[p.id] = { ...p, _owner: row.key };
          }
        } catch { /* skip corrupt row */ }
      }
    }

    // После добавяме локалните, ако са нови (не ги има в Supabase)
    const local = _getLocal();
    for (const p of local.projects) {
      if (!byId[p.id]) byId[p.id] = { ...p, _owner: _userKey };
    }

    const projects = Object.values(byId);
    const merged = {
      projects,
      currentId: local.currentId || projects[0]?.id || null,
    };
    _saveLocal(merged);

    // Ако имаме локални проекти без owner, качи ги в Supabase
    const hasUnsyncedLocal = local.projects.some(p => !byId[p.id] || byId[p.id]._owner !== _userKey);
    if (hasUnsyncedLocal || local.projects.length > 0) {
      await _saveRemote(merged);
    }

  } catch (e) {
    console.warn("[project-store] initSync failed:", e);
  }
}

// ---------- Публично API ----------

export function getProjects() {
  return getStore().projects;
}

export function getCurrentProject() {
  const s = getStore();
  return s.projects.find(p => p.id === s.currentId) || s.projects[0] || null;
}

export function createProject(name) {
  const s = getStore();
  const proj = {
    id: _uid(),
    name: name || "Нов проект",
    items: [],
    createdAt: new Date().toISOString(),
    _owner: _userKey || LOCAL_KEY,
  };
  s.projects.push(proj);
  s.currentId = proj.id;
  _save(s);
  return proj;
}

export function switchProject(id) {
  const s = getStore();
  if (s.projects.find(p => p.id === id)) {
    s.currentId = id;
    _save(s);
  }
  return getCurrentProject();
}

export function setProjectName(name) {
  const s = getStore();
  const p = s.projects.find(p => p.id === s.currentId);
  if (p) { p.name = name; _save(s); }
}

export function addItem(item) {
  const s = getStore();
  let p = s.projects.find(p => p.id === s.currentId);
  if (!p) {
    p = {
      id: _uid(),
      name: "Проект 1",
      items: [],
      createdAt: new Date().toISOString(),
      _owner: _userKey || LOCAL_KEY,
    };
    s.projects.push(p);
    s.currentId = p.id;
  }
  p.items.push(item);
  _save(s);
  return p;
}

export function removeItem(idx) {
  const s = getStore();
  const p = s.projects.find(p => p.id === s.currentId);
  if (p) { p.items.splice(idx, 1); _save(s); }
  return getCurrentProject();
}

export function clearCurrentProject() {
  const s = getStore();
  const p = s.projects.find(p => p.id === s.currentId);
  if (p) { p.items = []; _save(s); }
}

export function addItemToProject(projectId, item) {
  const s = getStore();
  const p = s.projects.find(p => p.id === projectId);
  if (!p) return null;
  p.items.push(item);
  _save(s);
  return p;
}

export function deleteProject(id) {
  const s = getStore();
  s.projects = s.projects.filter(p => p.id !== id);
  if (s.currentId === id) s.currentId = s.projects[0]?.id || null;
  _save(s);
}
