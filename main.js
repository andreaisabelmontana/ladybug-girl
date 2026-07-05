import * as THREE from 'three';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';

// ----------------------------------------------------------------------------
// Tunables
// ----------------------------------------------------------------------------
const WORLD_RADIUS   = 95;
const TARGET_HEIGHT  = 1.7;      // storybook scale — smaller, grounded
let   MODEL_FACE_OFF = 0;        // tuned after first look
const WALK_SPEED     = 4.2;
const RUN_SPEED      = 7.6;
const TURN_LERP      = 0.18;
const CAM_DIST       = 4.2;      // pulled in so she fills the screen
const CAM_HEIGHT     = 2.1;
const CAM_LOOK_Y     = 1.0;      // aim a touch below her head

// ----------------------------------------------------------------------------
// Renderer + storybook outline pass
// ----------------------------------------------------------------------------
const VW = () => innerWidth || 1280;   // fall back to a sane size if the tab
const VH = () => innerHeight || 800;   // loads hidden/backgrounded (0×0 viewport)
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(VW(), VH());
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.id = 'app';
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeaf3e0);          // warm paper-cream sky
scene.fog = new THREE.Fog(0xeef4e6, 48, 125);

const camera = new THREE.PerspectiveCamera(52, VW() / VH(), 0.1, 400);
camera.position.set(0, CAM_HEIGHT, -CAM_DIST);

// ----------------------------------------------------------------------------
// Lights — soft, illustrated
// ----------------------------------------------------------------------------
scene.add(new THREE.HemisphereLight(0xffffff, 0x9bbf7a, 1.05));
const sun = new THREE.DirectionalLight(0xfff2d0, 1.7);
sun.position.set(26, 38, 16);
sun.castShadow = true;
sun.shadow.mapSize.set(1536, 1536);
sun.shadow.camera.near = 1; sun.shadow.camera.far = 130;
const s = 55;
sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
sun.shadow.camera.top = s;   sun.shadow.camera.bottom = -s;
sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);

// ----------------------------------------------------------------------------
// Cel-shading gradient ramp (gives flat "drawn" bands)
// ----------------------------------------------------------------------------
function toonRamp() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 1;
  const x = c.getContext('2d');
  ['#9a9a9a', '#c8c8c8', '#ececec', '#ffffff'].forEach((col, i) => { x.fillStyle = col; x.fillRect(i, 0, 1, 1); });
  const t = new THREE.CanvasTexture(c);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}
const RAMP = toonRamp();
function toon(color, opts = {}) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: RAMP, ...opts });
  return m;
}

// ----------------------------------------------------------------------------
// Watercolor textures (procedural — soft washes + paper speckle)
// ----------------------------------------------------------------------------
function watercolor(base, blotches, w = 256) {
  const c = document.createElement('canvas'); c.width = c.height = w;
  const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, w, w);
  for (const [col, n, rmax] of blotches) {
    for (let i = 0; i < n; i++) {
      const px = Math.random() * w, py = Math.random() * w, r = (0.2 + Math.random()) * rmax;
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, col.replace('A', (0.10 + Math.random() * 0.22).toFixed(2)));
      g.addColorStop(1, col.replace('A', '0'));
      x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
    }
  }
  // paper speckle
  for (let i = 0; i < w * 6; i++) {
    x.fillStyle = `rgba(60,50,30,${Math.random() * 0.05})`;
    x.fillRect(Math.random() * w, Math.random() * w, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const noOutline = (m) => { m.userData.outlineParameters = { visible: false }; return m; };

// ----------------------------------------------------------------------------
// Ground
// ----------------------------------------------------------------------------
const groundTex = watercolor('#8cc06a', [
  ['rgba(96,150,70,A)', 70, 90], ['rgba(150,196,120,A)', 60, 70],
  ['rgba(70,120,60,A)', 50, 60], ['rgba(120,170,90,A)', 60, 80],
]);
groundTex.repeat.set(26, 26);
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(WORLD_RADIUS + 30, 64),
  noOutline(toon(0xffffff, { map: groundTex }))
);
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
scene.add(ground);

// ----------------------------------------------------------------------------
// Grass (instanced blades, watercolor blade texture, no outline)
// ----------------------------------------------------------------------------
const colliders = [];
const tmpObj = new THREE.Object3D();
const tmpCol = new THREE.Color();
function scatterPoint(minR = 6, maxR = WORLD_RADIUS) {
  const a = Math.random() * Math.PI * 2;
  const r = minR + Math.sqrt(Math.random()) * (maxR - minR);
  return [Math.cos(a) * r, Math.sin(a) * r];
}
function bladeTexture() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 64;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 64, 0, 0);
  g.addColorStop(0, '#4f8a36'); g.addColorStop(.6, '#73b84e'); g.addColorStop(1, '#a6db74');
  x.fillStyle = g;
  x.beginPath(); x.moveTo(16, 64); x.quadraticCurveTo(3, 30, 14, 1);
  x.quadraticCurveTo(29, 30, 16, 64); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
