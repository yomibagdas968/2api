# Particle Exchange — Spectral Vortex

An interactive particle visualization: up to 2000 glowing particles orbit
draggable vortex cores, with comet trails, a connection web, energy arcs,
shockwaves, bloom post-processing, four color themes, and optional webcam
hand-gesture control. Served by a zero-dependency Node.js server.

## Features

**Rendering (Vanilla JS + Canvas 2D)**
- Full-screen canvas with 200–2000 particles (rare blazing comets among them)
- Up to 4 vortex cores with rotating spiral arms and layered glow
- Particle halo/glow/core baked into pre-rendered sprites (one `drawImage`
  per particle instead of three gradient fills)
- Color ramp over each particle's lifetime, quantized into cached sprite
  and stroke-color steps — no per-frame color-string allocation
- Fading particle trails and a spatial-hash-accelerated connection web
- Energy arcs flickering between every pair of vortices
- Shockwave rings with power-scaled push, screen shake and flash
- Bloom post-processing (quarter-resolution blurred additive pass)
- Pre-rendered nebula + starfield background with live twinkling stars
- FPS / particle count / mode HUD

**Interaction**
- Drag, reverse and add/remove vortex cores
- Fluid stir: sweeping the pointer drags nearby particles along, like a hand
  swept through water
- Charge singularity: hold on empty space to gather particles into a
  spiraling well, release for a nova burst scaled by charge time
  (a quick tap emits a gentle ripple)
- Attract / repulse modes, supernova bursts, slow-motion, pause, themes
- Optional webcam hand gestures via MediaPipe Hands (loaded from CDN)

**Backend (zero-dependency Node.js)**
- Serves the static frontend with path-traversal protection
- `GET /api/config` — initial client configuration (`particles`, `theme`),
  overridable via the `PARTICLES` and `THEME` environment variables
- `GET /api/health` — liveness probe with uptime

## Interactions

| Action | Effect |
| --- | --- |
| Drag vortex core | Reposition the vortex |
| Click vortex core | Reverse its rotation (+shockwave) |
| Hold empty space | Charge a singularity that gathers particles |
| Release hold | Nova burst — power scales with charge time |
| Quick tap | Gentle ripple |
| Sweep mouse | Stir the particle flow |
| Move mouse | Attract nearby particles |
| Hold Shift | Repel nearby particles |
| Right-click | Supernova |
| Scroll wheel | Change particle count (200–2000) |
| Double-click | Reset the scene |
| `V` / `X` | Add / remove a vortex (max 4) |
| `1`–`4` | Switch color theme (Spectral, Inferno, Aurora, Neon) |
| `Space` | Slow motion while held |
| `P` | Pause / resume |
| `G` | Toggle webcam gestures |

**Webcam gestures** (after pressing `G`; needs camera permission and CDN access):
☝ point = attract · ✊ fist = repulse · 🤏 pinch = grab a core · ✌ victory = supernova

## Getting Started

No dependencies to install:

```bash
npm start          # or: node server.js
```

Then open <http://localhost:3000>.

Configuration via environment variables:

```bash
PORT=8080 PARTICLES=1600 THEME=2 npm start
```

Webcam gestures require a secure context (`http://localhost` or HTTPS).

## API Examples

```bash
# Initial client config
curl http://localhost:3000/api/config

# Health check
curl http://localhost:3000/api/health
```

## Project Structure

```
.
├── package.json    # Metadata only — no runtime dependencies
├── server.js       # Zero-dependency static + API server
├── index.html      # Page shell, HUD, help overlay
├── style.css       # HUD / overlay styles
└── app.js          # Particle engine, physics, effects, gestures
```

## Performance Notes

- Particle glow (halo + mid glow + core) is baked into sprites quantized to
  48 steps along the theme's color ramp; trails and connection lines reuse
  cached color strings with `globalAlpha`, so the hot loops allocate no
  strings.
- Vortex core glow is baked once per hue instead of building three radial
  gradients per vortex per frame.
- The connection web uses a spatial hash grid with packed integer keys and
  a per-frame segment budget to stay O(n) in practice.
- Bloom renders the frame at quarter resolution, blurs it, and composites
  it additively — much cheaper than a full-resolution blur.
