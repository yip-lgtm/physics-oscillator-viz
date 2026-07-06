/**
 * PHYS Damped & Driven Harmonic Oscillator — Phase-Space Viz
 *
 *   ẍ + 2βẋ + ω₀² x = (F₀/m) cos(ω t)
 *
 * State vector: [x, ẋ]
 * Phase-space: x on horizontal axis (X), ẋ on Y, t on Z (time-stack)
 *
 * Solver: RK4 with fixed timestep dt = 0.02 s
 * Visual: ball moving along trail · ribbon drawn in 3D
 *
 * Sliders: β, ω₀, F₀/m, ω
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);

const els = {
  beta: $('beta'), betaVal: $('beta-val'),
  omega0: $('omega0'), omega0Val: $('omega0-val'),
  force: $('force'), forceVal: $('force-val'),
  omega: $('omega'), omegaVal: $('omega-val'),
  reset: $('reset'), pause: $('pause'), step: $('step'),
  showEnergy: $('show-energy'), showGrid: $('show-grid'),
  regime: $('regime'), qFactor: $('q-factor'),
  xNow: $('x-now'), vNow: $('v-now'),
  energy: $('energy'), tNow: $('t-now'),
  presetButtons: document.querySelectorAll('.preset button'),
  threeRoot: $('three-root'),
};

// ---------- State ----------
const STATE = {
  beta: 0.15,
  omega0: 1.4,
  force: 0.7,
  omega: 1.4,
  x: 1.0,        // initial position
  v: 0.0,        // initial velocity
  t: 0.0,
  paused: false,
  stepOnce: false,
  showEnergy: true,
  showGrid: true,
  history: [],  // ring buffer of [x, v, t] for trail
  historyMax: 600,
  energyHistory: [],
};

const DT = 0.02;          // integration step
const REAL_TIME_SCALE = 1.0; // 1s real = 1s sim
const TZ = 0.05;          // depth scale for time axis (Z)

// ---------- Three.js setup ----------
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0a0e1a, 0.025);

const camera = new THREE.PerspectiveCamera(
  50, window.innerWidth / window.innerHeight, 0.01, 200,
);
camera.position.set(4.5, 3.5, 5);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(els.threeRoot.clientWidth, els.threeRoot.clientHeight);
renderer.setClearColor(0x050810, 1);
els.threeRoot.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 2;
controls.maxDistance = 15;
controls.target.set(0, 0, -2);

// ---------- Lighting ----------
scene.add(new THREE.AmbientLight(0x6080a0, 0.7));
const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
keyLight.position.set(6, 8, 4);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x7cf, 0.4);
fillLight.position.set(-4, -2, 3);
scene.add(fillLight);

// ---------- Grid + Axes ----------
const SCALE = 1.4;  // visual unit scale

const gridGroup = new THREE.Group();
const grid = new THREE.GridHelper(8, 16, 0x4a5a78, 0x223045);
grid.position.y = -1.6;
gridGroup.add(grid);

// 3 axes: x is depth (out of screen), ẋ is left-right, time is into screen (z negative)
const makeAxis = (dir, color, length = 6) => {
  const geom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(dir.x * length, dir.y * length, dir.z * length),
  ]);
  const mat = new THREE.LineBasicMaterial({ color, linewidth: 2 });
  return new THREE.Line(geom, mat);
};

const axisX = makeAxis({ x: 1, y: 0, z: 0 }, 0x7cf, 4);       // velocity (ẋ)
const axisV = makeAxis({ x: 0, y: 1, z: 0 }, 0xfb6, 4);       // position (x)
const axisT = makeAxis({ x: 0, y: 0, z: -1 }, 0x6f8, 6);      // time (t)

gridGroup.add(axisX, axisV, axisT);

// Axis labels (sprites are good enough)
const label = (text, pos, color) => {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 36px ui-monospace, monospace';
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(text, 64, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.position.copy(pos);
  sprite.scale.set(0.8, 0.4, 1);
  return sprite;
};

gridGroup.add(
  label('ẋ (velocity)',  new THREE.Vector3(4.5, 0, 0), 0x7cf),
  label('x (position)',  new THREE.Vector3(0, 4.5, 0), 0xfb6),
  label('t →',           new THREE.Vector3(0, 0, -7), 0x6f8),
);
scene.add(gridGroup);

// ---------- Energy sheet (subtle glow) ----------
const sheetGeom = new THREE.PlaneGeometry(8, 8, 1, 1);
const sheetMat = new THREE.MeshBasicMaterial({
  color: 0x0a1428,
  transparent: true,
  opacity: 0.35,
  side: THREE.DoubleSide,
});
const energySheet = new THREE.Mesh(sheetGeom, sheetMat);
energySheet.position.set(0, 0, 0);
scene.add(energySheet);

// ---------- Trajectory tube ----------
const MAX_POINTS = 800;
const tubeGeom = new THREE.BufferGeometry();
const positions = new Float32Array(MAX_POINTS * 3);
const colors = new Float32Array(MAX_POINTS * 3);
tubeGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
tubeGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
tubeGeom.setDrawRange(0, 0);

const tubeMat = new THREE.LineBasicMaterial({
  vertexColors: true,
  linewidth: 1.5,
  transparent: true,
  opacity: 0.9,
});
const tubeLine = new THREE.Line(tubeGeom, tubeMat);
scene.add(tubeLine);

// ---------- Anchor ball ----------
const ballGeom = new THREE.SphereGeometry(0.12, 32, 24);
const ballMat = new THREE.MeshStandardMaterial({
  color: 0xfb6,
  emissive: 0xff7733,
  emissiveIntensity: 0.7,
  metalness: 0.4,
  roughness: 0.25,
});
const ball = new THREE.Mesh(ballGeom, ballMat);
scene.add(ball);

// Faint glow ring
const glowGeom = new THREE.RingGeometry(0.14, 0.20, 32);
const glowMat = new THREE.MeshBasicMaterial({
  color: 0xff7733,
  transparent: true,
  opacity: 0.4,
  side: THREE.DoubleSide,
});
const glow = new THREE.Mesh(glowGeom, glowMat);
scene.add(glow);

// ---------- Energy ribbon (E = 1/2 v² + 1/2 ω₀² x² + ...) ----------
// Drawn as small horizontal "curtain" attached to ball
const ribbonSegs = 80;
const ribbonGeom = new THREE.BufferGeometry();
const ribbonPositions = new Float32Array(ribbonSegs * 2 * 3);
ribbonGeom.setAttribute('position', new THREE.BufferAttribute(ribbonPositions, 3));
const ribbonMat = new THREE.LineBasicMaterial({
  color: 0xff5577,
  transparent: true,
  opacity: 0.55,
});
const ribbonLine = new THREE.LineSegments(ribbonGeom, ribbonMat);
scene.add(ribbonLine);

// ---------- Zero-crossing equator ----------
const equatorGeom = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(-3, 0, 0.0),
  new THREE.Vector3(3, 0, 0.0),
]);
const equatorMat = new THREE.LineBasicMaterial({
  color: 0xf44,
  transparent: true,
  opacity: 0.45,
});
const equator = new THREE.Line(equatorGeom, equatorMat);
scene.add(equator);

// ---------- Force visualization (oscillating arrow) ----------
// Use a small CylinderGeometry as a clean force indicator.
const arrowGeom = new THREE.CylinderGeometry(0.05, 0.05, 0.7, 12);
const arrowMat = new THREE.MeshBasicMaterial({ color: 0xaae });
const arrow = new THREE.Mesh(arrowGeom, arrowMat);
arrow.position.set(0, 0, 0);
scene.add(arrow);

// ---------- Solver: RK4 ----------
// ẍ = -2β ẋ - ω₀² x + (F₀/m) cos(ω t)
// state [x, v], derivative [v, dv/dt]
function deriv(x, v, t, params) {
  const { beta, omega0, force, omega } = params;
  const dv = -2 * beta * v - omega0 * omega0 * x
           + force * Math.cos(omega * t);
  return [v, dv];
}

function rk4Step(x, v, t, params, dt) {
  const [k1x, k1v] = deriv(x, v, t, params);
  const [k2x, k2v] = deriv(x + k1x * dt / 2, v + k1v * dt / 2, t + dt / 2, params);
  const [k3x, k3v] = deriv(x + k2x * dt / 2, v + k2v * dt / 2, t + dt / 2, params);
  const [k4x, k4v] = deriv(x + k3x * dt, v + k3v * dt, t + dt, params);
  const nx = x + dt * (k1x + 2 * k2x + 2 * k3x + k4x) / 6;
  const nv = v + dt * (k1v + 2 * k2v + 2 * k3v + k4v) / 6;
  return [nx, nv];
}

function totalEnergy(x, v, params) {
  const { omega0 } = params;
  return 0.5 * v * v + 0.5 * omega0 * omega0 * x * x;
}

function classifyRegime(params) {
  const { beta, omega0 } = params;
  const ratio = beta / omega0;
  if (beta < 1e-3) return 'Undamped';
  if (ratio < 0.95) return 'Under-damped';
  if (ratio < 1.05) return 'Critically damped';
  return 'Over-damped';
}

function qFactor(params) {
  return params.omega0 / (2 * params.beta);
}

// ---------- HUD wiring ----------
function bindSlider(input, output, setter) {
  const update = () => {
    const v = parseFloat(input.value);
    setter(v);
    output.value = v.toFixed(2);
  };
  input.addEventListener('input', update);
  update();
}

bindSlider(els.beta, els.betaVal, (v) => STATE.beta = v);
bindSlider(els.omega0, els.omega0Val, (v) => STATE.omega0 = v);
bindSlider(els.force, els.forceVal, (v) => STATE.force = v);
bindSlider(els.omega, els.omegaVal, (v) => STATE.omega = v);

els.reset.addEventListener('click', resetSim);
els.pause.addEventListener('click', () => {
  STATE.paused = !STATE.paused;
  els.pause.textContent = STATE.paused ? '▶ Play' : '⏸ Pause';
});
els.step.addEventListener('click', () => { STATE.stepOnce = true; });

els.showEnergy.addEventListener('change', (e) => {
  STATE.showEnergy = e.target.checked;
  ribbonLine.visible = STATE.showEnergy;
});
els.showGrid.addEventListener('change', (e) => {
  STATE.showGrid = e.target.checked;
  gridGroup.visible = STATE.showGrid;
});

// Presets
const presets = {
  undamped:    { beta: 0.0,  omega0: 1.4, force: 0.0, omega: 1.4 },
  underdamped: { beta: 0.15, omega0: 1.4, force: 0.0, omega: 1.4 },
  critically:  { beta: 1.4,  omega0: 1.4, force: 0.0, omega: 1.4 },
  overdamped:  { beta: 2.5,  omega0: 1.4, force: 0.0, omega: 1.4 },
  resonance:   { beta: 0.05, omega0: 1.4, force: 0.3, omega: 1.4 },
  beats:       { beta: 0.0,  omega0: 1.4, force: 0.7, omega: 1.2 },
};

els.presetButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const p = presets[btn.dataset.preset];
    if (!p) return;
    els.beta.value = p.beta;
    els.omega0.value = p.omega0;
    els.force.value = p.force;
    els.omega.value = p.omega;
    els.beta.dispatchEvent(new Event('input'));
    els.omega0.dispatchEvent(new Event('input'));
    els.force.dispatchEvent(new Event('input'));
    els.omega.dispatchEvent(new Event('input'));
    resetSim();
  });
});

function resetSim() {
  STATE.x = 1.0;
  STATE.v = 0.0;
  STATE.t = 0.0;
  STATE.history.length = 0;
  STATE.energyHistory.length = 0;
  updateGeometry(0); // immediately zero the trail
}

resetSim();

// ---------- Main loop ----------
let frame = 0;
function animate() {
  const params = {
    beta: STATE.beta,
    omega0: STATE.omega0,
    force: STATE.force,
    omega: STATE.omega,
  };

  // Step the integrator
  if (!STATE.paused) {
    for (let i = 0; i < 3; i++) {
      // sub-step so animation is smooth even with one frame ~16ms
      [STATE.x, STATE.v] = rk4Step(STATE.x, STATE.v, STATE.t, params, DT);
      STATE.t += DT;
    }
  } else if (STATE.stepOnce) {
    [STATE.x, STATE.v] = rk4Step(STATE.x, STATE.v, STATE.t, params, DT);
    STATE.t += DT;
    STATE.stepOnce = false;
  }

  // Sample to history
  STATE.history.push([STATE.x, STATE.v, STATE.t]);
  if (STATE.history.length > STATE.historyMax) STATE.history.shift();

  STATE.energyHistory.push(totalEnergy(STATE.x, STATE.v, params));
  if (STATE.energyHistory.length > STATE.historyMax) STATE.energyHistory.shift();

  updateGeometry(frame);

  // HUD updates (sparingly)
  if ((frame % 6) === 0) {
    els.regime.textContent = classifyRegime(params);
    els.qFactor.textContent = STATE.beta > 1e-3 ? qFactor(params).toFixed(2) : '∞';
    els.xNow.value = STATE.x.toFixed(3);
    els.vNow.value = STATE.v.toFixed(3);
    els.energy.value =
      totalEnergy(STATE.x, STATE.v, params).toFixed(3);
    els.tNow.value = STATE.t.toFixed(2);
  }

  frame++;

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function updateGeometry() {
  // Update ball position. x on Y axis, v on X axis, t on Z axis (negative)
  const [x, v, t] = [STATE.x, STATE.v, STATE.t];
  ball.position.set(
    THREE.MathUtils.clamp(v * SCALE, -3.5, 3.5),
    THREE.MathUtils.clamp(x * SCALE, -3.5, 3.5),
    THREE.MathUtils.clamp(-t * TZ, -6.0, 0.5),
  );
  glow.position.copy(ball.position);

  arrow.position.set(
    THREE.MathUtils.clamp(v * SCALE, -3.5, 3.5),
    THREE.MathUtils.clamp(x * SCALE, -3.5, 3.5),
    THREE.MathUtils.clamp(-t * TZ, -6.0, 0.5),
  );
  arrow.rotation.z = -Math.PI / 2;
  arrow.scale.y = THREE.MathUtils.clamp(STATE.force, 0.0, 1.5);
  arrow.visible = STATE.force > 0.05;

  // Trail line — draw full history in 3D
  const n = STATE.history.length;
  for (let i = 0; i < n; i++) {
    const [hx, hv, ht] = STATE.history[i];
    const px = THREE.MathUtils.clamp(hv * SCALE, -3.5, 3.5);
    const py = THREE.MathUtils.clamp(hx * SCALE, -3.5, 3.5);
    const pz = THREE.MathUtils.clamp(-ht * TZ, -6.0, 0.5);
    positions[i * 3]     = px;
    positions[i * 3 + 1] = py;
    positions[i * 3 + 2] = pz;

    // colour gradient: cyan → magenta as amplitude fades
    const age = i / Math.max(1, n - 1);
    colors[i * 3]     = 0.4 + 0.4 * age;
    colors[i * 3 + 1] = 0.8 - 0.6 * age;
    colors[i * 3 + 2] = 1.0 - 0.4 * age;
  }
  tubeGeom.setDrawRange(0, n);
  tubeGeom.attributes.position.needsUpdate = true;
  tubeGeom.attributes.color.needsUpdate = true;

  // Energy ribbon — small vertical curtain trailing the ball
  if (STATE.showEnergy) {
    const energy = totalEnergy(x, v, params);
    for (let i = 0; i < ribbonSegs; i++) {
      const tBack = (i / ribbonSegs);
      const idx = Math.max(0, STATE.history.length - 1 - i);
      const sample = STATE.history[idx] || [x, v, t];
      const eBack = STATE.energyHistory[idx] || energy;
      const px = THREE.MathUtils.clamp(sample[1] * SCALE, -3.5, 3.5);
      const pyBot = THREE.MathUtils.clamp(sample[0] * SCALE, -3.5, 3.5);
      const pz = THREE.MathUtils.clamp(-sample[2] * TZ, -6.0, 0.5);
      const pyTop = THREE.MathUtils.clamp(
        sample[0] * SCALE + 0.1 * Math.sqrt(Math.abs(eBack) * 10),
        -4.5, 4.5,
      );
      ribbonPositions[i * 6]     = px;
      ribbonPositions[i * 6 + 1] = pyBot;
      ribbonPositions[i * 6 + 2] = pz;
      ribbonPositions[i * 6 + 3] = px;
      ribbonPositions[i * 6 + 4] = pyTop;
      ribbonPositions[i * 6 + 5] = pz;
    }
    ribbonGeom.attributes.position.needsUpdate = true;
  }
}

// ---------- Resize ----------
window.addEventListener('resize', () => {
  const w = els.threeRoot.clientWidth;
  const h = els.threeRoot.clientHeight;
  if (w === 0 || h === 0) return;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
});

animate();