(function makeGrass() {
  const COUNT = 2600;
  const geo = new THREE.PlaneGeometry(0.42, 0.72); geo.translate(0, 0.36, 0);
  const mat = noOutline(new THREE.MeshToonMaterial({
    map: bladeTexture(), gradientMap: RAMP, alphaTest: 0.5, side: THREE.DoubleSide,
  }));
  mat.shadowSide = THREE.DoubleSide;
  const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
  mesh.receiveShadow = true;
  for (let i = 0; i < COUNT; i++) {
    const [px, pz] = scatterPoint(0, WORLD_RADIUS + 8);
    tmpObj.position.set(px, 0, pz);
    tmpObj.rotation.set(0, Math.random() * Math.PI, 0);
    const sc = 0.7 + Math.random() * 1.2;
    tmpObj.scale.set(sc, sc * (0.7 + Math.random() * 0.7), sc);
    tmpObj.updateMatrix(); mesh.setMatrixAt(i, tmpObj.matrix);
    tmpCol.setHSL(0.26 + Math.random() * 0.08, 0.5, 0.55 + Math.random() * 0.18);
    mesh.setColorAt(i, tmpCol);
  }
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
})();

// ----------------------------------------------------------------------------
// Props — trees / logs / rocks / mushrooms / flowers (toon + watercolor)
// ----------------------------------------------------------------------------
const barkTex  = watercolor('#7a5230', [['rgba(60,40,22,A)', 30, 30], ['rgba(150,110,70,A)', 30, 26]], 128);
const leafTexA = watercolor('#4f9a3e', [['rgba(60,120,52,A)', 50, 60], ['rgba(150,200,110,A)', 50, 50], ['rgba(40,90,45,A)', 40, 45]]);
const leafTexB = watercolor('#3f8a46', [['rgba(40,110,60,A)', 50, 60], ['rgba(130,190,120,A)', 50, 50], ['rgba(30,80,50,A)', 40, 45]]);
const barkMat  = toon(0xffffff, { map: barkTex });
const leafMatA = toon(0xffffff, { map: leafTexA });
const leafMatB = toon(0xffffff, { map: leafTexB });
const rockMat  = toon(0x9a9a93);
const logMat   = toon(0xffffff, { map: barkTex });
const ringMat  = toon(0xc79a5b);

