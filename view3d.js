// Tampilan 3D denah kelas (three.js + assets/denah-kelas.glb).
// Modul ini dimuat malas oleh app.js hanya saat pengguna membuka mode 3D.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const MODEL_URL = 'assets/denah-kelas.glb';
const TOTAL = 24;
const ACCENT = 0x2563eb;

let renderer, scene, camera, controls, raycaster, container;
let onPick = () => {};
let seatPos = {};      // n -> { x, z, obj, sprite, c }
let pickables = [];
let seats = {};
let selected = null;
let active = false;
let looping = false;
let loaded = false;
let route = null;      // { group, pts, total, cones, ring }
let tween = null;
let fpv = false;
let entrance = { x: 5, z: 3.4 };   // tepi sisi koridor (+x), dekat depan kelas
const owner = new Map();            // objek kursi/meja di model -> nomor kursi (penomoran 2D/server)
let floor = { minX: -5, maxX: 5, minZ: -4.25, maxZ: 4.25 };
let laneFrontZ = 2.7;
const clock = new THREE.Clock();
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

const dark = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

// ---------- Label kursi (sprite berbasis canvas)
function paintLabel(sprite, n, name, state) {
  const cv = sprite.userData.canvas;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  const hot = state === 'target';
  g.fillStyle = hot ? '#2563eb' : 'rgba(255,255,255,0.94)';
  g.strokeStyle = hot ? '#ffffff' : 'rgba(51,65,85,0.35)';
  g.lineWidth = 6;
  const w = cv.width - 8, h = cv.height - 8, r = 26;
  g.beginPath();
  g.roundRect(4, 4, w, h, r);
  g.fill(); g.stroke();
  g.fillStyle = hot ? '#dbeafe' : '#64748b';
  g.font = '600 34px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText('Kursi ' + n, cv.width / 2, 46);
  g.fillStyle = hot ? '#ffffff' : (name ? '#1f2a3d' : '#94a3b8');
  g.font = '800 46px system-ui, sans-serif';
  const short = name ? name.trim().split(/\s+/).slice(0, 2).join(' ') : 'Kosong';
  let t = short;
  while (g.measureText(t).width > cv.width - 30 && t.length > 3) t = t.slice(0, -2);
  if (t !== short) t += '…';
  g.fillText(t, cv.width / 2, 100);
  sprite.material.map.needsUpdate = true;
}
function makeSprite(n) {
  const cv = document.createElement('canvas');
  cv.width = 320; cv.height = 128;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true }));
  sp.userData = { canvas: cv, seat: n };
  sp.scale.set(0.6, 0.24, 1);
  sp.renderOrder = 10;
  return sp;
}
function refreshLabels() {
  for (let n = 1; n <= TOTAL; n++) {
    const p = seatPos[n];
    if (!p) continue;
    const isT = n === selected;
    paintLabel(p.sprite, n, (seats[n] || '').trim(), isT ? 'target' : 'idle');
    p.sprite.material.opacity = selected && !isT ? 0.5 : 1;
    const k = isT ? 1.35 : 1;
    p.sprite.scale.set(0.6 * k, 0.24 * k, 1);
    p.sprite.position.y = isT ? 1.4 : 1.18;
    p.sprite.material.depthTest = !isT;
    p.sprite.visible = !fpv;
  }
}

// ---------- Highlight kursi
function tint(obj, color, intensity) {
  obj.traverse((o) => {
    if (o.isMesh && o.material && o.material.emissive) {
      o.material.emissive.setHex(color);
      o.material.emissiveIntensity = intensity;
    }
  });
}
function refreshHighlight() {
  for (let n = 1; n <= TOTAL; n++) tint(seatPos[n].obj, 0x000000, 0);
  if (!selected) return;
  const mate = selected % 2 ? selected + 1 : selected - 1;
  tint(seatPos[mate].obj, 0x60a5fa, 0.35);
  tint(seatPos[selected].obj, ACCENT, 0.9);
}

