'use strict';

/**
 * Particle Exchange — zero-dependency Node.js server.
 *
 * - Serves static files from this directory (index route -> index.html)
 * - GET /api/config  : initial client configuration (particle count, theme)
 * - GET /api/health  : liveness probe
 *
 * Webcam gestures: the client loads MediaPipe Hands from the jsDelivr CDN.
 * getUserMedia requires a secure context, so open the app via
 * http://localhost:<port> (secure by definition) or behind HTTPS.
 *
 * Usage:  node server.js            (defaults to port 3000)
 *         PORT=8080 node server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number.parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const INDEX_FILE = 'index.html';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.txt':  'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  // MediaPipe assets (only needed if you self-host them instead of the CDN)
  '.wasm':   'application/wasm',
  '.data':   'application/octet-stream',
  '.tflite': 'application/octet-stream',
  '.binarypb':'application/octet-stream'
};

// Initial config handed to the client on boot (client clamps + falls back safely).
const CLIENT_CONFIG = {
  particles: Number.parseInt(process.env.PARTICLES, 10) || 1200,
  theme: Number.parseInt(process.env.THEME, 10) || 0
};

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function sendError(res, status, message) {
  sendJSON(res, status, { error: message });
}

function serveFile(res, filePath) {
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      sendError(res, 404, 'Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache'
    });
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      // Headers already sent; just terminate the connection.
      res.destroy();
    });
    stream.pipe(res);
  });
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (_) {
    sendError(res, 400, 'Bad request');
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendError(res, 405, 'Method not allowed');
    return;
  }

  // ---- API ----
  if (pathname === '/api/config') {
    sendJSON(res, 200, CLIENT_CONFIG);
    return;
  }
  if (pathname === '/api/health') {
    sendJSON(res, 200, { status: 'ok', uptime: process.uptime() });
    return;
  }

  // ---- Static files (with path-traversal protection) ----
  if (pathname === '/') pathname = '/' + INDEX_FILE;
  const resolved = path.normalize(path.join(ROOT, pathname));
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
    sendError(res, 403, 'Forbidden');
    return;
  }
  serveFile(res, resolved);
});

server.listen(PORT, HOST, () => {
  console.log(`◈ Particle Exchange server running at http://localhost:${PORT}`);
  console.log(`  serving ${path.join(ROOT, INDEX_FILE)}`);
});

// Graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\nReceived ${sig}, shutting down...`);
    server.close(() => process.exit(0));
    // Force-exit if connections keep the server alive too long.
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