function makeTree(x, z) {
  const g = new THREE.Group();
  const h = 3 + Math.random() * 3;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.36, h, 7), barkMat);
  trunk.position.y = h / 2; trunk.castShadow = true; g.add(trunk);
  const layers = 2 + (Math.random() * 2 | 0);
  for (let i = 0; i < layers; i++) {
    const r = 2.0 - i * 0.45 + Math.random() * 0.2;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, 1.9, 8), i % 2 ? leafMatB : leafMatA);
    cone.position.y = h - 0.3 + i * 1.2; cone.castShadow = true; g.add(cone);
  }
  g.position.set(x, 0, z); g.rotation.y = Math.random() * Math.PI;
  const sc = 0.85 + Math.random() * 0.8; g.scale.setScalar(sc);
  scene.add(g); colliders.push({ x, z, r: 0.55 * sc });
}
function makeLog(x, z) {
  const g = new THREE.Group();
  const len = 1.8 + Math.random() * 2.2, rad = 0.3 + Math.random() * 0.18;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, 12), logMat);
  body.rotation.z = Math.PI / 2; body.castShadow = true; body.receiveShadow = true; g.add(body);
  for (const e of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(rad * 1.02, rad * 1.02, 0.05, 14), ringMat);
    cap.rotation.z = Math.PI / 2; cap.position.x = e * len / 2; g.add(cap);
  }
  g.position.set(x, rad, z); g.rotation.y = Math.random() * Math.PI;
  scene.add(g); colliders.push({ x, z, r: rad + 0.35 });
}
function makeRock(x, z) {
  const sc = 0.45 + Math.random() * 1.1;
  const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(sc, 0), rockMat);
  rock.position.set(x, sc * 0.5, z); rock.rotation.set(Math.random(), Math.random(), Math.random());
  rock.scale.y = 0.7; rock.castShadow = true; rock.receiveShadow = true;
  scene.add(rock); colliders.push({ x, z, r: sc * 0.8 });
}
function makeMushroom(x, z) {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.34, 8), toon(0xf3ead2));
  stem.position.y = 0.17; stem.castShadow = true; g.add(stem);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, 7, 0, Math.PI / 2), toon(0xe24b4b));
  cap.position.y = 0.34; cap.castShadow = true; g.add(cap);
  g.position.set(x, 0, z); g.scale.setScalar(0.8 + Math.random()); scene.add(g);
}
function makeFlower(x, z) {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.42, 5), toon(0x4f9a3e));
  stem.position.y = 0.21; g.add(stem);
  const colors = [0xffd34e, 0xff7aa8, 0xfff0f5, 0x9b6bff, 0xff9b3b];
  const petalMat = toon(colors[Math.random() * colors.length | 0]);
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), petalMat);
    const a = (i / 5) * Math.PI * 2; p.position.set(Math.cos(a) * 0.09, 0.44, Math.sin(a) * 0.09); g.add(p);
  }
  const center = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), toon(0xffe27a)); center.position.y = 0.44; g.add(center);
  g.position.set(x, 0, z); g.scale.setScalar(0.8 + Math.random()); scene.add(g);
}
for (let i = 0; i < 34; i++) { const [x, z] = scatterPoint(9); makeTree(x, z); }
for (let i = 0; i < 14; i++) { const [x, z] = scatterPoint(7); makeLog(x, z); }
for (let i = 0; i < 20; i++) { const [x, z] = scatterPoint(6); makeRock(x, z); }
for (let i = 0; i < 20; i++) { const [x, z] = scatterPoint(5); makeMushroom(x, z); }
for (let i = 0; i < 46; i++) { const [x, z] = scatterPoint(4); makeFlower(x, z); }

// soft clouds
const clouds = [];
for (let i = 0; i < 7; i++) {
  const g = new THREE.Group();
  for (let j = 0; j < 4; j++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(2 + Math.random() * 2, 10, 8), noOutline(toon(0xfffdf6)));
    puff.position.set((Math.random() - .5) * 6, (Math.random() - .5) * 1.5, (Math.random() - .5) * 4); g.add(puff);
  }
  g.position.set((Math.random() - .5) * 180, 30 + Math.random() * 12, (Math.random() - .5) * 180);
  g.scale.setScalar(0.9 + Math.random()); scene.add(g); clouds.push(g);
}

// ----------------------------------------------------------------------------
// Player + skeletal animation
// ----------------------------------------------------------------------------
const player = new THREE.Group(); scene.add(player);
const modelPivot = new THREE.Group(); player.add(modelPivot);

let heading = 0, camYaw = 0, vy = 0, grounded = true, moveAmt = 0;
let camOrbit = 0, dragging = false, lastX = 0, ready = false;
let mixer = null, walkAction = null, idleAction = null;
let groundBones = [], SOLE_OFFSET = 0;          // foot-to-floor pinning
let modelRoot = null, fitCountdown = -1;        // deferred scale/ground (skinned matrices settle a few frames in)
const _gv = new THREE.Vector3();
const _wb = new THREE.Box3(), _tb = new THREE.Box3(), _sz = new THREE.Vector3(), _ctr = new THREE.Vector3();

