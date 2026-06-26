// Споделен проект — localStorage persistence
// item.type = "dxf" | "barcut"

const KEY = "ds_project";

export function getProject() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { name: "", items: [] }; }
  catch { return { name: "", items: [] }; }
}

export function saveProject(p) {
  localStorage.setItem(KEY, JSON.stringify(p));
}

export function setProjectName(name) {
  const p = getProject();
  p.name = name;
  saveProject(p);
}

export function addItem(item) {
  const p = getProject();
  p.items.push(item);
  saveProject(p);
  return p;
}

export function removeItem(idx) {
  const p = getProject();
  p.items.splice(idx, 1);
  saveProject(p);
  return p;
}

export function clearProject() {
  saveProject({ name: "", items: [] });
}
