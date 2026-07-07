/**
 * Particle Exchange — Dual Vortex Canvas Visualization
 * Vanilla JS + Canvas 2D. No build tools.
 */
(() => {
  'use strict';

  // =========================================================================
  // Setup
  // =========================================================================
  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d');

  let W = window.innerWidth;
  let H = window.innerHeight;
  canvas.width = W;
  canvas.height = H;

  // Offscreen buffer for bloom post-processing (quarter resolution)
  const bloomCanvas = document.createElement('canvas');
  const bloomCtx = bloomCanvas.getContext('2d');

  // Pre-rendered nebula + starfield background
  const bgCanvas = document.createElement('canvas');
  const bgCtx = bgCanvas.getContext('2d');

  // =========================================================================
  // Config / state
  // =========================================================================
  const config = {
    count: 1000,
    minCount: 200,
    maxCount: 2000,
    speed: 1.0,
    trailLength: 8,
    connectionDistance: 90,
    bloom: true
  };

  // Color palette: blue -> cyan -> orange -> purple (hue keyframes)
  const HUE_STOPS = [220, 185, 30, 280, 220];

  const vortices = [
    makeVortex(0, 0.3, 0.5, 1),
    makeVortex(1, 0.7, 0.5, -1)
  ];

  function makeVortex(id, nx, ny, direction) {
    return {
      id,
      x: nx * W,
      y: ny * H,
      nx, ny,
      direction,          // 1 = CCW, -1 = CW
      strength: 1.0,
      radius: 22,
      armAngle: Math.random() * Math.PI * 2,
      dragging: false
    };
  }

  let particles = [];
  const shockwaves = [];
  const lightningBolts = [];
  const mouseTrail = [];

  const mouse = { x: W / 2, y: H / 2, active: false, shift: false, down: false };
  let dragTarget = null;
  let dragMoved = false;

  // FPS tracking
  let fps = 0;
  let frameCount = 0;
  let lastFpsTime = performance.now();
  let lastFrame = performance.now();

  // =========================================================================
  // Glow sprite cache (multi-layer: core + mid + halo) per hue bucket
  // =========================================================================
  const SPRITE_SIZE = 48;
  const HUE_BUCKETS = 64;
  const spriteCache = [];

  function buildSprites() {
    for (let i = 0; i < HUE_BUCKETS; i++) {
      const hue = (i / HUE_BUCKETS) * 360;
      const c = document.createElement('canvas');
      c.width = SPRITE_SIZE;
      c.height = SPRITE_SIZE;
      const g = c.getContext('2d');
      const cx = SPRITE_SIZE / 2;

      // Layer 3: halo
      let grad = g.createRadialGradient(cx, cx, 0, cx, cx, cx);
      grad.addColorStop(0, `hsla(${hue}, 100%, 65%, 0.28)`);
      grad.addColorStop(0.5, `hsla(${hue}, 100%, 55%, 0.10)`);
      grad.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

      // Layer 2: mid glow
      grad = g.createRadialGradient(cx, cx, 0, cx, cx, cx * 0.45);
      grad.addColorStop(0, `hsla(${hue}, 100%, 70%, 0.85)`);
      grad.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

      // Layer 1: hot core
      grad = g.createRadialGradient(cx, cx, 0, cx, cx, cx * 0.16);
      grad.addColorStop(0, 'hsla(0, 0%, 100%, 1)');
      grad.addColorStop(0.6, `hsla(${hue}, 100%, 85%, 0.9)`);
      grad.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

      spriteCache.push(c);
    }
  }
  buildSprites();

  function hueAt(t) {
    // t in [0,1) mapped across HUE_STOPS keyframes
    const seg = t * (HUE_STOPS.length - 1);
    const i = Math.floor(seg);
    const f = seg - i;
    let a = HUE_STOPS[i];
    let b = HUE_STOPS[Math.min(i + 1, HUE_STOPS.length - 1)];
    // shortest-path hue interpolation
    let d = b - a;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return ((a + d * f) + 360) % 360;
  }

  // =========================================================================
  // Particles
  // =========================================================================
  function makeParticle() {
    const x = Math.random() * W;
    const y = Math.random() * H;
    return {
      x, y,
      vx: (Math.random() - 0.5) * 1.5,
      vy: (Math.random() - 0.5) * 1.5,
      size: 0.6 + Math.random() * 1.8,
      colorPhase: Math.random(),
      colorSpeed: 0.0004 + Math.random() * 0.0012,
      trail: []
    };
  }

  function setParticleCount(n) {
    n = Math.max(config.minCount, Math.min(config.maxCount, Math.round(n)));
    config.count = n;
    while (particles.length < n) particles.push(makeParticle());
    if (particles.length > n) particles.length = n;
    pushConfigDebounced();
  }

  function resetScene() {
    vortices[0].nx = 0.3; vortices[0].ny = 0.5; vortices[0].direction = 1;
    vortices[1].nx = 0.7; vortices[1].ny = 0.5; vortices[1].direction = -1;
    vortices.forEach((v) => { v.x = v.nx * W; v.y = v.ny * H; });
    particles = [];
    setParticleCount(1000);
    shockwaves.length = 0;
    lightningBolts.length = 0;
    spawnShockwave(W / 2, H / 2, 200);
  }

  // =========================================================================
  // Background: nebula + starfield (pre-rendered)
  // =========================================================================
  function renderBackground() {
    bgCanvas.width = W;
    bgCanvas.height = H;
    const g = bgCtx;

    g.fillStyle = '#04040c';
    g.fillRect(0, 0, W, H);

    // Nebula clouds
    const clouds = [
      { x: W * 0.25, y: H * 0.35, r: Math.max(W, H) * 0.45, hue: 225, a: 0.10 },
      { x: W * 0.75, y: H * 0.6, r: Math.max(W, H) * 0.4, hue: 280, a: 0.09 },
      { x: W * 0.5, y: H * 0.85, r: Math.max(W, H) * 0.35, hue: 190, a: 0.06 },
      { x: W * 0.85, y: H * 0.15, r: Math.max(W, H) * 0.3, hue: 25, a: 0.05 }
    ];
    clouds.forEach((c) => {
      const grad = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
      grad.addColorStop(0, `hsla(${c.hue}, 80%, 40%, ${c.a})`);
      grad.addColorStop(0.6, `hsla(${c.hue}, 80%, 30%, ${c.a * 0.4})`);
      grad.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    });

    // Star field
    const starCount = Math.floor((W * H) / 3500);
    for (let i = 0; i < starCount; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const r = Math.random() * 1.2;
      const a = 0.15 + Math.random() * 0.65;
      g.fillStyle = `rgba(255, 255, 255, ${a})`;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      if (Math.random() < 0.06) {
        // occasional bright star with glow
        const grad = g.createRadialGradient(x, y, 0, x, y, 6);
        grad.addColorStop(0, 'rgba(200, 225, 255, 0.5)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        g.fillStyle = grad;
        g.fillRect(x - 6, y - 6, 12, 12);
      }
    }
  }

  // =========================================================================
  // Effects
  // =========================================================================
  function spawnShockwave(x, y, maxR = 260) {
    shockwaves.push({ x, y, r: 4, maxR, alpha: 1 });
  }

  function spawnLightning() {
    const [a, b] = vortices;
    const points = [{ x: a.x, y: a.y }];
    const segs = 14;
    const dx = (b.x - a.x) / segs;
    const dy = (b.y - a.y) / segs;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    for (let i = 1; i < segs; i++) {
      const jitter = (Math.random() - 0.5) * len * 0.14 * Math.sin((i / segs) * Math.PI);
      points.push({
        x: a.x + dx * i + nx * jitter,
        y: a.y + dy * i + ny * jitter
      });
    }
    points.push({ x: b.x, y: b.y });
    lightningBolts.push({ points, life: 1 });
  }

  // =========================================================================
  // Physics
  // =========================================================================
  function updateParticles(dt) {
    const speedMul = config.speed * dt * 60;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // Trail bookkeeping
      p.trail.push(p.x, p.y);
      const maxTrail = config.trailLength * 2;
      if (p.trail.length > maxTrail) p.trail.splice(0, p.trail.length - maxTrail);

      // Vortex forces: radial pull + tangential swirl
      for (let v = 0; v < vortices.length; v++) {
        const vor = vortices[v];
        let dx = vor.x - p.x;
        let dy = vor.y - p.y;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq) + 0.001;

        if (dist < 8000) {
          const inv = 1 / dist;
          dx *= inv; dy *= inv;
          const falloff = Math.min(1, 22000 / (distSq + 4000));
          const pull = 0.055 * vor.strength * falloff;
          const swirl = 0.16 * vor.strength * falloff * vor.direction;
          p.vx += dx * pull + (-dy) * swirl;
          p.vy += dy * pull + (dx) * swirl;

          // core repulsion so particles orbit instead of collapsing
          if (dist < 46) {
            p.vx -= dx * (46 - dist) * 0.02;
            p.vy -= dy * (46 - dist) * 0.02;
          }
        }
      }

      // Mouse attraction / repulsion (shift)
      if (mouse.active) {
        let mdx = mouse.x - p.x;
        let mdy = mouse.y - p.y;
        const mDistSq = mdx * mdx + mdy * mdy;
        if (mDistSq < 32400 && mDistSq > 1) {
          const mDist = Math.sqrt(mDistSq);
          const f = (1 - mDist / 180) * 0.09 * (mouse.shift ? -1.8 : 1);
          p.vx += (mdx / mDist) * f;
          p.vy += (mdy / mDist) * f;
        }
      }

      // Shockwave push
      for (let s = 0; s < shockwaves.length; s++) {
        const sw = shockwaves[s];
        const sdx = p.x - sw.x;
        const sdy = p.y - sw.y;
        const sd = Math.hypot(sdx, sdy);
        if (Math.abs(sd - sw.r) < 30 && sd > 0.5) {
          const f = sw.alpha * 1.4;
          p.vx += (sdx / sd) * f;
          p.vy += (sdy / sd) * f;
        }
      }

      // Damping + integrate
      p.vx *= 0.968;
      p.vy *= 0.968;
      p.x += p.vx * speedMul;
      p.y += p.vy * speedMul;

      // Soft wrap at edges
      if (p.x < -20) { p.x = W + 20; p.trail.length = 0; }
      else if (p.x > W + 20) { p.x = -20; p.trail.length = 0; }
      if (p.y < -20) { p.y = H + 20; p.trail.length = 0; }
      else if (p.y > H + 20) { p.y = -20; p.trail.length = 0; }

      // Color phase: base drift + speed-driven shift
      const spd = Math.hypot(p.vx, p.vy);
      p.colorPhase = (p.colorPhase + p.colorSpeed * dt * 1000 + spd * 0.0006) % 1;
    }
  }

  function updateEffects(dt) {
    // Shockwaves
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const sw = shockwaves[i];
      sw.r += 420 * dt;
      sw.alpha = Math.max(0, 1 - sw.r / sw.maxR);
      if (sw.alpha <= 0) shockwaves.splice(i, 1);
    }

    // Lightning decay
    for (let i = lightningBolts.length - 1; i >= 0; i--) {
      lightningBolts[i].life -= dt * 4;
      if (lightningBolts[i].life <= 0) lightningBolts.splice(i, 1);
    }
    // Random lightning between vortices
    if (Math.random() < 0.02) spawnLightning();

    // Vortex arm rotation
    vortices.forEach((v) => { v.armAngle += v.direction * dt * 1.6; });

    // Mouse trail decay
    for (let i = mouseTrail.length - 1; i >= 0; i--) {
      mouseTrail[i].life -= dt * 2.2;
      if (mouseTrail[i].life <= 0) mouseTrail.splice(i, 1);
    }
  }

  // =========================================================================
  // Rendering
  // =========================================================================
  const GRID = 96; // spatial hash cell size for connection web

  function drawConnections() {
    // Spatial hash; sample subset for performance at high counts
    const cols = Math.ceil(W / GRID);
    const rows = Math.ceil(H / GRID);
    const grid = new Map();
    const step = particles.length > 1200 ? 3 : particles.length > 600 ? 2 : 1;

    for (let i = 0; i < particles.length; i += step) {
      const p = particles[i];
      const key = Math.floor(p.x / GRID) + Math.floor(p.y / GRID) * cols;
      let cell = grid.get(key);
      if (!cell) grid.set(key, (cell = []));
      cell.push(p);
    }

    const maxDist = config.connectionDistance;
    const maxDistSq = maxDist * maxDist;
    ctx.lineWidth = 0.6;

    grid.forEach((cell, key) => {
      const cx = key % cols;
      const cy = Math.floor(key / cols);
      for (let a = 0; a < cell.length; a++) {
        const p = cell[a];
        // same cell + right/down neighbors (avoid double checks)
        for (let ox = 0; ox <= 1; ox++) {
          for (let oy = (ox === 0 ? 0 : -1); oy <= 1; oy++) {
            const nKey = (cx + ox) + (cy + oy) * cols;
            if (cx + ox >= cols || cy + oy < 0 || cy + oy >= rows) continue;
            const nCell = grid.get(nKey);
            if (!nCell) continue;
            const start = (nKey === key) ? a + 1 : 0;
            for (let b = start; b < nCell.length; b++) {
              const q = nCell[b];
              const dx = p.x - q.x;
              const dy = p.y - q.y;
              const dSq = dx * dx + dy * dy;
              if (dSq < maxDistSq) {
                const alpha = (1 - dSq / maxDistSq) * 0.16;
                const hue = hueAt(p.colorPhase);
                ctx.strokeStyle = `hsla(${hue}, 90%, 65%, ${alpha})`;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(q.x, q.y);
                ctx.stroke();
              }
            }
          }
        }
      }
    });
  }

  function drawParticles() {
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const hue = hueAt(p.colorPhase);

      // Trail with gradient fade
      const t = p.trail;
      if (t.length >= 4) {
        const n = t.length / 2;
        ctx.lineCap = 'round';
        for (let j = 0; j < n - 1; j++) {
          const alpha = (j / n) * 0.35;
          if (alpha < 0.02) continue;
          ctx.strokeStyle = `hsla(${hue}, 95%, 60%, ${alpha})`;
          ctx.lineWidth = p.size * (j / n) * 1.4;
          ctx.beginPath();
          ctx.moveTo(t[j * 2], t[j * 2 + 1]);
          ctx.lineTo(t[j * 2 + 2], t[j * 2 + 3]);
          ctx.stroke();
        }
      }

      // Multi-layer glow sprite (core + mid + halo baked in)
      const sprite = spriteCache[Math.floor((hue / 360) * HUE_BUCKETS) % HUE_BUCKETS];
      const s = SPRITE_SIZE * p.size * 0.4;
      ctx.drawImage(sprite, p.x - s / 2, p.y - s / 2, s, s);
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  function drawVortices() {
    ctx.globalCompositeOperation = 'lighter';

    vortices.forEach((v) => {
      const hue = v.direction === 1 ? 190 : 285;

      // Rotating spiral arms
      const arms = 3;
      ctx.lineWidth = 1.6;
      for (let a = 0; a < arms; a++) {
        const base = v.armAngle + (a / arms) * Math.PI * 2;
        ctx.strokeStyle = `hsla(${hue}, 100%, 65%, 0.5)`;
        ctx.beginPath();
        for (let s = 0; s <= 40; s++) {
          const tt = s / 40;
          const ang = base + tt * 2.6 * v.direction;
          const r = 10 + tt * 90;
          const x = v.x + Math.cos(ang) * r;
          const y = v.y + Math.sin(ang) * r;
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Core glow layers
      let grad = ctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, 70);
      grad.addColorStop(0, `hsla(${hue}, 100%, 70%, 0.55)`);
      grad.addColorStop(0.4, `hsla(${hue}, 100%, 55%, 0.18)`);
      grad.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(v.x, v.y, 70, 0, Math.PI * 2);
      ctx.fill();

      grad = ctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, v.radius);
      grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
      grad.addColorStop(0.5, `hsla(${hue}, 100%, 80%, 0.9)`);
      grad.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(v.x, v.y, v.radius, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.globalCompositeOperation = 'source-over';
  }

  function drawLightning() {
    if (!lightningBolts.length) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    lightningBolts.forEach((bolt) => {
      const a = Math.max(0, bolt.life);
      // outer glow pass
      ctx.strokeStyle = `hsla(265, 100%, 70%, ${a * 0.25})`;
      ctx.lineWidth = 6;
      strokePath(bolt.points);
      // hot core pass
      ctx.strokeStyle = `hsla(200, 100%, 90%, ${a * 0.9})`;
      ctx.lineWidth = 1.6;
      strokePath(bolt.points);
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  function strokePath(points) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  }

  function drawShockwaves() {
    ctx.globalCompositeOperation = 'lighter';
    shockwaves.forEach((sw) => {
      ctx.strokeStyle = `hsla(35, 100%, 65%, ${sw.alpha * 0.8})`;
      ctx.lineWidth = 3 * sw.alpha + 0.5;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = `hsla(190, 100%, 75%, ${sw.alpha * 0.4})`;
      ctx.lineWidth = 8 * sw.alpha + 1;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.r * 0.92, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawMouseTrail() {
    if (!mouseTrail.length) return;
    ctx.globalCompositeOperation = 'lighter';
    mouseTrail.forEach((pt) => {
      const a = Math.max(0, pt.life);
      const grad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, 18 * a + 4);
      grad.addColorStop(0, `hsla(${pt.hue}, 100%, 70%, ${a * 0.4})`);
      grad.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 18 * a + 4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  function applyBloom() {
    if (!config.bloom) return;
    const bw = Math.max(1, W >> 2);
    const bh = Math.max(1, H >> 2);
    if (bloomCanvas.width !== bw) { bloomCanvas.width = bw; bloomCanvas.height = bh; }

    bloomCtx.clearRect(0, 0, bw, bh);
    bloomCtx.drawImage(canvas, 0, 0, bw, bh);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    if ('filter' in ctx) ctx.filter = 'blur(6px)';
    ctx.drawImage(bloomCanvas, 0, 0, bw, bh, 0, 0, W, H);
    ctx.restore();
    if ('filter' in ctx) ctx.filter = 'none';
    ctx.globalAlpha = 1;
  }

  // =========================================================================
  // Main loop
  // =========================================================================
  function frame(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;

    // FPS
    frameCount++;
    if (now - lastFpsTime >= 500) {
      fps = Math.round((frameCount * 1000) / (now - lastFpsTime));
      frameCount = 0;
      lastFpsTime = now;
      hudFps.textContent = fps;
      hudParticles.textContent = particles.length;
    }

    updateParticles(dt);
    updateEffects(dt);

    // Background (pre-rendered nebula/stars) with slight afterglow fade
    ctx.globalAlpha = 1;
    ctx.drawImage(bgCanvas, 0, 0);

    drawConnections();
    drawParticles();
    drawLightning();
    drawVortices();
    drawShockwaves();
    drawMouseTrail();
    applyBloom();

    requestAnimationFrame(frame);
  }

  // =========================================================================
  // Input handling
  // =========================================================================
  function vortexAt(x, y) {
    return vortices.find((v) => Math.hypot(v.x - x, v.y - y) < 40) || null;
  }

  canvas.addEventListener('mousedown', (e) => {
    mouse.down = true;
    dragMoved = false;
    dragTarget = vortexAt(e.clientX, e.clientY);
    if (dragTarget) dragTarget.dragging = true;
  });

  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
    mouse.shift = e.shiftKey;

    // Mouse trail
    mouseTrail.push({
      x: e.clientX, y: e.clientY, life: 1,
      hue: mouse.shift ? 15 : 195
    });
    if (mouseTrail.length > 40) mouseTrail.shift();

    if (dragTarget) {
      dragMoved = true;
      dragTarget.x = e.clientX;
      dragTarget.y = e.clientY;
      dragTarget.nx = e.clientX / W;
      dragTarget.ny = e.clientY / H;
      pushConfigDebounced();
    }
  });

  window.addEventListener('mouseup', (e) => {
    mouse.down = false;
    if (dragTarget) {
      if (!dragMoved) {
        // Click (no drag): reverse rotation + shockwave
        dragTarget.direction *= -1;
        spawnShockwave(dragTarget.x, dragTarget.y, 320);
        spawnLightning();
        pushConfigDebounced();
      }
      dragTarget.dragging = false;
      dragTarget = null;
    }
  });

  window.addEventListener('mouseleave', () => { mouse.active = false; });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -60 : 60;
    setParticleCount(config.count + delta);
  }, { passive: false });

  canvas.addEventListener('dblclick', (e) => {
    e.preventDefault();
    resetScene();
  });

  window.addEventListener('keydown', (e) => { if (e.key === 'Shift') mouse.shift = true; });
  window.addEventListener('keyup', (e) => { if (e.key === 'Shift') mouse.shift = false; });

  window.addEventListener('resize', () => {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;
    vortices.forEach((v) => { v.x = v.nx * W; v.y = v.ny * H; });
    renderBackground();
  });

  // =========================================================================
  // HUD elements
  // =========================================================================
  const hudFps = document.getElementById('hud-fps');
  const hudParticles = document.getElementById('hud-particles');
  const statActive = document.getElementById('stat-active');
  const statFps = document.getElementById('stat-fps');
  const statConn = document.getElementById('stat-conn');
  const statUptime = document.getElementById('stat-uptime');
  const statMsgs = document.getElementById('stat-msgs');
  const wsIndicator = document.getElementById('ws-indicator');

  function formatUptime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  // =========================================================================
  // Server communication
  // =========================================================================
  let ws = null;
  let wsReconnectTimer = null;

  function connectWebSocket() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);

    ws.onopen = () => {
      wsIndicator.classList.add('connected');
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'stats' && msg.payload) {
          statActive.textContent = msg.payload.activeParticles;
          statFps.textContent = msg.payload.fps;
          statConn.textContent = msg.payload.connections;
          statUptime.textContent = formatUptime(msg.payload.uptimeSeconds);
          statMsgs.textContent = msg.payload.totalMessages;
        }
      } catch (_) { /* ignore */ }
    };

    ws.onclose = () => {
      wsIndicator.classList.remove('connected');
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = setTimeout(connectWebSocket, 2000);
    };

    ws.onerror = () => ws.close();
  }

  // Report local fps + particle count to the server every second
  setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'client-stats',
        payload: { fps, activeParticles: particles.length }
      }));
    }
  }, 1000);

  // Debounced POST of config changes back to the server
  let configTimer = null;
  function pushConfigDebounced() {
    clearTimeout(configTimer);
    configTimer = setTimeout(() => {
      fetch('/api/particles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count: config.count,
          speed: config.speed,
          vortices: vortices.map((v) => ({
            id: v.id, x: v.nx, y: v.ny, direction: v.direction, strength: v.strength
          }))
        })
      }).catch(() => { /* server optional for rendering */ });
    }, 300);
  }

  // Load initial config from server
  async function loadConfig() {
    try {
      const res = await fetch('/api/particles');
      const cfg = await res.json();
      if (typeof cfg.count === 'number') config.count = cfg.count;
      if (typeof cfg.speed === 'number') config.speed = cfg.speed;
      if (typeof cfg.trailLength === 'number') config.trailLength = cfg.trailLength;
      if (typeof cfg.connectionDistance === 'number') config.connectionDistance = cfg.connectionDistance;
      if (typeof cfg.bloom === 'boolean') config.bloom = cfg.bloom;
      if (Array.isArray(cfg.vortices)) {
        cfg.vortices.forEach((v) => {
          const target = vortices.find((t) => t.id === v.id);
          if (target) {
            target.nx = v.x; target.ny = v.y;
            target.x = v.x * W; target.y = v.y * H;
            target.direction = v.direction;
            target.strength = v.strength;
          }
        });
      }
    } catch (_) {
      /* fall back to local defaults */
    }
    setParticleCount(config.count);
  }

  // =========================================================================
  // Boot
  // =========================================================================
  renderBackground();
  loadConfig().then(() => {
    connectWebSocket();
    requestAnimationFrame(frame);
  });
})();