// True world AABB of a skinned model. Box3.setFromObject is unreliable for
// skinned meshes (geometry stays in bind space); computeBoundingBox is skinning-aware.
function worldBoxOf(root) {
  root.updateWorldMatrix(true, true); _wb.makeEmpty();
  root.traverse((o) => {
    if (o.isSkinnedMesh) { o.computeBoundingBox(); _tb.copy(o.boundingBox).applyMatrix4(o.matrixWorld); _wb.union(_tb); }
    else if (o.isMesh) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); _tb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); _wb.union(_tb); }
  });
  return _wb;
}
// scale to TARGET_HEIGHT, center horizontally, drop feet to y=0, then record the
// rest height of the lowest foot bone so the engine can keep the sole grounded.
function fitAndGround(root) {
  worldBoxOf(root).getSize(_sz);
  if (_sz.y > 1e-4) root.scale.multiplyScalar(TARGET_HEIGHT / _sz.y);
  worldBoxOf(root).getCenter(_ctr);
  root.position.x -= _ctr.x; root.position.z -= _ctr.z;
  root.position.y -= worldBoxOf(root).min.y;
  player.updateMatrixWorld(true);
  if (groundBones.length) {
    SOLE_OFFSET = Infinity;
    for (const b of groundBones) { b.getWorldPosition(_gv); player.worldToLocal(_gv); SOLE_OFFSET = Math.min(SOLE_OFFSET, _gv.y); }
  }
}

new GLTFLoader().load('./models/ladybug_anim.glb', (gltf) => {
  const root = gltf.scene;
  root.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true; o.frustumCulled = false;
      const src = o.material;
      if (src && src.map) src.map.anisotropy = 1;
      // convert the imported PBR material to toon, keep its color texture
      const m = new THREE.MeshToonMaterial({
        map: src && src.map ? src.map : null,
        color: src && src.color ? src.color : new THREE.Color(0xffffff),
        gradientMap: RAMP,
      });
      o.material = m;
    }
  });
  root.visible = false;            // stay hidden until fitted (avoids a giant-size flash)
  modelPivot.add(root);
  modelRoot = root;

  // find the foot/toe bones used to pin the sole to the floor
  const FOOT_NAMES = ['ball_l', 'ball_r', 'foot_l', 'foot_r', 'toe_l', 'toe_r'];
  groundBones = [];
  root.traverse((o) => { if (o.isBone && FOOT_NAMES.includes(o.name.toLowerCase())) groundBones.push(o); });

  mixer = new THREE.AnimationMixer(root);
  const clips = gltf.animations || [];
  const walkClip = THREE.AnimationClip.findByName(clips, 'walk') || clips[0];
  const idleClip = THREE.AnimationClip.findByName(clips, 'idle') || clips[1] || clips[0];
  if (idleClip) { idleAction = mixer.clipAction(idleClip); idleAction.play(); }
  if (walkClip) { walkAction = mixer.clipAction(walkClip); walkAction.play(); walkAction.setEffectiveWeight(0); }
  console.log('clips:', clips.map(c => c.name));
  ready = true;
  fitCountdown = 3;   // fit (scale + ground) after a few renders, once skinned matrices have settled
}, (e) => {
  // GLB download progress on the loading overlay
  if (e && e.total > 0) {
    const t = document.getElementById('loading-text');
    if (t) t.textContent = 'Waking up the meadow… ' + Math.min(100, Math.round(e.loaded / e.total * 100)) + '%';
  }
}, (err) => {
  document.getElementById('loading').innerHTML =
    '<div style="color:#a33;padding:20px;text-align:center">Could not load model.<br><small>' + err + '</small></div>';
});