// ---------- Rute 3D
function routePts(n) {
  const p = seatPos[n];
  const laneZ = laneFrontZ;                // lorong di depan baris meja pertama
  const ax = p.c ? p.x - 0.5 : p.x + 0.5;  // lorong di sisi kursi
  const y = 0.05;
  const inX = entrance.x - 1.2;            // jalur masuk dari pintu
  const raw = [
    [entrance.x + 0.5, y, entrance.z],
    [inX, y, entrance.z],
    [inX, y, laneZ],
    [ax, y, laneZ],
    [ax, y, p.z],
    [p.x, y, p.z]
  ].map((a) => new THREE.Vector3(...a));
  // buang titik kembar agar tidak ada ruas nol
  return raw.filter((v, i) => i === 0 || v.distanceTo(raw[i - 1]) > 1e-3);
}
function clearRoute() {
  if (!route) return;
  scene.remove(route.group);
  route.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  route = null;
}
function buildRoute(n) {
  clearRoute();
  const pts = routePts(n);
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.55 });
  let total = 0;
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = a.distanceTo(b);
    segs.push({ a, b, len, start: total });
    total += len;
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, len, 10), mat);
    cyl.position.copy(a).lerp(b, 0.5);
    cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    group.add(cyl);
    const j = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), mat);
    j.position.copy(b);
    group.add(j);
  }
  // penanda mulai (hijau) di pintu
  const start = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 24), new THREE.MeshBasicMaterial({ color: 0x16a34a }));
  start.position.copy(pts[0]);
  group.add(start);
  const startLabel = makeSprite(0);
  paintStart(startLabel);
  startLabel.position.set(pts[0].x, 0.85, pts[0].z + 0.2);
  startLabel.scale.set(0.7, 0.28, 1);
  group.add(startLabel);
  // panah bergerak
  const coneGeo = new THREE.ConeGeometry(0.085, 0.22, 14); coneGeo.rotateX(Math.PI / 2);
  const coneMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const cones = [];
  const count = Math.max(4, Math.round(total / 0.7));
  for (let i = 0; i < count; i++) { const c = new THREE.Mesh(coneGeo, coneMat); c.position.y = 0.12; group.add(c); cones.push(c); }
  // cincin di kursi tujuan
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.035, 10, 40), new THREE.MeshBasicMaterial({ color: ACCENT }));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(seatPos[n].x, 0.06, seatPos[n].z);
  group.add(ring);
  scene.add(group);
  route = { group, pts, segs, total, cones, ring };
}
function paintStart(sp) {
  const cv = sp.userData.canvas, g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#16a34a'; g.beginPath(); g.roundRect(4, 20, cv.width - 8, 88, 30); g.fill();
  g.fillStyle = '#fff'; g.font = '800 58px system-ui, sans-serif'; g.textAlign = 'center';
  g.fillText('MULAI', cv.width / 2, 82);
  sp.material.map.needsUpdate = true;
}
function pointAt(d) {
  for (const s of route.segs) {
    if (d <= s.start + s.len) {
      const t = (d - s.start) / s.len;
      return { p: s.a.clone().lerp(s.b, t), dir: s.b.clone().sub(s.a).normalize() };
    }
  }
  const s = route.segs[route.segs.length - 1];
  return { p: s.b.clone(), dir: s.b.clone().sub(s.a).normalize() };
}
function animateRoute(t) {
  if (!route) return;
  const spacing = route.total / route.cones.length;
  route.cones.forEach((c, i) => {
    const d = (t * 0.9 + i * spacing) % route.total;
    const { p, dir } = pointAt(d);
    c.position.set(p.x, 0.12, p.z);
    c.lookAt(p.x + dir.x, 0.12, p.z + dir.z);
  });
  const s = 1 + 0.12 * Math.sin(t * 4);
  route.ring.scale.set(s, s, s);
}

// ---------- Kamera
function flyTo(pos, target, ms = 800) {
  tween = { t0: performance.now(), ms, p0: camera.position.clone(), t0v: controls.target.clone(), p1: pos, t1: target };
}
function stepTween(now) {
  if (!tween) return;
  const k = Math.min(1, (now - tween.t0) / tween.ms);
  const e = ease(k);
  camera.position.lerpVectors(tween.p0, tween.p1, e);
  controls.target.lerpVectors(tween.t0v, tween.t1, e);
  if (k >= 1) tween = null;
}
function leaveFpv() {
  if (!fpv) return;
  fpv = false;
  controls.minDistance = 2;
  controls.enablePan = true;
  Object.values(seatPos).forEach((p) => { p.obj.visible = true; });
  refreshLabels();
}
export function setView(name) {
  if (!loaded) return;
  if (name === 'kursi') {
    if (!selected) return;
    const p = seatPos[selected];
    fpv = true;
    p.obj.visible = false;
    refreshLabels();
    controls.minDistance = 0.01;
    controls.enablePan = false;
    flyTo(new THREE.Vector3(p.x, 1.18, p.z - 0.05), new THREE.Vector3(p.x, 1.1, p.z + 0.6), 900);
    return;
  }
  leaveFpv();
  if (name === 'atas') flyTo(new THREE.Vector3(0.001, 12.5, -0.9), new THREE.Vector3(0, 0, 0.3));
  else if (name === 'kursi-luar' && selected) {
    const p = seatPos[selected];
    flyTo(new THREE.Vector3(p.x + 2.8, 2.7, p.z + 2.4), new THREE.Vector3(p.x, 0.4, p.z));
  } else flyTo(new THREE.Vector3(10.5, 7.5, 4.5), new THREE.Vector3(0, 0, 0.4));
}

