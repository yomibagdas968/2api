(() => {
'use strict';

// ============================== SETUP ==============================
const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: false });
let W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 1.5);

// Offscreen: bloom buffer (downscaled) + nebula
const bloomCv = document.createElement('canvas');
const bloomCtx = bloomCv.getContext('2d');
const BLOOM_SCALE = 0.25;

const nebulaCv = document.createElement('canvas');
const nebCtx = nebulaCv.getContext('2d');

function resize() {
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * DPR; canvas.height = H * DPR;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  bloomCv.width = Math.max(2, W * BLOOM_SCALE);
  bloomCv.height = Math.max(2, H * BLOOM_SCALE);
  buildNebula();
}

// ============================== THEMES ==============================
// Each theme: color ramp over particle lifetime + nebula blob palette.
const THEMES = [
  {
    name: 'SPECTRAL',
    ramp: [
      { h: 215, s: 100, l: 60 },
      { h: 185, s: 100, l: 62 },
      { h:  28, s: 100, l: 58 },
      { h: 278, s:  95, l: 62 }
    ],
    blobs: [
      { c: 'rgba(20, 60, 140, 0.16)',  n: 5 },
      { c: 'rgba(120, 40, 160, 0.10)', n: 4 },
      { c: 'rgba(200, 90, 20, 0.07)',  n: 3 },
      { c: 'rgba(0, 140, 160, 0.09)',  n: 4 }
    ]
  },
  {
    name: 'INFERNO',
    ramp: [
      { h: 350, s: 95, l: 42 },
      { h:  15, s: 100, l: 52 },
      { h:  38, s: 100, l: 58 },
      { h:  52, s: 100, l: 72 }
    ],
    blobs: [
      { c: 'rgba(140, 20, 20, 0.15)',  n: 5 },
      { c: 'rgba(180, 70, 10, 0.10)',  n: 4 },
      { c: 'rgba(120, 20, 90, 0.08)',  n: 3 },
      { c: 'rgba(200, 120, 20, 0.07)', n: 3 }
    ]
  },
  {
    name: 'AURORA',
    ramp: [
      { h: 140, s: 95, l: 55 },
      { h: 172, s: 100, l: 58 },
      { h: 210, s: 100, l: 62 },
      { h: 275, s:  90, l: 64 }
    ],
    blobs: [
      { c: 'rgba(10, 120, 80, 0.14)',  n: 5 },
      { c: 'rgba(20, 100, 160, 0.11)', n: 4 },
      { c: 'rgba(90, 40, 170, 0.08)',  n: 3 },
      { c: 'rgba(0, 160, 130, 0.08)',  n: 3 }
    ]
  },
  {
    name: 'NEON',
    ramp: [
      { h: 300, s: 100, l: 60 },
      { h: 330, s: 100, l: 64 },
      { h: 190, s: 100, l: 60 },
      { h: 220, s: 100, l: 66 }
    ],
    blobs: [
      { c: 'rgba(150, 20, 140, 0.14)', n: 5 },
      { c: 'rgba(20, 130, 170, 0.11)', n: 4 },
      { c: 'rgba(40, 40, 190, 0.09)',  n: 3 },
      { c: 'rgba(180, 30, 90, 0.07)',  n: 3 }
    ]
  }
];
let themeIndex = 0;
let RAMP = THEMES[0].ramp;

function setTheme(i) {
  themeIndex = ((i % THEMES.length) + THEMES.length) % THEMES.length;
  RAMP = THEMES[themeIndex].ramp;
  rebuildSprites();
  buildNebula();
  themeEl.textContent = 'THEME: ' + THEMES[themeIndex].name;
  showBanner('◈ ' + THEMES[themeIndex].name + ' ◈');
}

// ============================== NEBULA + TWINKLING STARS ==============================
let twinkles = [];
function buildNebula() {
  nebulaCv.width = Math.max(2, W); nebulaCv.height = Math.max(2, H);
  nebCtx.clearRect(0, 0, W, H);
  for (const b of THEMES[themeIndex].blobs) {
    for (let i = 0; i < b.n; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      const r = 150 + Math.random() * Math.max(W, H) * 0.35;
      const g = nebCtx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, b.c);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      nebCtx.fillStyle = g;
      nebCtx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  // faint static stars baked into the nebula
  for (let i = 0; i < 140; i++) {
    const a = Math.random() * 0.5 + 0.1;
    nebCtx.fillStyle = `rgba(200,220,255,${a})`;
    const s = Math.random() * 1.4 + 0.3;
    nebCtx.fillRect(Math.random() * W, Math.random() * H, s, s);
  }
  // live twinkling star layer (drawn per-frame, cheap)
  twinkles = [];
  for (let i = 0; i < 90; i++) {
    twinkles.push({
      x: Math.random() * W,
      y: Math.random() * H,
      s: Math.random() * 1.6 + 0.5,
      base: 0.15 + Math.random() * 0.5,
      freq: 0.6 + Math.random() * 2.4,
      phase: Math.random() * Math.PI * 2
    });
  }
}

function drawTwinkles(time) {
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < twinkles.length; i++) {
    const st = twinkles[i];
    const a = st.base * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * st.freq + st.phase)));
    ctx.fillStyle = `rgba(200,225,255,${a})`;
    ctx.fillRect(st.x, st.y, st.s, st.s);
  }
}

// ============================== COLOR RAMP ==============================
function rampColor(t) {
  t = Math.max(0, Math.min(0.9999, t)) * (RAMP.length - 1);
  const i = t | 0, f = t - i;
  const a = RAMP[i], b = RAMP[i + 1];
  // shortest-path hue interpolation
  let dh = b.h - a.h;
  if (dh > 180) dh -= 360; if (dh < -180) dh += 360;
  return {
    h: (a.h + dh * f + 360) % 360,
    s: a.s + (b.s - a.s) * f,
    l: a.l + (b.l - a.l) * f
  };
}
function hsla(c, a) { return `hsla(${c.h|0},${c.s|0}%,${c.l|0}%,${a})`; }

