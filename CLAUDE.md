# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the game

No build step required. Serve the project root over HTTP:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080` (or the port shown). The game **cannot** be opened as a `file://` URL because ES modules require HTTP.

## Stack

- **Three.js r160** via CDN importmap (no npm, no bundler)
- **EffectComposer + UnrealBloomPass** for the neon bloom effect
- ES modules throughout (`type="module"`)

## Architecture

```
index.html        importmap, canvas, UI div
css/style.css     full-screen canvas, overlay screens, neon button style
js/
  main.js         renderer setup, scene init, game loop, resize handler
  scene.js        buildScene() → { scene, camera, composer }
                    - procedural tech-grid skybox (ShaderMaterial, BackSide sphere)
                    - platform (dark plane + grid-line shader overlay + border walls)
                    - lights + EffectComposer/bloom
  constants.js    GRID_SIZE=80, CELL_SIZE=2, TICK_MS=100, DIR_* maps, helpers
  bike.js         Bike class – mesh, point light, trail segments, step(), die()
  bot.js          Three decide* functions + Bot wrapper class
  game.js         Game class – grid, spawn, tick loop, camera follow, input
  ui.js           UI class – start screen, game-over overlay
```

## Key design decisions

**Grid vs world coordinates**
- Grid is 80×80. `gridToWorld(gx, gz)` centres the arena at world (0,0,0).
- Y is up; bikes and trails live on the XZ plane.

**Tick loop**
- `game.update(deltaMs)` accumulates time and fires `_tick()` every `TICK_MS` (100 ms).
- Bots decide their turns → collision peek → mark dying → step survivors → win check.

**Trail rendering**
- Each straight run = one `BoxGeometry` mesh that grows each tick (`activeSeg`).
- On a turn the mesh is finalised into `segments[]` and a new one starts.
- All trail meshes share a single `MeshStandardMaterial` per bike.

**Camera**
- During play: third-person elevated behind the player bike, frame-rate-independent lerp.
- During menu/game-over: slow cinematic orbit.

**Bot personalities** (shuffled randomly each round)
- `AVOIDANT` – flood-fill + look-ahead survival scoring
- `ENGAGING`  – maximises straight-line reach to cut off map sections
- `AGGRESSIVE` – minimises Manhattan distance to the player's predicted position

## Adding skills/abilities (future)

New abilities (jump, shield, boost) should be implemented as methods on `Bike` and triggered via additional key bindings in `game.js _bindInput()`.  Abilities that affect collision rules need changes in `game.js _tick()`.