// ---------- Publik
export function setSeats(s) {
  seats = s || {};
  if (loaded) refreshLabels();
}
export function select(n) {
  selected = n;
  if (!loaded) return;
  refreshHighlight();
  refreshLabels();
  if (!n) { clearRoute(); leaveFpv(); return; }
  buildRoute(n);
  if (fpv) setView('kursi');
  else { leaveFpv(); setView('kursi-luar'); }
}
export function setActive(on) {
  active = on;
  if (on && !looping) { looping = true; resize(); clock.start(); loop(); }
}
export function resize() {
  if (!renderer || !container) return;
  const w = container.clientWidth, h = container.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
export function isFirstPerson() { return fpv; }

export async function init(el, opts = {}) {
  container = el;
  onPick = opts.onPick || onPick;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;';
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(dark() ? 0x0f1623 : 0xe9eef6);
  camera = new THREE.PerspectiveCamera(45, 1, 0.05, 80);
  camera.position.set(10.5, 7.5, 4.5);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 2;
  controls.maxDistance = 22;
  controls.maxPolarAngle = Math.PI * 0.499;
  controls.target.set(0, 0, 0.4);
  controls.addEventListener('start', () => { tween = null; });

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.25));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(4, 9, 6);
  scene.add(sun);

  const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
  const model = gltf.scene;
  scene.add(model);
  model.updateMatrixWorld(true);

  const byName = {};
  model.traverse((o) => { if (o.name && !byName[o.name]) byName[o.name] = o; });
  const box = (o) => new THREE.Box3().setFromObject(o);

  if (byName.lantai) {
    const b = box(byName.lantai);
    floor = { minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z };
  }
  // Pintu masuk tidak ada di model; sisi +x (koridor) terbuka. Titik masuk = tepi lantai sisi +x dekat depan.
  entrance = { x: floor.maxX, z: floor.maxZ - 0.85 };

  // Penomoran di model (kursi_1..24) berbeda dari denah 2D / server.7mit, jadi kursi dipetakan lewat posisi:
  // baris dari depan (+z) ke belakang, kolom dari kiri (+x) ke kanan; 2D: banjar = kolom/2, nomor = banjar*6 + baris*2 + sisi + 1.
  const nodes = [];
  for (let m = 1; m <= TOTAL; m++) {
    const obj = byName['kursi_' + m];
    if (!obj) throw new Error('Node kursi_' + m + ' tidak ada di model');
    const c = box(obj).getCenter(new THREE.Vector3());
    nodes.push({ m, obj, desk: byName['meja_' + m], x: c.x, z: c.z });
  }
  const rows = [];
  nodes.slice().sort((p, q) => q.z - p.z).forEach((nd) => {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].z - nd.z) < 0.25) row.push(nd); else rows.push([nd]);
  });
  const grid = rows.length === 3 && rows.every((r) => r.length === 8);
  const number = new Map();
  if (grid) {
    rows.forEach((r, ri) => r.sort((p, q) => q.x - p.x).forEach((nd, k) => number.set(nd, (k >> 1) * 6 + ri * 2 + (k & 1) + 1)));
    const deskFront = Math.max(...nodes.map((nd) => (nd.desk ? box(nd.desk).max.z : nd.z)));
    laneFrontZ = (deskFront + (floor.maxZ - 0.25)) / 2;
  } else {
    console.warn('Susunan kursi di model bukan 3 baris x 8; memakai nomor node apa adanya.');
    nodes.forEach((nd) => number.set(nd, nd.m));
  }

  nodes.forEach((nd) => {
    const n = number.get(nd);
    // klon material agar highlight satu kursi tidak mengubah semuanya
    nd.obj.traverse((o) => { if (o.isMesh) o.material = o.material.clone(); });
    const sprite = makeSprite(n);
    sprite.position.set(nd.x, 1.18, nd.z);
    scene.add(sprite);
    seatPos[n] = { x: nd.x, z: nd.z, obj: nd.obj, desk: nd.desk, sprite, c: (n - 1) % 2 };
    owner.set(nd.obj, n);
    if (nd.desk) owner.set(nd.desk, n);
    pickables.push(nd.obj, sprite);
    if (nd.desk) pickables.push(nd.desk);
  });

  raycaster = new THREE.Raycaster();
  let down = null;
  const cv = renderer.domElement;
  const ndc = (e) => {
    const r = cv.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  const seatAt = (e) => {
    raycaster.setFromCamera(ndc(e), camera);
    const hits = raycaster.intersectObjects(pickables, true);
    for (const h of hits) {
      let o = h.object;
      if (o.userData && o.userData.seat) return o.userData.seat;
      while (o) {
        if (owner.has(o)) return owner.get(o);
        o = o.parent;
      }
    }
    return null;
  };
  cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  cv.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 5) return;
    const n = seatAt(e);
    if (n) onPick(n);
  });
  cv.addEventListener('pointermove', (e) => {
    if (e.buttons) return;
    cv.style.cursor = seatAt(e) ? 'pointer' : 'grab';
  });

  loaded = true;
  refreshLabels();
  refreshHighlight();
  if (selected) select(selected);
  resize();
  new ResizeObserver(resize).observe(container);
  return { floor, entrance };
}

function loop() {
  if (!active || !renderer) { looping = false; return; }
  requestAnimationFrame(loop);
  const now = performance.now();
  stepTween(now);
  controls.update();
  animateRoute(clock.getElapsedTime());
  renderer.render(scene, camera);
}