// ============================== SPRITE CACHES ==============================
// Drawing a particle used to mean three arc fills plus fresh hsla() strings
// every frame. Instead, the halo/glow/core stack is baked into one sprite per
// quantized ramp position and blitted with a single drawImage. Rebuilt only
// on theme change.
const RAMP_STEPS = 48;
const SPRITE_R = 48;                 // baked halo radius, px
let particleSprites = [];            // [step] -> canvas (halo = 7 x core size)
let cometSprites = [];               // [step] -> canvas (halo = 9 x core size)
let rampStrokes = [];                // [step] -> solid color for trails/links

function bakeSprite(col, haloRatio, haloAlpha) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = SPRITE_R * 2;
  const c = cv.getContext('2d');
  c.globalCompositeOperation = 'lighter';
  const disc = (r, style) => {
    c.fillStyle = style;
    c.beginPath(); c.arc(SPRITE_R, SPRITE_R, r, 0, 6.2832); c.fill();
  };
  disc(SPRITE_R, hsla(col, haloAlpha));                                  // outer halo
  disc(SPRITE_R * 2.8 / haloRatio, hsla(col, 0.22));                     // mid glow
  disc(SPRITE_R / haloRatio, hsla({ h: col.h, s: col.s * 0.5, l: 88 }, 0.95)); // core
  return cv;
}

function rebuildSprites() {
  particleSprites = []; cometSprites = []; rampStrokes = [];
  for (let i = 0; i < RAMP_STEPS; i++) {
    const col = rampColor(i / (RAMP_STEPS - 1));
    particleSprites.push(bakeSprite(col, 7, 0.05));
    cometSprites.push(bakeSprite(col, 9, 0.09));
    rampStrokes.push(hsla(col, 1));
  }
}

function rampStep(t) {
  const i = (t * RAMP_STEPS) | 0;
  return i < 0 ? 0 : i >= RAMP_STEPS ? RAMP_STEPS - 1 : i;
}

// ============================== VORTICES ==============================
const VORTEX_HUES = [195, 25, 120, 300];
const MAX_VORTICES = 4;

function makeVortex(x, y, dir, hue) {
  return {
    x, y, dir, hue,
    strength: 24000,
    coreR: 16,
    armPhase: Math.random() * Math.PI * 2,
    dragging: false
  };
}
// Layered core glow baked once per hue instead of three radial gradients
// per vortex per frame.
const vortexSprites = new Map();
function vortexSprite(hue) {
  let cv = vortexSprites.get(hue);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = cv.height = 120;
  const c = cv.getContext('2d');
  c.globalCompositeOperation = 'lighter';
  for (const L of [{ r: 60, a: 0.10 }, { r: 34, a: 0.22 }, { r: 18, a: 0.5 }]) {
    const g = c.createRadialGradient(60, 60, 0, 60, 60, L.r);
    g.addColorStop(0, `hsla(${hue},100%,70%,${L.a})`);
    g.addColorStop(1, `hsla(${hue},100%,50%,0)`);
    c.fillStyle = g;
    c.beginPath(); c.arc(60, 60, L.r, 0, 6.2832); c.fill();
  }
  vortexSprites.set(hue, cv);
  return cv;
}

let vortices = [];
function resetVortices() {
  vortices = [
    makeVortex(W * 0.3, H * 0.5, 1, VORTEX_HUES[0]),
    makeVortex(W * 0.7, H * 0.5, -1, VORTEX_HUES[1])
  ];
  arcs.clear();
}

function addVortex(x, y) {
  if (vortices.length >= MAX_VORTICES) return;
  const hue = VORTEX_HUES[vortices.length % VORTEX_HUES.length];
  const dir = Math.random() < 0.5 ? 1 : -1;
  vortices.push(makeVortex(x, y, dir, hue));
  arcs.clear();
  emitShockwave(x, y, hue);
}

function removeVortex() {
  if (vortices.length <= 1) return;
  const v = vortices.pop();
  if (dragVortex === v) dragVortex = null;
  arcs.clear();
  emitShockwave(v.x, v.y, v.hue);
}

// ============================== PARTICLES ==============================
const BASE_TRAIL = 7, COMET_TRAIL = 24;
let particles = [];
let targetCount = 1200;

function spawnParticle(p) {
  p = p || {};
  // spawn near a random vortex in a ring
  const v = vortices[(Math.random() * vortices.length) | 0];
  const ang = Math.random() * Math.PI * 2;
  const rad = 30 + Math.random() * Math.min(W, H) * 0.32;
  p.x = v.x + Math.cos(ang) * rad;
  p.y = v.y + Math.sin(ang) * rad;
  const tangential = (0.4 + Math.random() * 0.8) * v.dir;
  p.vx = -Math.sin(ang) * tangential * 60;
  p.vy =  Math.cos(ang) * tangential * 60;
  p.life = 0;
  p.maxLife = 6 + Math.random() * 9;          // seconds
  p.comet = Math.random() < 0.02;             // rare blazing comets
  p.size = p.comet ? 2.4 + Math.random() * 1.4 : 0.9 + Math.random() * 1.9;
  p.trailMax = p.comet ? COMET_TRAIL : BASE_TRAIL;
  p.pulseFreq = 2 + Math.random() * 4;
  p.pulsePhase = Math.random() * Math.PI * 2;
  p.colorOffset = Math.random() * 0.15;
  p.trail = [];
  return p;
}

function adjustPopulation() {
  while (particles.length < targetCount) particles.push(spawnParticle());
  if (particles.length > targetCount) particles.length = targetCount;
}

// ============================== SHOCKWAVES + SCREEN SHAKE ==============================
let shockwaves = [];
let shake = 0, shakeX = 0, shakeY = 0;

function emitShockwave(x, y, hue, power = 1) {
  // power scales the ring reach, particle push, screen shake and flash;
  // 1 = the classic vortex-reversal wave, <0.5 = a subtle ripple.
  const reach = Math.min(1.3, 0.55 + power * 0.45);
  shockwaves.push({ x, y, r: 10, maxR: Math.max(W, H) * 0.6 * reach, age: 0, life: 1.1, hue, power });
  shake = Math.max(shake, 10 * power);
  if (power >= 0.5) {
    const fl = document.getElementById('flash');
    fl.style.transition = 'none'; fl.style.opacity = '0.6';
    requestAnimationFrame(() => { fl.style.transition = 'opacity .5s ease-out'; fl.style.opacity = '0'; });
  }
}