// ----------------------------------------------------------------------------
// Input
// ----------------------------------------------------------------------------
const keys = {};
addEventListener('keydown', (e) => { keys[e.code] = true; if (e.code === 'Space') e.preventDefault(); });
addEventListener('keyup',   (e) => { keys[e.code] = false; });
renderer.domElement.addEventListener('mousedown', (e) => { dragging = true; lastX = e.clientX; });
addEventListener('mouseup', () => { dragging = false; });
addEventListener('mousemove', (e) => { if (dragging) { camOrbit -= (e.clientX - lastX) * 0.005; lastX = e.clientX; } });
addEventListener('resize', () => {
  camera.aspect = VW() / VH(); camera.updateProjectionMatrix();
  renderer.setSize(VW(), VH());
});

// --- touch controls (mobile) — purely additive; the keyboard path is unchanged ---
let joyX = 0, joyZ = 0, hopHeld = false;
(function setupTouch() {
  if (!('ontouchstart' in window) && !(navigator.maxTouchPoints > 0)) return;
  const joy = document.getElementById('joy'), knob = document.getElementById('joy-knob');
  const hop = document.getElementById('hop-btn');
  if (!joy || !knob || !hop) return;
  document.body.classList.add('touch');            // reveals pad/button, swaps HUD hints
  const R = 44;                                    // knob travel radius (px)
  const DEAD = 0.22;
  let joyId = -1, cx = 0, cy = 0;
  const setKnob = (dx, dy) => { knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; };
  const onJoy = (t) => {
    let dx = t.clientX - cx, dy = t.clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > R) { dx *= R / len; dy *= R / len; }
    setKnob(dx, dy);
    const nx = dx / R, ny = dy / R;
    joyX = Math.abs(nx) > DEAD ? nx : 0;
    joyZ = Math.abs(ny) > DEAD ? -ny : 0;          // screen-up = forward
  };
  joy.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (joyId !== -1) return;
    const t = e.changedTouches[0]; joyId = t.identifier;
    const r = joy.getBoundingClientRect();
    cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    onJoy(t);
  }, { passive: false });
  joy.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === joyId) onJoy(t);
  }, { passive: false });
  const joyEnd = (e) => {
    for (const t of e.changedTouches) if (t.identifier === joyId) {
      joyId = -1; joyX = 0; joyZ = 0; setKnob(0, 0);
    }
  };
  joy.addEventListener('touchend', joyEnd);
  joy.addEventListener('touchcancel', joyEnd);
  hop.addEventListener('touchstart', (e) => { e.preventDefault(); hopHeld = true; }, { passive: false });
  hop.addEventListener('touchend', () => { hopHeld = false; });
  hop.addEventListener('touchcancel', () => { hopHeld = false; });
  // one-finger drag on the scene orbits the camera (same feel as the mouse drag)
  let camId = -1, camLastX = 0;
  renderer.domElement.addEventListener('touchstart', (e) => {
    e.preventDefault();                            // also suppresses synthetic mouse events
    if (camId !== -1) return;
    const t = e.changedTouches[0]; camId = t.identifier; camLastX = t.clientX;
  }, { passive: false });
  renderer.domElement.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === camId) {
      camOrbit -= (t.clientX - camLastX) * 0.005; camLastX = t.clientX;
    }
  }, { passive: false });
  const camEnd = (e) => { for (const t of e.changedTouches) if (t.identifier === camId) camId = -1; };
  renderer.domElement.addEventListener('touchend', camEnd);
  renderer.domElement.addEventListener('touchcancel', camEnd);
})();

