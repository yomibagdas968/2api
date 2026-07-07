/**
 * Particle Exchange Visualization - Backend
 * Express HTTP API + ws WebSocket broadcasting real-time stats.
 */
const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(express.json());

// CORS enabled for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------
const startTime = Date.now();

let particleConfig = {
  count: 1000,
  minCount: 200,
  maxCount: 2000,
  speed: 1.0,
  colors: {
    palette: ['#2266ff', '#00e5ff', '#ff8c1a', '#a64dff'],
    background: '#04040c'
  },
  vortices: [
    { id: 0, x: 0.3, y: 0.5, strength: 1.0, direction: 1 },
    { id: 1, x: 0.7, y: 0.5, strength: 1.0, direction: -1 }
  ],
  trailLength: 8,
  connectionDistance: 90,
  bloom: true
};

// Live stats reported by clients (latest wins) + server-side counters
const liveStats = {
  activeParticles: particleConfig.count,
  fps: 0,
  connections: 0,
  totalMessages: 0,
  configUpdates: 0
};

// ---------------------------------------------------------------------------
// REST API
// ---------------------------------------------------------------------------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/particles', (req, res) => {
  res.json(particleConfig);
});

app.post('/api/particles', (req, res) => {
  const body = req.body || {};

  if (typeof body.count === 'number') {
    particleConfig.count = Math.max(
      particleConfig.minCount,
      Math.min(particleConfig.maxCount, Math.round(body.count))
    );
    liveStats.activeParticles = particleConfig.count;
  }
  if (typeof body.speed === 'number') {
    particleConfig.speed = Math.max(0.1, Math.min(5, body.speed));
  }
  if (Array.isArray(body.vortices)) {
    body.vortices.forEach((v) => {
      const target = particleConfig.vortices.find((t) => t.id === v.id);
      if (!target) return;
      if (typeof v.x === 'number') target.x = Math.max(0, Math.min(1, v.x));
      if (typeof v.y === 'number') target.y = Math.max(0, Math.min(1, v.y));
      if (typeof v.strength === 'number') target.strength = Math.max(0, Math.min(5, v.strength));
      if (v.direction === 1 || v.direction === -1) target.direction = v.direction;
    });
  }
  if (body.colors && Array.isArray(body.colors.palette)) {
    particleConfig.colors.palette = body.colors.palette.slice(0, 8);
  }
  if (typeof body.trailLength === 'number') {
    particleConfig.trailLength = Math.max(2, Math.min(30, Math.round(body.trailLength)));
  }
  if (typeof body.bloom === 'boolean') {
    particleConfig.bloom = body.bloom;
  }

  liveStats.configUpdates += 1;
  broadcast({ type: 'config', payload: particleConfig });
  res.json({ ok: true, config: particleConfig });
});

app.get('/api/stats', (req, res) => {
  res.json(buildStats());
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString()
  });
});

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ server, path: '/ws' });

function buildStats() {
  return {
    activeParticles: liveStats.activeParticles,
    fps: liveStats.fps,
    connections: wss.clients.size,
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    totalMessages: liveStats.totalMessages,
    configUpdates: liveStats.configUpdates,
    serverTime: Date.now()
  };
}

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  // Send current config immediately on connect
  ws.send(JSON.stringify({ type: 'config', payload: particleConfig }));
  ws.send(JSON.stringify({ type: 'stats', payload: buildStats() }));

  ws.on('message', (raw) => {
    liveStats.totalMessages += 1;
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'client-stats' && msg.payload) {
        if (typeof msg.payload.fps === 'number') {
          liveStats.fps = Math.round(msg.payload.fps);
        }
        if (typeof msg.payload.activeParticles === 'number') {
          liveStats.activeParticles = Math.round(msg.payload.activeParticles);
        }
      }
    } catch (_) {
      /* ignore malformed messages */
    }
  });
});

// Broadcast stats to all clients every 500ms
setInterval(() => {
  if (wss.clients.size > 0) {
    broadcast({ type: 'stats', payload: buildStats() });
  }
}, 500);

// Heartbeat: terminate dead connections
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// ---------------------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`Particle Exchange server running at http://localhost:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
});