// ============================== CHARGE WELL (singularity) ==============================
// Press and hold on empty space: a singularity forms under the pointer and
// gathers particles while it charges. Release to detonate — the longer the
// hold, the bigger the nova burst. A quick tap emits a gentle ripple.
const WELL_MAX_CHARGE = 2.5;   // seconds to full power
const well = { active: false, x: 0, y: 0, charge: 0 };

function cancelWell() { well.active = false; well.charge = 0; }

function releaseWell() {
  if (!well.active) return;
  const c = well.charge;
  well.active = false;
  well.charge = 0;
  if (c < 0.15) {  // quick tap → soft ripple
    emitShockwave(well.x, well.y, 200, 0.35);
    return;
  }
  const k = c / WELL_MAX_CHARGE;
  const hue = 190 + k * 110;
  emitShockwave(well.x, well.y, hue, 0.7 + k * 1.3);
  // fling everything the well gathered
  const R = 170 + k * 230, R2 = R * R;
  const kick = 320 + k * 620;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const dx = p.x - well.x, dy = p.y - well.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > R2 || d2 < 1) continue;
    const d = Math.sqrt(d2);
    const f = (1 - d / R) * kick;
    p.vx += (dx / d) * f;
    p.vy += (dy / d) * f;
  }
  const nSparks = (25 + k * 75) | 0;
  for (let i = 0; i < nSparks; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp = 100 + Math.random() * (200 + k * 400);
    addSpark(well.x, well.y, Math.cos(ang) * sp, Math.sin(ang) * sp, hue);
  }
  if (k > 0.8) showBanner('✦ NOVA BURST ✦');
}

function drawWell(time) {
  if (!well.active) return;
  const c = well.charge / WELL_MAX_CHARGE;
  const hue = 190 + c * 110;   // cyan → violet as it charges
  ctx.globalCompositeOperation = 'lighter';
  // rings collapsing inward — reads as "being sucked in"
  for (let i = 0; i < 3; i++) {
    const t = (time * (0.9 + c * 1.6) + i / 3) % 1;
    const r = (1 - t) * (90 + c * 110);
    ctx.strokeStyle = `hsla(${hue},100%,70%,${t * (0.25 + c * 0.4)})`;
    ctx.lineWidth = 1 + c * 1.5;
    ctx.beginPath(); ctx.arc(well.x, well.y, r, 0, 6.2832); ctx.stroke();
  }
  // hot core grows with charge
  ctx.fillStyle = `hsla(${hue},100%,80%,${0.25 + c * 0.55})`;
  ctx.beginPath();
  ctx.arc(well.x, well.y, 3.5 + c * 10 + Math.sin(time * 9) * c * 2, 0, 6.2832);
  ctx.fill();
}

// ============================== SPARKS ==============================
const SPARK_CAP = 700;
let sparks = [];

function addSpark(x, y, vx, vy, hue) {
  if (sparks.length >= SPARK_CAP) return;
  sparks.push({
    x, y, vx, vy,
    life: 0,
    maxLife: 0.3 + Math.random() * 0.5,
    hue: hue + (Math.random() - 0.5) * 40
  });
}

function updateSparks(dt) {
  const drag = Math.pow(0.94, dt * 60);
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.life += dt;
    if (s.life >= s.maxLife) { sparks.splice(i, 1); continue; }
    s.vx *= drag; s.vy *= drag;
    s.x += s.vx * dt; s.y += s.vy * dt;
  }
}

function drawSparks() {
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let i = 0; i < sparks.length; i++) {
    const s = sparks[i];
    const t = 1 - s.life / s.maxLife;
    ctx.strokeStyle = `hsla(${s.hue},100%,${60 + t * 25}%,${t * 0.85})`;
    ctx.lineWidth = 1.3 * t + 0.4;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - s.vx * 0.035, s.y - s.vy * 0.035);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

// ============================== SUPERNOVA ==============================
function supernova(x, y) {
  const hue = Math.random() * 360;
  emitShockwave(x, y, hue);
  shake = Math.max(shake, 20);
  for (let i = 0; i < 90; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp = 120 + Math.random() * 520;
    addSpark(x, y, Math.cos(ang) * sp, Math.sin(ang) * sp, hue);
  }
  showBanner('✦ SUPERNOVA ✦');
}

// ============================== ENERGY ARCS (all vortex pairs) ==============================
const arcs = new Map(); // key "i|j" -> { timer, path, alpha }

function buildArc(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
  const pts = [];
  const segs = Math.max(6, Math.min(22, (dist / 40) | 0));
  const nx = -dy / dist, ny = dx / dist;
  pts.push({ x: a.x, y: a.y });
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    const wob = (Math.random() - 0.5) * dist * 0.16 * Math.sin(t * Math.PI);
    pts.push({ x: a.x + dx * t + nx * wob, y: a.y + dy * t + ny * wob });
  }
  pts.push({ x: b.x, y: b.y });
  return pts;
}

function drawEnergyArcs(dt) {
  if (vortices.length < 2) return;
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'round';
  for (let i = 0; i < vortices.length; i++) {
    for (let j = i + 1; j < vortices.length; j++) {
      const key = i + '|' + j;
      let A = arcs.get(key);
      if (!A) arcs.set(key, A = { timer: Math.random() * 0.15, path: null, alpha: 0 });
      A.timer -= dt;
      if (A.timer <= 0) {
        A.path = buildArc(vortices[i], vortices[j]);
        A.alpha = 0.5 + Math.random() * 0.5;
        A.timer = 0.05 + Math.random() * 0.12;
      }
      if (!A.path) continue;
      if (dt > 0) A.alpha *= Math.pow(0.02, dt); // rapid flicker decay
      if (A.alpha < 0.02) continue;
      const hue = (vortices[i].hue + vortices[j].hue) / 2;
      const passes = [
        { w: 7,   c: `hsla(${hue},100%,60%,${A.alpha * 0.18})` },
        { w: 3,   c: `hsla(${hue + 10},100%,75%,${A.alpha * 0.4})` },
        { w: 1.2, c: `hsla(0,0%,100%,${A.alpha * 0.9})` }
      ];
      for (const pass of passes) {
        ctx.strokeStyle = pass.c;
        ctx.lineWidth = pass.w;
        ctx.beginPath();
        ctx.moveTo(A.path[0].x, A.path[0].y);
        for (let k = 1; k < A.path.length; k++) ctx.lineTo(A.path[k].x, A.path[k].y);
        ctx.stroke();
      }
    }
  }
}

