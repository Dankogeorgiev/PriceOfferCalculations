/**
 * project-store.js — множество именувани проекти в localStorage
 *
 * Формат: { projects: [{id, name, items, createdAt}], currentId: "..." }
 * Мигрира автоматично от стар формат ds_project (единичен проект).
 */

const KEY = "ds_projects_v2";
const OLD_KEY = "ds_project";

function getStore() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);

    // Миграция от стар формат
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      const p = JSON.parse(old);
      if (p && Array.isArray(p.items)) {
        const migrated = _makeStore([{ id: _uid(), name: p.name || "Проект 1", items: p.items, createdAt: new Date().toISOString() }]);
        _save(migrated);
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

function _save(s) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

function _uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ---- Публично API ----

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
    // Създай проект ако няма нито един
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
