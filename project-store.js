/**
 * project-store.js — множество именувани проекти в localStorage + Supabase sync.
 *
 * Формат: { projects: [{id, name, items, createdAt}], currentId: "..." }
 * Мигрира автоматично от стар формат ds_project (единичен проект).
 *
 * Supabase синхронизация:
 *   Извикай initSync(supabaseUrl, supabaseKey) веднъж след логин.
 *   Всяка промяна се записва async в settings таблицата (key = ds_projects_v2).
 */

const KEY = "ds_projects_v2";
const OLD_KEY = "ds_project";

let _sb = null; // Supabase client след initSync

// ---------- Вътрешни помощни ----------

function _getLocal() {
  try {
    const raw = localStorage.getItem(KEY);
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
  localStorage.setItem(KEY, JSON.stringify(s));
}

function _uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function _saveRemote(s) {
  if (!_sb) return;
  try {
    await _sb.from("settings").upsert(
      { key: KEY, value: JSON.stringify(s) },
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

/**
 * Трябва да се извика веднъж след вход в системата.
 * Зарежда проектите от Supabase и обединява с localStorage.
 * Връща Promise, след което store-а е актуален.
 */
export async function initSync(supabaseUrl, supabaseKey) {
  try {
    // CDN-ът излага глобална `supabase` (не window.supabase в модул контекст)
    const mod = (typeof supabase !== "undefined" ? supabase : null)
              || window.supabase || window.__supabase;
    if (!mod?.createClient) return;
    _sb = mod.createClient(supabaseUrl, supabaseKey);

    const { data } = await _sb
      .from("settings")
      .select("value")
      .eq("key", KEY)
      .single();

    const local = _getLocal();

    if (data?.value) {
      let remote;
      try { remote = JSON.parse(data.value); } catch { remote = null; }

      if (remote && Array.isArray(remote.projects)) {
        // Обединяваме: remote проекти по id; местните проекти, ако ги няма в remote, се добавят
        const byId = {};
        for (const p of remote.projects) byId[p.id] = p;
        for (const p of local.projects) {
          if (!byId[p.id]) byId[p.id] = p; // само нови локални
        }
        const projects = Object.values(byId);
        const merged = {
          projects,
          currentId: remote.currentId || local.currentId || projects[0]?.id || null,
        };
        _saveLocal(merged);
        return;
      }
    }

    // Няма данни в Supabase — качваме локалните (ако има)
    if (local.projects.length > 0) {
      await _saveRemote(local);
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
  const proj = { id: _uid(), name: name || "Нов проект", items: [], createdAt: new Date().toISOString() };
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
    p = { id: _uid(), name: "Проект 1", items: [], createdAt: new Date().toISOString() };
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