// ============================== MOUSE / TOUCH ==============================
const mouse = { x: -9999, y: -9999, active: false, shift: false, vx: 0, vy: 0 };
const prevMouse = { x: -9999, y: -9999, active: false };
const MOUSE_MAX_SPEED = 3200;   // caps the stir force from a flicked pointer
const mouseTrail = [];   // delayed chain following cursor
const CHAIN = 14;
for (let i = 0; i < CHAIN; i++) mouseTrail.push({ x: -9999, y: -9999 });

let dragVortex = null, dragMoved = 0, downPos = { x: 0, y: 0 };

function pickVortex(x, y, radius) {
  const r = radius || 42;
  for (const v of vortices) {
    if (Math.hypot(v.x - x, v.y - y) < r) return v;
  }
  return null;
}

function pointerDown(x, y) {
  mouse.x = x; mouse.y = y; mouse.active = true;
  const v = pickVortex(x, y);
  downPos.x = x; downPos.y = y; dragMoved = 0;
  if (v) { dragVortex = v; v.dragging = true; }
  else { well.active = true; well.charge = 0; well.x = x; well.y = y; }
}
function pointerMove(x, y) {
  if (dragVortex) {
    dragMoved += Math.hypot(x - mouse.x, y - mouse.y);
    dragVortex.x = x; dragVortex.y = y;
  }
  if (well.active) { well.x = x; well.y = y; }
  mouse.x = x; mouse.y = y; mouse.active = true;
}
function pointerUp() {
  if (dragVortex) {
    if (dragMoved < 6) {  // it was a click → reverse rotation + shockwave
      dragVortex.dir *= -1;
      emitShockwave(dragVortex.x, dragVortex.y, dragVortex.hue);
    }
    dragVortex.dragging = false;
    dragVortex = null;
  }
  releaseWell();  // no-op unless a well was charging
}

canvas.addEventListener('mousedown', e => { if (e.button === 0) pointerDown(e.clientX, e.clientY); });
window.addEventListener('mousemove', e => pointerMove(e.clientX, e.clientY));
window.addEventListener('mouseup', pointerUp);
document.addEventListener('mouseleave', () => { mouse.active = false; cancelWell(); });

canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  supernova(e.clientX, e.clientY);
});

// touch support
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.touches[0];
  mouse.x = t.clientX; mouse.y = t.clientY; mouse.active = true;
  pointerDown(t.clientX, t.clientY);
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  const t = e.touches[0];
  pointerMove(t.clientX, t.clientY);
}, { passive: false });
canvas.addEventListener('touchend', e => {
  e.preventDefault();
  pointerUp();
  mouse.active = false;
}, { passive: false });

// ============================== KEYBOARD ==============================
let paused = false;
let warp = 1, warpTarget = 1;
let keyShift = false;  // tracked separately so gestures can also drive repulse

window.addEventListener('keydown', e => {
  if (e.key === 'Shift') { keyShift = true; mouse.shift = true; return; }
  if (e.code === 'Space') { e.preventDefault(); warpTarget = 0.22; return; }
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === 'p') {
    paused = !paused;
    showBanner(paused ? '⏸ PAUSED' : '▶ RESUME');
  } else if (k === 'v') {
    const x = mouse.active ? mouse.x : W / 2;
    const y = mouse.active ? mouse.y : H / 2;
    addVortex(x, y);
  } else if (k === 'x') {
    removeVortex();
  } else if (k === 'g') {
    toggleGestures();
  } else if (k >= '1' && k <= '4') {
    setTheme(parseInt(k, 10) - 1);
  }
});
window.addEventListener('keyup', e => {
  if (e.key === 'Shift') { keyShift = false; mouse.shift = false; }
  if (e.code === 'Space') warpTarget = 1;
});

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  targetCount = Math.max(200, Math.min(2000, targetCount - Math.sign(e.deltaY) * 100));
  adjustPopulation();
}, { passive: false });

canvas.addEventListener('dblclick', () => {
  cancelWell();
  resetVortices();
  targetCount = 1200;
  particles.length = 0;
  adjustPopulation();
  shockwaves.length = 0;
  sparks.length = 0;
  emitShockwave(W / 2, H / 2, 200);
});

// ============================== WEBCAM GESTURES (MediaPipe Hands via CDN) ==============================
// Press G to toggle. Requires a secure context (https:// or http://localhost)
// for webcam access, plus network access to the jsDelivr CDN.
//
// Gestures (one hand, mirrored like a mirror):
//   ☝ POINT   — cursor follows index fingertip, attracts particles
//   ✊ FIST    — repulse particles (same as holding SHIFT)
//   🤏 PINCH   — grab the nearest vortex core and drag it
//   ✌ VICTORY — trigger a supernova at the hand (2 s cooldown)

const MP_HANDS_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240';
const MP_CAM_BASE   = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3.1675466862';

const gesture = {
  enabled: false,       // user toggled on and camera is running
  loading: false,       // CDN scripts / camera still initializing
  tracking: false,      // a hand is currently detected
  x: -9999, y: -9999,   // smoothed screen-space cursor
  rawX: 0, rawY: 0,     // latest raw target from the detector
  name: 'NONE',         // POINT | PINCH | FIST | VICTORY
  pinch: false,
  fist: false,
  lostFrames: 0
};
let mpHands = null, mpCamera = null, camVideo = null;
let gestureDrag = null;
let lastGestureNova = -10;
const gestureEl = document.getElementById('gesture');

function setGestureHud(text, color) {
  gestureEl.textContent = 'GESTURE: ' + text;
  gestureEl.style.color = color || '';
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });
}

