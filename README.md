# Particle Exchange Visualization

An interactive full-stack particle visualization featuring two draggable vortex
systems, 1000+ glowing particles with trails and color shifting, bloom
post-processing, lightning arcs, shockwaves, and a real-time stats link to a
Node.js backend over WebSocket.

## Features

**Frontend (Vanilla JS + Canvas 2D)**
- Full-screen canvas with 200–2000 particles
- Two draggable vortex cores with rotating spiral arms
- Multi-layer glow per particle (hot core + mid glow + halo), cached as sprites
- Color-shifting particles cycling blue → cyan → orange → purple
- Particle trails with gradient fade
- Bloom post-processing (downscaled + blurred additive pass)
- Connection web between nearby particles (spatial-hash accelerated)
- Shockwave rings when a vortex reverses direction
- Lightning arcs between the two vortices
- Pre-rendered nebula + starfield background
- Mouse trail glow effect
- FPS counter and particle count HUD
- Live server stats panel fed by WebSocket

**Backend (Node.js + Express + ws)**
- `GET /` — serves the frontend
- `GET /api/particles` — current particle configuration (count, colors, vortices, speed)
- `POST /api/particles` — update configuration (validated and clamped)
- `GET /api/stats` — real-time stats (active particles, fps, connections, uptime)
- `GET /health` — health check
- `ws://host/ws` — WebSocket broadcasting stats every 500ms; accepts client
  fps/particle reports; pushes config changes to all connected clients
- CORS enabled on all routes

## Interactions

| Action | Effect |
| --- | --- |
| Drag vortex core | Reposition the vortex |
| Click vortex | Reverse its rotation (with shockwave + lightning) |
| Scroll wheel | Change particle count (200–2000) |
| Double-click | Reset the scene |
| Move mouse | Attract nearby particles |
| Shift + mouse | Repel nearby particles |

## Getting Started

```bash
npm install
npm start
```

Then open <http://localhost:3000>.

Set a custom port with `PORT=8080 npm start`.

## API Examples

```bash
# Get config
curl http://localhost:3000/api/particles

# Update particle count and speed
curl -X POST http://localhost:3000/api/particles \
  -H "Content-Type: application/json" \
  -d '{"count": 1500, "speed": 1.5}'

# Live stats
curl http://localhost:3000/api/stats

# Health check
curl http://localhost:3000/health
```

## Project Structure

```
.
├── package.json        # Dependencies (express, ws)
├── server.js           # Express + WebSocket backend
├── public/
│   ├── index.html      # Page shell, HUD, stats panel
│   ├── style.css       # Glassmorphism panels + layout
│   └── app.js          # Particle engine, physics, effects, WS client
└── README.md
```

## Performance Notes

- Glow rendering uses pre-baked radial-gradient sprites bucketed by hue
  (64 buckets) instead of per-frame gradients.
- The connection web uses a spatial hash grid and samples a particle subset
  at high counts to stay O(n) in practice.
- Bloom renders the frame at quarter resolution, blurs it, and composites it
  additively — much cheaper than full-resolution blur.