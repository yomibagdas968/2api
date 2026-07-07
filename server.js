const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// In-memory particle snapshot store
let particleSnapshots = [];
const MAX_SNAPSHOTS = 100;
const startTime = Date.now();

// Per-client stats reported over WebSocket
const clientStats = new Map(); // ws -> { fps, count, ts }

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/particles', (req, res) => {
  res.json({
    ok: true,
    snapshots: particleSnapshots.slice(-20),
    total: particleSnapshots.length
  });
});

app.post('/api/particles', (req, res) => {
  const body = req.body || {};
  const snapshot = {
    id: particleSnapshots.length + 1,
    count: typeof body.count === 'number' ? body.count : 0,
    mode: typeof body.mode === 'string' ? body.mode.slice(0, 32) : 'unknown',
    ts: Date.now()
  };
  particleSnapshots.push(snapshot);
  if (particleSnapshots.length > MAX_SNAPSHOTS) {
    particleSnapshots = particleSnapshots.slice(-MAX_SNAPSHOTS);
  }
  res.status(201).json({ ok: true, snapshot });
});

app.get('/api/stats', (req, res) => {
  res.json({ ok: true, stats: aggregateStats() });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, status: 'healthy', uptime: (Date.now() - startTime) / 1000 });
});

function aggregateStats() {
  const now = Date.now();
  let fpsSum = 0;
  let particleSum = 0;
  let n = 0;
  for (const [, s] of clientStats) {
    if (now - s.ts < 10000) {
      fpsSum += s.fps;
      particleSum += s.count;
      n++;
    }
  }
  return {
    clients: clientStats.size,
    activeClients: n,
    avgFps: n ? Math.round((fpsSum / n) * 10) / 10 : 0,
    totalParticles: particleSum,
    snapshots: particleSnapshots.length,
    uptimeSec: Math.round((now - startTime) / 1000)
  };
}

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  clientStats.set(ws, { fps: 0, count: 0, ts: Date.now() });

  ws.send(JSON.stringify({ type: 'welcome', stats: aggregateStats() }));

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (msg && msg.type === 'stats') {
      clientStats.set(ws, {
        fps: Number(msg.fps) || 0,
        count: Number(msg.count) || 0,
        ts: Date.now()
      });
    }
  });

  ws.on('close', () => clientStats.delete(ws));
  ws.on('error', () => clientStats.delete(ws));
});

// Broadcast aggregate stats to all clients every 2 seconds
setInterval(() => {
  const payload = JSON.stringify({ type: 'stats', stats: aggregateStats() });
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(payload);
  }
}, 2000);

server.listen(PORT, () => {
  console.log(`Particle exchange server running at http://localhost:${PORT}`);
});