const gdist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Classify a single hand from its 21 normalized landmarks.
function classifyHand(lm) {
  const wrist = lm[0];
  const scale = gdist(wrist, lm[9]) || 0.001;           // wrist -> middle MCP
  // a finger is "extended" when its tip is clearly farther from the wrist than its PIP joint
  const ext = (tip, pip) => gdist(lm[tip], wrist) > gdist(lm[pip], wrist) * 1.15;
  const index  = ext(8, 6);
  const middle = ext(12, 10);
  const ring   = ext(16, 14);
  const pinky  = ext(20, 18);
  const pinching = gdist(lm[4], lm[8]) < scale * 0.4;   // thumb tip near index tip
  if (pinching) return 'PINCH';
  if (index && middle && !ring && !pinky) return 'VICTORY';
  if (!index && !middle && !ring && !pinky) return 'FIST';
  return 'POINT';
}

function onHandResults(results) {
  const hands = results.multiHandLandmarks;
  if (!hands || hands.length === 0) {
    // small grace period so momentary detection dropouts don't flicker
    if (++gesture.lostFrames > 6 && gesture.tracking) {
      gesture.tracking = false;
      gesture.name = 'NONE';
      gesture.pinch = gesture.fist = false;
      releaseGestureDrag();
      mouse.active = false;
      mouse.shift = keyShift;
      if (gesture.enabled) setGestureHud('ON — SHOW A HAND', '#a4ffd0');
    }
    return;
  }
  gesture.lostFrames = 0;

  const lm = hands[0];
  const name = classifyHand(lm);
  // fist has no fingertip to point with — anchor on the palm instead
  const anchor = (name === 'FIST') ? lm[9] : lm[8];
  // camera frame is unmirrored; flip X so movement matches a mirror
  gesture.rawX = (1 - anchor.x) * W;
  gesture.rawY = anchor.y * H;
  if (!gesture.tracking) { gesture.x = gesture.rawX; gesture.y = gesture.rawY; }
  gesture.tracking = true;
  gesture.name = name;
  gesture.pinch = (name === 'PINCH');
  gesture.fist = (name === 'FIST');
}

function releaseGestureDrag() {
  if (gestureDrag) {
    gestureDrag.dragging = false;
    gestureDrag = null;
  }
}

async function enableGestures() {
  if (gesture.loading || gesture.enabled) return;
  gesture.loading = true;
  setGestureHud('LOADING…', '#ffd27f');
  showBanner('◈ LOADING HAND TRACKING ◈');
  try {
    if (!window.Hands)  await loadScript(MP_HANDS_BASE + '/hands.js');
    if (!window.Camera) await loadScript(MP_CAM_BASE + '/camera_utils.js');

    camVideo = document.getElementById('cam');

    mpHands = new window.Hands({ locateFile: f => `${MP_HANDS_BASE}/${f}` });
    mpHands.setOptions({
      maxNumHands: 1,
      modelComplexity: 0,          // lite model — keeps the particle sim smooth
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.5
    });
    mpHands.onResults(onHandResults);

    mpCamera = new window.Camera(camVideo, {
      onFrame: async () => { if (mpHands) await mpHands.send({ image: camVideo }); },
      width: 640,
      height: 480
    });
    await mpCamera.start();

    gesture.enabled = true;
    camVideo.style.display = 'block';
    setGestureHud('ON — SHOW A HAND', '#a4ffd0');
    showBanner('✋ GESTURES ON');
  } catch (err) {
    console.warn('Gesture init failed:', err);
    setGestureHud('UNAVAILABLE', '#ff8f7f');
    showBanner('⚠ CAMERA / CDN UNAVAILABLE');
    teardownGestures();
  } finally {
    gesture.loading = false;
  }
}

function teardownGestures() {
  gesture.enabled = false;
  gesture.tracking = false;
  gesture.name = 'NONE';
  gesture.pinch = gesture.fist = false;
  releaseGestureDrag();
  if (mpCamera) { try { mpCamera.stop(); } catch (_) {} mpCamera = null; }
  if (mpHands)  { try { mpHands.close(); } catch (_) {} mpHands = null; }
  if (camVideo) {
    camVideo.style.display = 'none';
    const stream = camVideo.srcObject;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      camVideo.srcObject = null;
    }
  }
  mouse.active = false;
  mouse.shift = keyShift;
}

function toggleGestures() {
  if (gesture.loading) return;               // ignore toggles mid-init
  if (gesture.enabled) {
    teardownGestures();
    setGestureHud('OFF (press G)', '');
    showBanner('✋ GESTURES OFF');
  } else {
    enableGestures();
  }
}

// Called every frame: smooths the cursor and drives the existing
// mouse/vortex systems from the tracked hand.
function applyGestureControl(dt) {
  if (!gesture.enabled || !gesture.tracking) return;

  // frame-rate independent smoothing toward the raw detector position
  const k = 1 - Math.pow(0.0005, dt);
  gesture.x += (gesture.rawX - gesture.x) * k;
  gesture.y += (gesture.rawY - gesture.y) * k;

  // the hand owns the pointer while tracked
  mouse.x = gesture.x;
  mouse.y = gesture.y;
  mouse.active = true;
  mouse.shift = gesture.fist || keyShift;

  // pinch = grab & drag the nearest core (generous 70px pick radius)
  if (gesture.pinch) {
    if (!gestureDrag) {
      gestureDrag = pickVortex(gesture.x, gesture.y, 70);
      if (gestureDrag) gestureDrag.dragging = true;
    }
    if (gestureDrag) {
      gestureDrag.x = gesture.x;
      gestureDrag.y = gesture.y;
    }
  } else {
    releaseGestureDrag();
  }

  // victory sign = supernova, rate-limited
  if (gesture.name === 'VICTORY' && simTime - lastGestureNova > 2) {
    lastGestureNova = simTime;
    supernova(gesture.x, gesture.y);
  }
}

