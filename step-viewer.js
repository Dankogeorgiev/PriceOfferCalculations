/* STEP визуализатор — occt-import-js (OpenCASCADE WASM) + three.js */
const $ = id => document.getElementById(id);

let renderer, scene, camera, modelGroup, host, occt = null;
const orbit = { theta: -0.7, phi: 1.1, r: 200, target: new THREE.Vector3(), pan: new THREE.Vector3() };
const drag = { mode: null, x: 0, y: 0 };

function init() {
  host = $('c');
  renderer = new THREE.WebGLRenderer({ canvas: host, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa6b6, 0.95));
  const d1 = new THREE.DirectionalLight(0xffffff, 0.6); d1.position.set(1, 1.4, 1); scene.add(d1);
  const d2 = new THREE.DirectionalLight(0xffffff, 0.25); d2.position.set(-1, 0.5, -0.8); scene.add(d2);
  modelGroup = new THREE.Group(); scene.add(modelGroup);
  resize(); placeCam();

  host.addEventListener('pointerdown', e => { drag.mode = (e.button === 2) ? 'pan' : 'orbit'; drag.x = e.clientX; drag.y = e.clientY; });
  window.addEventListener('pointerup', () => drag.mode = null);
  window.addEventListener('pointermove', onMove);
  host.addEventListener('contextmenu', e => e.preventDefault());
  host.addEventListener('wheel', e => { e.preventDefault(); orbit.r *= (1 + e.deltaY * 0.0012); orbit.r = Math.max(0.1, orbit.r); placeCam(); }, { passive: false });
  window.addEventListener('resize', resize);
  animate();
}
function resize() { if (!renderer) return; const w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
function placeCam() {
  orbit.phi = Math.max(0.05, Math.min(Math.PI - 0.05, orbit.phi));
  const t = orbit.target.clone().add(orbit.pan);
  camera.position.set(
    t.x + orbit.r * Math.sin(orbit.phi) * Math.sin(orbit.theta),
    t.y + orbit.r * Math.cos(orbit.phi),
    t.z + orbit.r * Math.sin(orbit.phi) * Math.cos(orbit.theta));
  camera.lookAt(t);
}
function onMove(e) {
  if (!drag.mode) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
  if (drag.mode === 'orbit') { orbit.theta -= dx * 0.01; orbit.phi -= dy * 0.01; placeCam(); }
  else { // pan
    const k = orbit.r * 0.0016;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
    orbit.pan.addScaledVector(right, -dx * k).addScaledVector(up, dy * k); placeCam();
  }
}
function animate() { requestAnimationFrame(animate); if (renderer) renderer.render(scene, camera); }

function clearModel() {
  while (modelGroup.children.length) { const o = modelGroup.children.pop(); if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); modelGroup.remove(o); }
}

function buildModel(result) {
  clearModel();
  let tris = 0;
  for (const mesh of result.meshes) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(mesh.attributes.position.array, 3));
    if (mesh.attributes.normal) g.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.attributes.normal.array, 3));
    if (mesh.index) { g.setIndex(new THREE.Uint32BufferAttribute(mesh.index.array, 1)); tris += mesh.index.array.length / 3; }
    if (!mesh.attributes.normal) g.computeVertexNormals();
    const col = mesh.color ? new THREE.Color(mesh.color[0], mesh.color[1], mesh.color[2]) : new THREE.Color(0x9aa6b4);
    const mat = new THREE.MeshStandardMaterial({ color: col, metalness: 0.25, roughness: 0.55, side: THREE.DoubleSide });
    modelGroup.add(new THREE.Mesh(g, mat));
  }
  // напасни камерата
  const box = new THREE.Box3().setFromObject(modelGroup);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  orbit.target.copy(center); orbit.pan.set(0, 0, 0);
  const diag = size.length() || 100;
  orbit.r = diag * 1.25; orbit.theta = -0.7; orbit.phi = 1.05;
  camera.near = diag / 500; camera.far = diag * 50; camera.updateProjectionMatrix();
  placeCam();
  return { tris, size };
}

async function ensureOcct() {
  if (occt) return occt;
  occt = await occtimportjs({ locateFile: f => 'vendor/' + f });
  return occt;
}

async function loadBuffer(buffer, name) {
  setStatus('Чете STEP…');
  try {
    const o = await ensureOcct();
    const result = o.ReadStepFile(new Uint8Array(buffer), null);
    if (!result || !result.success || !result.meshes || !result.meshes.length) { setStatus('Файлът не можа да се прочете.', true); return; }
    const { tris, size } = buildModel(result);
    $('status').style.display = 'none';
    const info = $('info'); info.style.display = 'block';
    $('i_name').textContent = name.length > 22 ? name.slice(0, 20) + '…' : name;
    $('i_solids').textContent = result.meshes.length;
    $('i_bbox').textContent = `${size.x.toFixed(0)}×${size.y.toFixed(0)}×${size.z.toFixed(0)} мм`;
    $('i_tris').textContent = tris.toLocaleString('bg');
  } catch (e) { setStatus('Грешка: ' + e.message, true); }
}
function setStatus(t, err) { const s = $('status'); s.style.display = 'block'; s.textContent = t; s.className = 'status' + (err ? ' err' : ''); }

function readFile(file) { const r = new FileReader(); r.onload = () => loadBuffer(r.result, file.name); r.readAsArrayBuffer(file); }

// UI
$('loadBtn').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', e => { if (e.target.files[0]) readFile(e.target.files[0]); });
['dragenter', 'dragover'].forEach(ev => window.addEventListener(ev, e => { e.preventDefault(); $('drop').classList.add('show'); }));
['dragleave', 'drop'].forEach(ev => window.addEventListener(ev, e => { e.preventDefault(); if (ev === 'drop' || e.clientX === 0) $('drop').classList.remove('show'); }));
window.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) readFile(f); });

init();
// зареди ядрото предварително
ensureOcct().then(() => { $('loadBtn').disabled = false; setStatus('Зареди или пусни STEP файл, за да започнеш.'); })
  .catch(e => setStatus('CAD ядрото не се зареди: ' + e.message, true));
// тестова кука за автоматизирано зареждане
window.__loadBuffer = loadBuffer;
