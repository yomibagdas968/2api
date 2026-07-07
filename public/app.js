(() => {
  'use strict';

  // ---------- Canvas setup ----------
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildStars();
  }
  window.addEventListener('resize', resize);

  // ---------- Config ----------
  const config = {
    count: 1500,
    speed: 1.0,
    trail: 0.12,
    vortexStrength: 1.0
  };

  const COLOR_MODES = ['rainbow', 'monochrome', 'neon', 'fire', 'ice'];
  let colorMode = 0;
  let heatmapOn = false;
  let demoOn = false;
  let demoTime = 0;

  // Performance auto-scaling
  let perfScale = 1.0;
  let lowFpsFrames = 0;
  let highFpsFrames = 0;

  // ---------- Stars (3-layer parallax) ----------
  const starLayers = [[], [], []];
  function buildStars() {
    const densities = [90, 60, 35];
    for (let l = 0; l < 3; l++) {
      starLayers[l].length = 0;
      const n = Math.floor((W * H) / 1e6 * densities[l]) + densities[l];
      for (let i = 0; i < n; i++) {
        starLayers[l].push({
          x: Math.random() * W,
          y: Math.random() * H,
          r: 0.4 + Math.random() * (0.5 + l * 0.6),
          tw: Math.random() * Math.PI * 2
        });
      }
    }
  }

  // ---------- Vortices ----------
  const vortices = [
    { x: 0, y: 0, dir: 1, phase: 0, radius: 26, drag: false },
    { x: 0, y: 0, dir: -1, phase: Math.PI, radius: 26, drag: false }
  ];
  function placeVortices() {
    vortices[0].x = W * 0.3; vortices[0].y = H * 0.5;
    vortices[1].x = W * 0.7; vortices[1].y = H * 0.5;
  }

  // ---------- Particles ----------
  const particles = [];
  function spawnParticle(x, y, burst) {
    const a = Math.random() * Math.PI * 2;
    const sp = burst ? 120 + Math.random() * 260 : Math.random() * 30;
    return {
      x: x !== undefined ? x : Math.random() * W,
      y: y !== undefined ? y : Math.random() * H,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 6 + Math.random() * 10,
      maxLife: 0,
      age: 0,
      hueSeed: Math.random(),
      size: 0.8 + Math.random() * 1.8
    };
  }
  function initParticle(p) {
    p.maxLife = p.life;
    return p;
  }

  function targetCount() {
    return Math.max(300, Math.floor(config.count * perfScale));
  }

  function syncParticleCount() {
    const t = targetCount();
    while (particles.length < t) particles.push(initParticle(spawnParticle()));
    if (particles.length > t) particles.length = t;
  }

  // ---------- Spatial hash ----------
  const CELL = 48;
  let grid = new Map();
  function hashKey(cx, cy) { return cx * 100003 + cy; }
  function rebuildGrid() {
    grid.clear();
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const cx = Math.floor(p.x / CELL);
      const cy = Math.floor(p.y / CELL);
      const k = hashKey(cx, cy);
      let cell = grid.get(k);
      if (!cell) { cell = []; grid.set(k, cell); }
      cell.push(i);
    }
  }
  function cellCount(cx, cy) {
    const cell = grid.get(hashKey(cx, cy));
    return cell ? cell.length : 0;
  }

  // ---------- Effects ----------
  const shockwaves = []; // {x, y, r, maxR, alpha}
  let shake = 0;

  function addShockwave(x, y) {
    shockwaves.push({ x, y, r: 6, maxR: Math.max(W, H) * 0.4, alpha: 1 });
  }

  function explode(x, y) {
    const n = Math.floor(40 * perfScale) + 20;
    for (let i = 0; i < n; i++) {
      const p = initParticle(spawnParticle(x, y, true));
      p.life = 1.5 + Math.random() * 2;
      p.maxLife = p.life;
      particles.push(p);
    }
    // push nearby existing particles outward
    for (const p of particles) {
      const dx = p.x - x, dy = p.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 200 * 200 && d2 > 1) {
        const d = Math.sqrt(d2);
        const f = (1 - d / 200) * 400;
        p.vx += (dx / d) * f;
        p.vy += (dy / d) * f;
      }
    }
    addShockwave(x, y);
    shake = Math.min(shake + 10, 22);
    audioPulse(160, 0.25);
  }

  // ---------- Audio ----------
  let audioCtx = null, masterGain = null, osc = null;
  let audioTime = 0;
  function initAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0;
      masterGain.connect(audioCtx.destination);
      osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 70;
      osc.connect(masterGain);
      osc.start();
    } catch (e) {
      audioCtx = null;
    }
  }
  function audioPulse(freq, vol) {
    if (!audioCtx || !masterGain) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t = audioCtx.currentTime;
    osc.frequency.cancelScheduledValues(t);
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.4), t + 0.3);
    masterGain.gain.cancelScheduledValues(t);
    masterGain.gain.setValueAtTime(masterGain.gain.value, t);
    masterGain.gain.linearRampToValueAtTime(Math.min(vol, 0.3), t + 0.02);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  }
  function audioAmbientPulse(dt) {
    audioTime += dt;
    if (audioTime > 2.4) {
      audioTime = 0;
      audioPulse(60 + 20 * Math.abs(vortices[0].dir + vortices[1].dir), 0.05);
    }
  }

  // ---------- Colors ----------
  function particleColor(p, alpha, speedNorm) {
    switch (COLOR_MODES[colorMode]) {
      case 'rainbow': {
        const h = (p.hueSeed * 360 + performance.now() * 0.02) % 360;
        return `hsla(${h},95%,62%,${alpha})`;
      }
      case 'monochrome': {
        const l = 40 + speedNorm * 55;
        return `hsla(0,0%,${l}%,${alpha})`;
      }
      case 'neon': {
        const h = p.hueSeed < 0.5 ? 175 + p.hueSeed * 30 : 300 + (p.hueSeed - 0.5) * 40;
        return `hsla(${h},100%,${55 + speedNorm * 25}%,${alpha})`;
      }
      case 'fire': {
        const h = 5 + speedNorm * 50;
        return `hsla(${h},100%,${45 + speedNorm * 30}%,${alpha})`;
      }
      case 'ice': {
        const h = 190 + p.hueSeed * 50;
        return `hsla(${h},90%,${60 + speedNorm * 25}%,${alpha})`;
      }
    }
    return `rgba(255,255,255,${alpha})`;
  }

  // ---------- Webcam Gestures (MediaPipe Hands) ----------
  const camPreview = document.getElementById('cam-preview');
  const camOverlay = document.getElementById('cam-overlay');
  const camCtx = camOverlay.getContext('2d');
  const hudGesture = document.getElementById('hud-gesture');

  const MP_HANDS_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js';
  const MP_CAM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3.1675466862/camera_utils.js';
  const MP_DRAW_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils@0.3.1675466124/drawing_utils.js';

  const gesture = {
    enabled: false,
    loading: false,
    tracking: false,
    x: -9999, y: -9999,
    rawX: 0, rawY: 0,
    name: 'NONE',
    pinch: false,
    fist: false,
    lostFrames: 0
  };

  let mpHands = null, mpCamera = null;
  let gestureDrag = null;
  let lastGestureNova = 0;
  let gestureStream = null;

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

  function dist2d(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function classifyHand(lm) {
    const wrist = lm[0];
    const scale = dist2d(wrist, lm[9]) || 0.001;
    const ext = (tip, pip) => dist2d(lm[tip], wrist) > dist2d(lm[pip], wrist) * 1.15;
    const index = ext(8, 6);
    const middle = ext(12, 10);
    const ring = ext(16, 14);
    const pinky = ext(20, 18);
    const pinching = dist2d(lm[4], lm[8]) < scale * 0.4;
    if (pinching) return 'PINCH';
    if (index && middle && !ring && !pinky) return 'VICTORY';
    if (!index && !middle && !ring && !pinky) return 'FIST';
    return 'POINT';
  }

  function onHandResults(results) {
    drawHandSkeleton(results);
    const hands = results.multiHandLandmarks;
    if (!hands || hands.length === 0) {
      if (++gesture.lostFrames > 8 && gesture.tracking) {
        gesture.tracking = false;
        gesture.name = 'NONE';
        gesture.pinch = gesture.fist = false;
        releaseGestureDrag();
        mouse.active = false;
        mouse.shift = keyShift;
        if (gesture.enabled) {
          hudGesture.textContent = 'on — show hand';
          hudGesture.style.color = '#a4ffd0';
        }
      }
      return;
    }
    gesture.lostFrames = 0;
    const lm = hands[0];
    const name = classifyHand(lm);
    const anchor = (name === 'FIST') ? lm[9] : lm[8];
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
      gestureDrag.drag = false;
      gestureDrag = null;
    }
  }

  async function enableGestures() {
    if (gesture.loading || gesture.enabled) return;
    gesture.loading = true;
    hudGesture.textContent = 'loading...';
    hudGesture.style.color = '#ffd27f';
    try {
      if (!window.Hands) await loadScript(MP_HANDS_URL);
      if (!window.Camera) await loadScript(MP_CAM_URL);
      if (!window.drawConnectors) await loadScript(MP_DRAW_URL);

      mpHands = new window.Hands({
        locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${f}`
      });
      mpHands.setOptions({
        maxNumHands: 1,
        modelComplexity: 0,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.5
      });
      mpHands.onResults(onHandResults);

      gestureStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      camPreview.srcObject = gestureStream;
      await camPreview.play();

      mpCamera = new window.Camera(camPreview, {
        onFrame: async () => {
          if (mpHands) await mpHands.send({ image: camPreview });
        },
        width: 320,
        height: 240
      });
      await mpCamera.start();

      gesture.enabled = true;
      camPreview.style.display = 'block';
      camOverlay.style.display = 'block';
      hudGesture.textContent = 'on — show hand';
      hudGesture.style.color = '#a4ffd0';
    } catch (err) {
      console.warn('Gesture init failed:', err);
      hudGesture.textContent = 'unavailable';
      hudGesture.style.color = '#ff8f7f';
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
    if (gestureStream) {
      for (const track of gestureStream.getTracks()) track.stop();
      gestureStream = null;
    }
    camPreview.srcObject = null;
    camPreview.style.display = 'none';
    camOverlay.style.display = 'none';
    mouse.active = false;
    mouse.shift = keyShift;
    hudGesture.textContent = 'off';
    hudGesture.style.color = '';
  }

  function toggleGestures() {
    if (gesture.loading) return;
    if (gesture.enabled) {
      teardownGestures();
    } else {
      enableGestures();
    }
  }

  function applyGestureControl(dt) {
    if (!gesture.enabled || !gesture.tracking) return;
    const k = 1 - Math.pow(0.0005, dt);
    gesture.x += (gesture.rawX - gesture.x) * k;
    gesture.y += (gesture.rawY - gesture.y) * k;
    mouse.x = gesture.x;
    mouse.y = gesture.y;
    mouse.active = true;
    mouse.shift = gesture.fist || keyShift;

    if (gesture.pinch) {
      if (!gestureDrag) {
        for (const v of vortices) {
          const dx = gesture.x - v.x, dy = gesture.y - v.y;
          if (dx * dx + dy * dy < 70 * 70) {
            gestureDrag = v;
            v.drag = true;
            break;
          }
        }
      }
      if (gestureDrag) {
        gestureDrag.x = gesture.x;
        gestureDrag.y = gesture.y;
      }
    } else {
      releaseGestureDrag();
    }

    if (gesture.name === 'VICTORY') {
      const now = performance.now();
      if (now - lastGestureNova > 2000) {
        lastGestureNova = now;
        explode(gesture.x, gesture.y);
      }
    }
  }

  function drawGestureCursor(t) {
    if (!gesture.enabled || !gesture.tracking) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const hue = gesture.pinch ? 48 : gesture.fist ? 0 : gesture.name === 'VICTORY' ? 300 : 165;
    const r = 18 + Math.sin(t * 5) * 3;

    ctx.strokeStyle = `hsla(${hue},100%,70%,0.85)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(gesture.x, gesture.y, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = `hsla(${hue},100%,80%,0.9)`;
    ctx.beginPath();
    ctx.arc(gesture.x, gesture.y, 4, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + t * 1.5;
      ctx.strokeStyle = `hsla(${hue},100%,80%,0.5)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(gesture.x + Math.cos(a) * (r + 5), gesture.y + Math.sin(a) * (r + 5));
      ctx.lineTo(gesture.x + Math.cos(a) * (r + 12), gesture.y + Math.sin(a) * (r + 12));
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHandSkeleton(results) {
    camCtx.clearRect(0, 0, 320, 240);
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) return;
    if (window.drawConnectors && window.HAND_CONNECTIONS) {
      window.drawConnectors(camCtx, results.multiHandLandmarks[0], window.HAND_CONNECTIONS, { color: '#00e5ff', lineWidth: 2 });
      window.drawLandmarks(camCtx, results.multiHandLandmarks[0], { color: '#ff2ec4', lineWidth: 1, radius: 3 });
    }
  }

  // ---------- Input ----------
  let keyShift = false;
  const mouse = { x: -9999, y: -9999, down: false, shift: false, dragTarget: null, downX: 0, downY: 0, moved: false, active: false };

  canvas.addEventListener('mousedown', (e) => {
    initAudio();
    mouse.down = true;
    mouse.moved = false;
    mouse.downX = e.clientX;
    mouse.downY = e.clientY;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    for (const v of vortices) {
      const dx = e.clientX - v.x, dy = e.clientY - v.y;
      if (dx * dx + dy * dy < (v.radius + 18) * (v.radius + 18)) {
        mouse.dragTarget = v;
        v.drag = true;
        break;
      }
    }
  });

  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    if (mouse.down) {
      const dx = e.clientX - mouse.downX, dy = e.clientY - mouse.downY;
      if (dx * dx + dy * dy > 36) mouse.moved = true;
      if (mouse.dragTarget) {
        mouse.dragTarget.x = e.clientX;
        mouse.dragTarget.y = e.clientY;
      }
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (!mouse.down) return;
    mouse.down = false;
    const target = mouse.dragTarget;
    mouse.dragTarget = null;
    if (target) {
      target.drag = false;
      if (!mouse.moved) {
        // click on vortex: reverse spin + shockwave
        target.dir *= -1;
        addShockwave(target.x, target.y);
        shake = Math.min(shake + 14, 24);
        audioPulse(220, 0.22);
      }
      return;
    }
    if (!mouse.moved && e.target === canvas) {
      explode(e.clientX, e.clientY);
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') { mouse.shift = true; keyShift = true; }
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const k = e.key.toLowerCase();
    if (k >= '1' && k <= '5') {
      colorMode = parseInt(k, 10) - 1;
      document.getElementById('hud-mode').textContent = COLOR_MODES[colorMode];
    } else if (k === 's') {
      document.getElementById('settings-panel').classList.toggle('hidden');
    } else if (k === 'p') {
      screenshot();
    } else if (k === 'd') {
      demoOn = !demoOn;
      document.getElementById('hud-demo').textContent = demoOn ? 'on' : 'off';
    } else if (k === 'h') {
      heatmapOn = !heatmapOn;
    } else if (k === 'c') {
      toggleGestures();
    }
    initAudio();
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') { mouse.shift = false; keyShift = false; }
  });

  function screenshot() {
    try {
      const a = document.createElement('a');
      a.download = 'particle-exchange-' + Date.now() + '.png';
      a.href = canvas.toDataURL('image/png');
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.warn('Screenshot failed:', err);
    }
  }

  // ---------- Settings panel ----------
  function bindSlider(id, valId, key, fmt) {
    const el = document.getElementById(id);
    const val = document.getElementById(valId);
    el.value = config[key];
    val.textContent = fmt(config[key]);
    el.addEventListener('input', () => {
      config[key] = parseFloat(el.value);
      val.textContent = fmt(config[key]);
      if (key === 'count') syncParticleCount();
    });
  }
  bindSlider('set-count', 'val-count', 'count', v => String(Math.round(v)));
  bindSlider('set-speed', 'val-speed', 'speed', v => v.toFixed(1));
  bindSlider('set-trail', 'val-trail', 'trail', v => v.toFixed(2));
  bindSlider('set-vortex', 'val-vortex', 'vortexStrength', v => v.toFixed(1));

  // ---------- WebSocket stats ----------
  let ws = null;
  let wsRetry = 1000;
  const wsStatus = document.getElementById('ws-status');
  function connectWS() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    try {
      ws = new WebSocket(`${proto}//${location.host}/ws`);
    } catch {
      wsStatus.textContent = 'offline';
      return;
    }
    ws.onopen = () => {
      wsStatus.textContent = 'online';
      wsRetry = 1000;
    };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg && msg.stats) {
        document.getElementById('ws-clients').textContent = msg.stats.clients;
        document.getElementById('ws-fps').textContent = msg.stats.avgFps;
        document.getElementById('ws-particles').textContent = msg.stats.totalParticles;
      }
    };
    ws.onclose = () => {
      wsStatus.textContent = 'offline';
      ws = null;
      setTimeout(connectWS, wsRetry);
      wsRetry = Math.min(wsRetry * 2, 15000);
    };
    ws.onerror = () => { if (ws) ws.close(); };
  }
  connectWS();

  setInterval(() => {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'stats', fps: Math.round(fps), count: particles.length }));
    }
  }, 1000);

  // Occasionally post a snapshot to the REST API
  setInterval(() => {
    fetch('/api/particles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: particles.length, mode: COLOR_MODES[colorMode] })
    }).catch(() => {});
  }, 10000);

  // ---------- Demo mode ----------
  function updateDemo(dt) {
    demoTime += dt;
    const cx = W / 2, cy = H / 2;
    vortices[0].x = cx + Math.cos(demoTime * 0.4) * W * 0.25;
    vortices[0].y = cy + Math.sin(demoTime * 0.6) * H * 0.28;
    vortices[1].x = cx + Math.cos(demoTime * 0.5 + Math.PI) * W * 0.25;
    vortices[1].y = cy + Math.sin(demoTime * 0.35 + Math.PI) * H * 0.28;
    if (Math.floor(demoTime) % 7 === 0 && demoTime % 1 < dt) {
      explode(Math.random() * W, Math.random() * H);
    }
    if (Math.floor(demoTime) % 11 === 0 && demoTime % 1 < dt) {
      const v = vortices[Math.floor(Math.random() * 2)];
      v.dir *= -1;
      addShockwave(v.x, v.y);
    }
  }

  // ---------- Physics ----------
  function updateParticles(dt) {
    const vs = config.vortexStrength;
    const t = performance.now() * 0.001;

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      p.life -= dt;

      if (p.life <= 0) {
        if (particles.length > targetCount()) {
          particles.splice(i, 1);
          continue;
        }
        const np = initParticle(spawnParticle());
        np.age = 0;
        particles[i] = np;
        continue;
      }

      // Vortex forces with spiral arm modulation
      for (const v of vortices) {
        const dx = p.x - v.x, dy = p.y - v.y;
        const d2 = dx * dx + dy * dy + 100;
        const d = Math.sqrt(d2);
        if (d > 900) continue;
        const ang = Math.atan2(dy, dx);
        const armMod = 0.6 + 0.4 * Math.cos(3 * ang - v.dir * t * 2 - Math.log(d + 1) * 2);
        const f = (26000 / d2) * vs * armMod;
        // tangential (spin)
        p.vx += (-dy / d) * f * v.dir * 60 * dt;
        p.vy += (dx / d) * f * v.dir * 60 * dt;
        // inward pull
        p.vx += (-dx / d) * f * 22 * dt;
        p.vy += (-dy / d) * f * 22 * dt;
      }

      // Mouse attract / repel
      if (mouse.down && !mouse.dragTarget) {
        const dx = mouse.x - p.x, dy = mouse.y - p.y;
        const d2 = dx * dx + dy * dy + 400;
        if (d2 < 350 * 350) {
          const d = Math.sqrt(d2);
          const sign = mouse.shift ? -1 : 1;
          const f = (60000 / d2) * sign;
          p.vx += (dx / d) * f * 60 * dt;
          p.vy += (dy / d) * f * 60 * dt;
        }
      }

      // Local separation via spatial hash (avoid clumping)
      const cx = Math.floor(p.x / CELL), cy = Math.floor(p.y / CELL);
      const local = cellCount(cx, cy);
      if (local > 14) {
        const jitter = (local - 14) * 2;
        p.vx += (Math.random() - 0.5) * jitter;
        p.vy += (Math.random() - 0.5) * jitter;
      }

      // Shockwave push
      for (const s of shockwaves) {
        const dx = p.x - s.x, dy = p.y - s.y;
        const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
        const band = Math.abs(d - s.r);
        if (band < 40) {
          const f = (1 - band / 40) * 500 * s.alpha;
          p.vx += (dx / d) * f * dt * 10;
          p.vy += (dy / d) * f * dt * 10;
        }
      }

      // Integrate
      const drag = Math.pow(0.985, dt * 60);
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt * config.speed;
      p.y += p.vy * dt * config.speed;

      // Wrap edges
      if (p.x < -10) p.x += W + 20;
      else if (p.x > W + 10) p.x -= W + 20;
      if (p.y < -10) p.y += H + 20;
      else if (p.y > H + 10) p.y -= H + 20;
    }
  }

  // ---------- Rendering ----------
  function drawStars(t) {
    const px = (mouse.x >= 0 ? mouse.x - W / 2 : 0);
    const py = (mouse.y >= 0 ? mouse.y - H / 2 : 0);
    for (let l = 0; l < 3; l++) {
      const depth = (l + 1) * 0.006;
      const ox = -px * depth, oy = -py * depth;
      for (const s of starLayers[l]) {
        const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * (0.5 + l * 0.3) + s.tw));
        ctx.globalAlpha = tw * (0.25 + l * 0.25);
        ctx.fillStyle = l === 2 ? '#cfefff' : '#8fb8d8';
        ctx.beginPath();
        ctx.arc(s.x + ox, s.y + oy, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawHeatmap() {
    const cw = Math.ceil(W / CELL), ch = Math.ceil(H / CELL);
    let max = 1;
    for (const [, cell] of grid) max = Math.max(max, cell.length);
    for (let cy = 0; cy < ch; cy++) {
      for (let cx = 0; cx < cw; cx++) {
        const n = cellCount(cx, cy);
        if (!n) continue;
        const v = n / max;
        ctx.fillStyle = `hsla(${260 - v * 260},100%,50%,${Math.min(0.35, v * 0.45)})`;
        ctx.fillRect(cx * CELL, cy * CELL, CELL, CELL);
      }
    }
  }

  function drawVortex(v, t) {
    v.phase += 0.02 * v.dir;
    ctx.save();
    ctx.translate(v.x, v.y);
    // spiral arms
    ctx.lineWidth = 2;
    for (let arm = 0; arm < 3; arm++) {
      ctx.beginPath();
      const base = v.phase + (arm * Math.PI * 2) / 3;
      for (let s = 0; s < 40; s++) {
        const r = 6 + s * 3.2;
        const a = base + v.dir * s * 0.18;
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `hsla(${(t * 40 + arm * 60) % 360},100%,65%,0.35)`;
      ctx.stroke();
    }
    // core
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, v.radius);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.4, v.dir > 0 ? 'rgba(0,229,255,0.6)' : 'rgba(255,46,196,0.6)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, v.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function render(t, dt) {
    // Trail fade
    ctx.fillStyle = `rgba(3,3,8,${config.trail})`;
    ctx.fillRect(0, 0, W, H);

    // Screen shake
    ctx.save();
    if (shake > 0.1) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      shake *= Math.pow(0.88, dt * 60);
    } else {
      shake = 0;
    }

    drawStars(t);
    if (heatmapOn) drawHeatmap();

    // Particles
    for (const p of particles) {
      const birth = Math.min(1, p.age / 0.6);
      const death = Math.min(1, p.life / 0.8);
      const alpha = Math.max(0, Math.min(birth, death)) * 0.9;
      if (alpha <= 0.01) continue;
      const sp = Math.min(1, Math.sqrt(p.vx * p.vx + p.vy * p.vy) / 300);
      ctx.fillStyle = particleColor(p, alpha, sp);
      const size = p.size * (0.6 + birth * 0.4) * (0.5 + death * 0.5);
      ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
    }

    // Shockwaves
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const s = shockwaves[i];
      s.r += 600 * dt;
      s.alpha = 1 - s.r / s.maxR;
      if (s.alpha <= 0) { shockwaves.splice(i, 1); continue; }
      ctx.strokeStyle = `rgba(0,229,255,${s.alpha * 0.8})`;
      ctx.lineWidth = 3 * s.alpha + 1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const v of vortices) drawVortex(v, t);

    ctx.restore();
  }

  // ---------- FPS + perf scaling ----------
  let fps = 60;
  let fpsAccum = 0, fpsFrames = 0, fpsTimer = 0;
  const hudFps = document.getElementById('hud-fps');
  const hudCount = document.getElementById('hud-count');

  function updatePerf(dt) {
    fpsAccum += 1 / Math.max(dt, 0.0001);
    fpsFrames++;
    fpsTimer += dt;
    if (fpsTimer >= 0.5) {
      fps = fpsAccum / fpsFrames;
      fpsAccum = 0; fpsFrames = 0; fpsTimer = 0;
      hudFps.textContent = Math.round(fps);
      hudCount.textContent = particles.length;

      if (gesture.enabled && gesture.tracking) {
        const icon = gesture.fist ? '✊' : gesture.pinch ? '🤏' : gesture.name === 'VICTORY' ? '✌' : '☝';
        hudGesture.textContent = icon + ' ' + gesture.name.toLowerCase();
        hudGesture.style.color = gesture.fist ? '#ff8f7f' : gesture.pinch ? '#ffd27f' : '#a4ffd0';
      }

      if (fps < 45) { lowFpsFrames++; highFpsFrames = 0; }
      else if (fps > 57) { highFpsFrames++; lowFpsFrames = 0; }
      else { lowFpsFrames = 0; highFpsFrames = 0; }

      if (lowFpsFrames >= 4 && perfScale > 0.3) {
        perfScale = Math.max(0.3, perfScale - 0.1);
        lowFpsFrames = 0;
        syncParticleCount();
      } else if (highFpsFrames >= 8 && perfScale < 1) {
        perfScale = Math.min(1, perfScale + 0.05);
        highFpsFrames = 0;
        syncParticleCount();
      }
    }
  }

  // ---------- Main loop ----------
  let lastT = performance.now();
  function frame(now) {
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (dt > 0.1) dt = 0.1; // clamp on tab-switch
    const t = now * 0.001;

    if (demoOn) updateDemo(dt);
    applyGestureControl(dt);
    syncParticleCount();
    rebuildGrid();
    updateParticles(dt);
    render(t, dt);
    drawGestureCursor(t);
    updatePerf(dt);
    audioAmbientPulse(dt);

    requestAnimationFrame(frame);
  }

  // ---------- Boot ----------
  resize();
  placeVortices();
  syncParticleCount();
  ctx.fillStyle = '#030308';
  ctx.fillRect(0, 0, W, H);
  requestAnimationFrame(frame);
})();