// Glowing hand cursor drawn on the main canvas.
function drawGestureCursor(time) {
  if (!gesture.enabled || !gesture.tracking) return;
  ctx.globalCompositeOperation = 'lighter';
  const hue = gesture.pinch ? 48
            : gesture.fist ? 0
            : gesture.name === 'VICTORY' ? 300
            : 165;
  const r = 16 + Math.sin(time * 5) * 2 + (gesture.pinch ? -6 : 0);

  ctx.strokeStyle = `hsla(${hue},100%,70%,0.85)`;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(gesture.x, gesture.y, r, 0, 6.2832); ctx.stroke();

  ctx.fillStyle = `hsla(${hue},100%,80%,0.9)`;
  ctx.beginPath(); ctx.arc(gesture.x, gesture.y, 3, 0, 6.2832); ctx.fill();

  // rotating crosshair ticks
  ctx.strokeStyle = `hsla(${hue},100%,80%,0.5)`;
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + time * 1.5;
    ctx.beginPath();
    ctx.moveTo(gesture.x + Math.cos(a) * (r + 4), gesture.y + Math.sin(a) * (r + 4));
    ctx.lineTo(gesture.x + Math.cos(a) * (r + 10), gesture.y + Math.sin(a) * (r + 10));
    ctx.stroke();
  }
}

// ============================== BANNER ==============================
const bannerEl = document.getElementById('banner');
let bannerTimeout = 0;
function showBanner(text) {
  bannerEl.textContent = text;
  bannerEl.style.opacity = '1';
  clearTimeout(bannerTimeout);
  bannerTimeout = setTimeout(() => { bannerEl.style.opacity = '0'; }, 1100);
}

// ============================== SPATIAL GRID (connections) ==============================
const CELL = 70;
// Cell coords packed into one integer key (offset keeps them positive) —
// avoids building and re-parsing "x,y" strings every frame.
const GRID_HALF = 512, GRID_SPAN = 1024;
function buildGrid() {
  const grid = new Map();
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const key = (((p.x / CELL) | 0) + GRID_HALF) * GRID_SPAN + (((p.y / CELL) | 0) + GRID_HALF);
    let arr = grid.get(key);
    if (!arr) grid.set(key, arr = []);
    arr.push(p);
  }
  return grid;
}

// ============================== PHYSICS ==============================
function updateParticle(p, dt) {
  p.life += dt;
  if (p.life >= p.maxLife) { spawnParticle(p); return; }

  let ax = 0, ay = 0;

  for (const v of vortices) {
    let dx = v.x - p.x, dy = v.y - p.y;
    let d2 = dx * dx + dy * dy;
    if (d2 < 100) d2 = 100;
    const d = Math.sqrt(d2);
    const f = v.strength / d2;
    // inward pull + tangential swirl
    ax += (dx / d) * f * 0.55;
    ay += (dy / d) * f * 0.55;
    ax += (-dy / d) * f * v.dir * 1.35;
    ay += ( dx / d) * f * v.dir * 1.35;
    // strong core repulsion so particles orbit instead of collapsing
    if (d < 55) {
      const rep = (55 - d) * 34;
      ax -= (dx / d) * rep; ay -= (dy / d) * rep;
      // grazing the core throws off hot sparks
      if (d < 48 && Math.random() < dt * 1.4) {
        addSpark(p.x, p.y,
          p.vx * 0.35 + (Math.random() - 0.5) * 180,
          p.vy * 0.35 + (Math.random() - 0.5) * 180,
          v.hue);
      }
    }
  }

  // mouse attraction / shift-repulsion / fluid stir
  if (mouse.active && !well.active) {
    const mdx = mouse.x - p.x, mdy = mouse.y - p.y;
    const md2 = mdx * mdx + mdy * mdy;
    if (md2 < 180 * 180 && md2 > 4) {
      const md = Math.sqrt(md2);
      const w = 1 - md / 180;
      const mf = w * 620 * (mouse.shift ? -1.6 : 1);
      ax += (mdx / md) * mf; ay += (mdy / md) * mf;
      // stir: a fast-moving pointer drags nearby particles along with it,
      // like a hand swept through water
      ax += mouse.vx * w * 2.2;
      ay += mouse.vy * w * 2.2;
    }
  }

  // charge well: gathers particles in a swirl while held
  if (well.active) {
    const wdx = well.x - p.x, wdy = well.y - p.y;
    const wd2 = wdx * wdx + wdy * wdy;
    const wr = 220 + well.charge * 170;
    if (wd2 < wr * wr && wd2 > 25) {
      const wd = Math.sqrt(wd2);
      const wf = (1 - wd / wr) * (900 + well.charge * 1500);
      // inward pull with a tangential component so captures spiral, not clump
      ax += (wdx / wd) * wf * 0.8 + (-wdy / wd) * wf * 0.45;
      ay += (wdy / wd) * wf * 0.8 + ( wdx / wd) * wf * 0.45;
    }
  }

  // shockwave push
  for (const s of shockwaves) {
    const sdx = p.x - s.x, sdy = p.y - s.y;
    const sd = Math.sqrt(sdx * sdx + sdy * sdy);
    const band = Math.abs(sd - s.r);
    if (band < 42 && sd > 1) {
      const push = (1 - band / 42) * 2400 * s.power * (1 - s.age / s.life);
      ax += (sdx / sd) * push; ay += (sdy / sd) * push;
    }
  }

  p.vx += ax * dt; p.vy += ay * dt;
  // drag
  const drag = Math.pow(0.985, dt * 60);
  p.vx *= drag; p.vy *= drag;
  // speed cap
  const sp2 = p.vx * p.vx + p.vy * p.vy;
  const MAXS = 420;
  if (sp2 > MAXS * MAXS) { const s = MAXS / Math.sqrt(sp2); p.vx *= s; p.vy *= s; }

  p.x += p.vx * dt; p.y += p.vy * dt;

  // soft wrap (clear trail across the seam so it doesn't streak the screen)
  let wrapped = false;
  if (p.x < -60) { p.x = W + 60; wrapped = true; }
  else if (p.x > W + 60) { p.x = -60; wrapped = true; }
  if (p.y < -60) { p.y = H + 60; wrapped = true; }
  else if (p.y > H + 60) { p.y = -60; wrapped = true; }
  if (wrapped) p.trail.length = 0;

  // trail record
  p.trail.push(p.x, p.y);
  if (p.trail.length > p.trailMax * 2) p.trail.splice(0, p.trail.length - p.trailMax * 2);
}

// ============================== RENDER ==============================
function envelope(p) {
  // fade in / fade out
  const fadeIn = Math.min(1, p.life / 0.8);
  const fadeOut = Math.min(1, (p.maxLife - p.life) / 1.2);
  return Math.min(fadeIn, fadeOut);
}