// --- WebGL context loss: show a tap-to-restart overlay (hide again if the browser restores) ---
const ctxLost = document.getElementById('ctxlost');
renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();                              // allow the browser to attempt a restore
  if (ctxLost) ctxLost.classList.remove('hidden');
});
renderer.domElement.addEventListener('webglcontextrestored', () => {
  if (ctxLost) ctxLost.classList.add('hidden');
});
if (ctxLost) ctxLost.addEventListener('click', () => location.reload());
function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// ----------------------------------------------------------------------------
// Loop
// ----------------------------------------------------------------------------
const clock = new THREE.Clock();
const fwd = new THREE.Vector3(), right = new THREE.Vector3(), move = new THREE.Vector3();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);

  // one-shot fit: scale + ground the model once its skinned matrices have settled
  if (modelRoot && fitCountdown >= 0) {
    if (fitCountdown === 0) {
      fitAndGround(modelRoot); modelRoot.visible = true; modelRoot = null;
      const ld = document.getElementById('loading'); if (ld) { ld.classList.add('hidden'); setTimeout(() => ld.remove(), 700); }
    }
    fitCountdown--;
  }

  const inz = (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) - (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0) + joyZ;
  const inx = (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) - (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0) + joyX;
  const running = keys['ShiftLeft'] || keys['ShiftRight'];
  const speed = running ? RUN_SPEED : WALK_SPEED;

  fwd.set(Math.sin(camYaw), 0, Math.cos(camYaw));
  right.set(Math.cos(camYaw), 0, -Math.sin(camYaw));
  move.set(0, 0, 0).addScaledVector(fwd, inz).addScaledVector(right, inx);
  const moving = move.lengthSq() > 0.001 && ready;
  if (moving) {
    move.normalize();
    heading = lerpAngle(heading, Math.atan2(move.x, move.z), TURN_LERP);
    player.position.addScaledVector(move, speed * dt);
  }
  moveAmt += ((moving ? 1 : 0) - moveAmt) * Math.min(1, dt * 9);

  if ((keys['Space'] || hopHeld) && grounded) { vy = 7.4; grounded = false; }
  vy -= 20 * dt; player.position.y += vy * dt;
  if (player.position.y <= 0) { player.position.y = 0; vy = 0; grounded = true; }

  for (const cl of colliders) {
    const dx = player.position.x - cl.x, dz = player.position.z - cl.z;
    const d = Math.hypot(dx, dz), min = cl.r + 0.5;
    if (d < min && d > 1e-4) { const p = (min - d) / d; player.position.x += dx * p; player.position.z += dz * p; }
  }
  const rr = Math.hypot(player.position.x, player.position.z);
  if (rr > WORLD_RADIUS) { player.position.x *= WORLD_RADIUS / rr; player.position.z *= WORLD_RADIUS / rr; }

  player.rotation.y = heading;
  modelPivot.rotation.set(0, MODEL_FACE_OFF, 0);

  // blend idle <-> walk on the real skeleton
  if (mixer) {
    if (walkAction) { walkAction.setEffectiveWeight(moveAmt); walkAction.timeScale = running ? 1.55 : 1.1; }
    if (idleAction) idleAction.setEffectiveWeight(1 - moveAmt);
    mixer.update(dt);
    // pin the planted (lowest) foot's sole to the floor — kills any float/bob
    if (groundBones.length) {
      player.updateMatrixWorld(true);
      let m = Infinity;
      for (const b of groundBones) { b.getWorldPosition(_gv); player.worldToLocal(_gv); if (_gv.y < m) m = _gv.y; }
      modelPivot.position.y -= (m - SOLE_OFFSET);
    }
  }

  camYaw = lerpAngle(camYaw, heading + camOrbit, 0.06);
  const cd = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
  camera.position.lerp(new THREE.Vector3(
    player.position.x - cd.x * CAM_DIST, player.position.y + CAM_HEIGHT, player.position.z - cd.z * CAM_DIST), 0.09);
  camera.lookAt(player.position.x, player.position.y + CAM_LOOK_Y, player.position.z);

  sun.position.set(player.position.x + 26, 38, player.position.z + 16);
  sun.target.position.copy(player.position);
  for (const cl of clouds) { cl.position.x += dt * 0.5; if (cl.position.x > 100) cl.position.x = -100; }

  renderer.render(scene, camera);
}
// smooth loop when visible; setInterval fallback keeps rendering when the tab
// is hidden (rAF is paused while hidden) so screenshots/headless capture work.
function raf() { frame(); if (!document.hidden) requestAnimationFrame(raf); }
requestAnimationFrame(raf);
document.addEventListener('visibilitychange', () => { if (!document.hidden) requestAnimationFrame(raf); });
setInterval(() => { if (document.hidden) frame(); }, 60);

window.__lb = { setFaceOffset: (d) => { MODEL_FACE_OFF = d * Math.PI / 180; }, player, camera,
                clips: () => mixer && mixer._actions.map(a => a._clip.name) };