function drawParticles(time) {
  ctx.globalCompositeOperation = 'lighter';

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const env = envelope(p);
    if (env <= 0.01) continue;

    const step = rampStep(p.life / p.maxLife + p.colorOffset);
    const pulse = 1 + 0.35 * Math.sin(time * p.pulseFreq + p.pulsePhase);
    const size = p.size * pulse;

    // ---- trail (fading segments, one cached color per particle) ----
    const tr = p.trail;
    const n = tr.length / 2;
    if (n > 2) {
      ctx.strokeStyle = rampStrokes[step];
      const trailBoost = p.comet ? 1.9 : 1.1;
      const alphaScale = (p.comet ? 0.5 : 0.30) * env;
      for (let j = 1; j < n; j++) {
        ctx.globalAlpha = (j / n) * alphaScale;
        ctx.lineWidth = size * (j / n) * trailBoost;
        ctx.beginPath();
        ctx.moveTo(tr[(j - 1) * 2], tr[(j - 1) * 2 + 1]);
        ctx.lineTo(tr[j * 2], tr[j * 2 + 1]);
        ctx.stroke();
      }
    }

    // ---- halo + mid glow + core in one pre-baked sprite ----
    const r = size * (p.comet ? 9 : 7);
    ctx.globalAlpha = env;
    ctx.drawImage(p.comet ? cometSprites[step] : particleSprites[step],
      p.x - r, p.y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
}

function drawConnections() {
  const grid = buildGrid();
  const MAXD = 62, MAXD2 = MAXD * MAXD;
  let budget = 900; // segment cap for perf
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = 0.6;

  for (const [key, cell] of grid) {
    for (let a = 0; a < cell.length && budget > 0; a++) {
      const p = cell[a];
      ctx.strokeStyle = rampStrokes[rampStep(p.life / p.maxLife)];
      // same cell + right/down neighbors to avoid dupes
      for (let ox = 0; ox <= 1 && budget > 0; ox++) {
        for (let oy = (ox === 0 ? 0 : -1); oy <= 1 && budget > 0; oy++) {
          const other = (ox === 0 && oy === 0) ? cell : grid.get(key + ox * GRID_SPAN + oy);
          if (!other) continue;
          const start = (other === cell) ? a + 1 : 0;
          for (let b = start; b < other.length && budget > 0; b++) {
            const q = other[b];
            const dx = p.x - q.x, dy = p.y - q.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < MAXD2) {
              ctx.globalAlpha = (1 - d2 / MAXD2) * 0.10;
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(q.x, q.y);
              ctx.stroke();
              budget--;
            }
          }
        }
      }
    }
  }
  ctx.globalAlpha = 1;
}

function drawVortex(v, time) {
  ctx.globalCompositeOperation = 'lighter';

  // core layered glow (pre-baked per hue)
  ctx.drawImage(vortexSprite(v.hue), v.x - 60, v.y - 60);
  // white-hot nucleus (pulsing)
  const nuc = v.coreR * (0.55 + 0.12 * Math.sin(time * 3 + v.hue));
  ctx.fillStyle = `hsla(${v.hue},60%,95%,0.95)`;
  ctx.beginPath(); ctx.arc(v.x, v.y, nuc, 0, 6.2832); ctx.fill();

  // rotating spiral arms of dots
  const ARMS = 3, PER = 16;
  for (let arm = 0; arm < ARMS; arm++) {
    const base = v.armPhase * v.dir + (arm / ARMS) * Math.PI * 2;
    for (let k = 1; k <= PER; k++) {
      const tt = k / PER;
      const ang = base + tt * 2.6 * v.dir;
      const rad = 18 + tt * 78;
      const x = v.x + Math.cos(ang) * rad;
      const y = v.y + Math.sin(ang) * rad;
      const a = (1 - tt) * 0.55;
      const s = (1 - tt) * 2.6 + 0.6;
      ctx.fillStyle = `hsla(${v.hue + tt * 40},100%,${70 - tt * 15}%,${a})`;
      ctx.beginPath(); ctx.arc(x, y, s, 0, 6.2832); ctx.fill();
    }
  }

  // hover hint ring
  const hovered = !v.dragging && mouse.active &&
    Math.hypot(v.x - mouse.x, v.y - mouse.y) < 42;
  if (hovered) {
    ctx.strokeStyle = `hsla(${v.hue},100%,80%,0.25)`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(v.x, v.y, 44, 0, 6.2832); ctx.stroke();
  }

  // drag hint ring
  if (v.dragging) {
    ctx.strokeStyle = `hsla(${v.hue},100%,80%,0.6)`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.arc(v.x, v.y, 46, 0, 6.2832); ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawShockwaves(dt) {
  ctx.globalCompositeOperation = 'lighter';
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const s = shockwaves[i];
    s.age += dt;
    if (s.age >= s.life) { shockwaves.splice(i, 1); continue; }
    const t = s.age / s.life;
    s.r = 10 + t * t * s.maxR * 1.4;
    const a = (1 - t);
    // double ring
    ctx.lineWidth = 8 * (1 - t) + 1;
    ctx.strokeStyle = `hsla(${s.hue},100%,70%,${a * 0.5})`;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.2832); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = `hsla(${s.hue + 30},100%,88%,${a * 0.8})`;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 0.92, 0, 6.2832); ctx.stroke();
  }
}

function drawMouseTrail(dt, time) {
  if (!mouse.active) return;
  // delayed follow chain
  let px = mouse.x, py = mouse.y;
  const ease = 1 - Math.pow(0.0001, dt); // frame-rate independent lerp
  for (let i = 0; i < CHAIN; i++) {
    const node = mouseTrail[i];
    node.x += (px - node.x) * ease * (1 - i * 0.04);
    node.y += (py - node.y) * ease * (1 - i * 0.04);
    px = node.x; py = node.y;
  }
  ctx.globalCompositeOperation = 'lighter';
  const hue = mouse.shift ? 0 : 160;
  for (let i = 0; i < CHAIN; i++) {
    const node = mouseTrail[i];
    const t = 1 - i / CHAIN;
    const s = t * 4 + 0.5 + Math.sin(time * 6 + i) * 0.8;
    ctx.fillStyle = `hsla(${hue + i * 8},100%,70%,${t * 0.35})`;
    ctx.beginPath(); ctx.arc(node.x, node.y, Math.max(0.3, s), 0, 6.2832); ctx.fill();
  }
}

// ============================== BLOOM ==============================
function applyBloom() {
  // downscale current frame into bloom buffer
  bloomCtx.setTransform(1, 0, 0, 1, 0, 0);
  bloomCtx.clearRect(0, 0, bloomCv.width, bloomCv.height);
  bloomCtx.drawImage(canvas, 0, 0, bloomCv.width, bloomCv.height);
  // composite back, upscaled + blurred = bloom
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.55;
  if ('filter' in ctx) ctx.filter = 'blur(6px)';
  ctx.drawImage(bloomCv, 0, 0, W, H);
  ctx.filter = 'none';
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ============================== HUD ==============================
const fpsEl = document.getElementById('fps');
const pcEl = document.getElementById('pcount');
const modeEl = document.getElementById('mode');
const themeEl = document.getElementById('theme');
const stateEl = document.getElementById('state');
let fpsAccum = 0, fpsFrames = 0, fpsShown = 60, hudTimer = 0;

// ============================== MAIN LOOP ==============================
let last = performance.now();
let nebDrift = 0;
let simTime = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;   // clamp spikes

  // time warp (slow-mo) + pause
  warp += (warpTarget - warp) * Math.min(1, dt * 8);
  const sdt = paused ? 0 : dt * warp;
  simTime += sdt;
  const time = simTime;

  // ---- webcam gesture control (drives the pointer/vortices) ----
  applyGestureControl(dt);

  // ---- pointer velocity (drives the fluid stir force) ----
  if (mouse.active && prevMouse.active && dt > 0) {
    const k = Math.min(1, dt * 14);
    mouse.vx += ((mouse.x - prevMouse.x) / dt - mouse.vx) * k;
    mouse.vy += ((mouse.y - prevMouse.y) / dt - mouse.vy) * k;
    const msp2 = mouse.vx * mouse.vx + mouse.vy * mouse.vy;
    if (msp2 > MOUSE_MAX_SPEED * MOUSE_MAX_SPEED) {
      const s = MOUSE_MAX_SPEED / Math.sqrt(msp2);
      mouse.vx *= s; mouse.vy *= s;
    }
  } else {
    mouse.vx = 0; mouse.vy = 0;
  }
  prevMouse.x = mouse.x; prevMouse.y = mouse.y; prevMouse.active = mouse.active;

  // ---- charge well ----
  if (well.active) well.charge = Math.min(WELL_MAX_CHARGE, well.charge + sdt);

  // ---- update ----
  for (const v of vortices) v.armPhase += sdt * 1.8;
  if (sdt > 0) {
    for (let i = 0; i < particles.length; i++) updateParticle(particles[i], sdt);
    updateSparks(sdt);
  }

  // ---- screen shake ----
  if (shake > 0.1) {
    shakeX = (Math.random() * 2 - 1) * shake;
    shakeY = (Math.random() * 2 - 1) * shake;
    shake *= Math.pow(0.02, dt);
  } else {
    shake = 0; shakeX = 0; shakeY = 0;
  }

  // ---- clear with dark fade (motion persistence) ----
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(2, 2, 10, 0.42)';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(shakeX, shakeY);

  // ---- nebula (slow drift, screen blend) ----
  nebDrift += sdt * 4;
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.8 + 0.2 * Math.sin(time * 0.3);
  const ox = Math.sin(nebDrift * 0.01) * 20, oy = Math.cos(nebDrift * 0.013) * 15;
  ctx.drawImage(nebulaCv, ox, oy);
  ctx.globalAlpha = 1;

  // ---- scene ----
  drawTwinkles(time);
  drawConnections();
  drawParticles(time);
  drawEnergyArcs(sdt);
  for (const v of vortices) drawVortex(v, time);
  drawShockwaves(sdt);
  drawWell(time);
  drawSparks();

  ctx.restore();

  drawMouseTrail(dt, time);
  drawGestureCursor(time);

  // ---- bloom post-process ----
  applyBloom();

  ctx.globalCompositeOperation = 'source-over';

  // ---- HUD ----
  fpsAccum += dt; fpsFrames++;
  hudTimer += dt;
  if (hudTimer > 0.4) {
    fpsShown = Math.round(fpsFrames / fpsAccum);
    fpsAccum = 0; fpsFrames = 0; hudTimer = 0;
    fpsEl.textContent = 'FPS: ' + fpsShown;
    pcEl.textContent = 'PARTICLES: ' + particles.length;
    modeEl.textContent = 'MODE: ' + (well.active ? 'SINGULARITY' : mouse.shift ? 'REPULSE' : 'ATTRACT');
    modeEl.style.color = well.active ? '#d0a4ff' : mouse.shift ? '#ff8f7f' : '#7fd4ff';
    if (gesture.enabled && gesture.tracking) {
      setGestureHud('✋ ' + gesture.name,
        gesture.fist ? '#ff8f7f' : gesture.pinch ? '#ffd27f' : '#a4ffd0');
    }
    stateEl.textContent = paused ? '⏸ PAUSED'
      : (warpTarget < 1 ? '◉ TIME WARP' : '');
    stateEl.style.color = paused ? '#ffd27f' : '#a4ffd0';
  }
}

// ============================== SERVER CONFIG (optional) ==============================
// Fetches /api/config when served by server.js; silently falls back otherwise.
function loadServerConfig() {
  try {
    fetch('/api/config')
      .then(r => (r.ok ? r.json() : null))
      .then(cfg => {
        if (!cfg) return;
        if (Number.isFinite(cfg.particles)) {
          targetCount = Math.max(200, Math.min(2000, cfg.particles | 0));
          adjustPopulation();
        }
        if (Number.isFinite(cfg.theme)) setTheme(cfg.theme | 0);
      })
      .catch(() => {});
  } catch (_) { /* fetch unavailable (e.g. file://) — ignore */ }
}

// ============================== BOOT ==============================
window.addEventListener('resize', resize);
rebuildSprites();
resize();
resetVortices();
adjustPopulation();
loadServerConfig();
ctx.fillStyle = '#020208';
ctx.fillRect(0, 0, W, H);
requestAnimationFrame(frame);

})();
