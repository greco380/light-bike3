import * as THREE from 'three';
import {
  GRID_SIZE, CELL_SIZE, TICK_MS,
  DIR_VECTOR, START_POSITIONS,
  PLAYER_COLOR, BOT_COLORS,
  CAM_DIST, CAM_HEIGHT, CAM_AHEAD,
  gridToWorld,
} from './constants.js';
import { Bike } from './bike.js';
import { Bot  } from './bot.js';

const PERSONALITIES = ['AVOIDANT', 'ENGAGING', 'AGGRESSIVE'];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Game {
  constructor(scene, camera, ui) {
    this.scene  = scene;
    this.camera = camera;
    this.ui     = ui;

    this.bikes    = [];
    this.bots     = [];
    this.grid     = [];
    this.running  = false;
    this.tickAccum = 0;

    // Smooth camera target
    this._camTarget = new THREE.Vector3(0, 0, 0);

    this._bindInput();
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  start() {
    this._teardown();
    this._buildGrid();
    this._spawnBikes();
    this.running   = true;
    this.tickAccum = 0;
    document.getElementById('controls-hint').style.opacity = '1';
  }

  update(deltaMs) {
    if (!this.running) {
      // Cinematic slow orbit during menu / game-over
      this._orbitCamera(deltaMs);
      return;
    }

    this.tickAccum += deltaMs;
    while (this.tickAccum >= TICK_MS && this.running) {
      this.tickAccum -= TICK_MS;
      this._tick();
    }

    this._followCamera(deltaMs);
  }

  // ─── Setup / Teardown ──────────────────────────────────────────────────────

  _buildGrid() {
    // grid[gz][gx] = bike.id (1-4) or null
    this.grid = Array.from({ length: GRID_SIZE }, () => new Array(GRID_SIZE).fill(null));
  }

  _spawnBikes() {
    this.bikes = [];
    this.bots  = [];

    const personalities = shuffle(PERSONALITIES);
    const botColors     = shuffle(BOT_COLORS);

    START_POSITIONS.forEach(([gx, gz, dir], i) => {
      const color = i === 0 ? PLAYER_COLOR : botColors[i - 1];
      const bike  = new Bike(this.scene, i + 1, color, gx, gz, dir);
      this.bikes.push(bike);

      // Pre-mark starting cell so bikes can't enter each other's start
      this.grid[gz][gx] = bike.id;

      if (i > 0) {
        this.bots.push(new Bot(bike, personalities[i - 1]));
      }
    });
  }

  _teardown() {
    this.bikes.forEach(b => b.dispose());
    this.bikes = [];
    this.bots  = [];
    this.grid  = [];
    this.running = false;
  }

  // ─── Tick ──────────────────────────────────────────────────────────────────

  _tick() {
    const player = this.bikes[0];

    // Bots decide their turns first
    this.bots.forEach(bot => {
      if (bot.bike.alive) bot.decide(this.grid, player);
    });

    // Collision detection: peek at next cell for each alive bike
    const dying = new Set();
    const nextCells = new Map();  // bikeId → {gx, gz}

    for (const bike of this.bikes) {
      if (!bike.alive) continue;
      const next = bike.peekNext();
      nextCells.set(bike.id, next);

      const oob = next.gx < 0 || next.gx >= GRID_SIZE
               || next.gz < 0 || next.gz >= GRID_SIZE;
      if (oob || this.grid[next.gz]?.[next.gx] !== null) {
        dying.add(bike.id);
      }
    }

    // Head-on: two bikes moving into the same cell → both die
    const seen = new Map();
    for (const [id, cell] of nextCells) {
      if (dying.has(id)) continue;
      const k = `${cell.gx},${cell.gz}`;
      if (seen.has(k)) {
        dying.add(id);
        dying.add(seen.get(k));
      } else {
        seen.set(k, id);
      }
    }

    // Kill losers
    this.bikes.forEach(b => { if (dying.has(b.id)) b.die(); });

    // Step survivors: mark current cell then advance
    for (const bike of this.bikes) {
      if (!bike.alive) continue;
      this.grid[bike.gz][bike.gx] = bike.id;
      bike.step();
    }

    // Win check
    const alive = this.bikes.filter(b => b.alive);
    if (alive.length <= 1) {
      this.running = false;
      document.getElementById('controls-hint').style.opacity = '0';
      const winner = alive[0] ?? null;
      setTimeout(() => this.ui.showGameOver(winner, () => this.start()), 800);
    }
  }

  // ─── Camera ────────────────────────────────────────────────────────────────

  _followCamera(deltaMs) {
    const player = this.bikes[0];
    // If player is dead keep the camera frozen at its last position
    if (!player?.alive) return;

    const { x, z } = gridToWorld(player.gx, player.gz);
    const bikePos   = new THREE.Vector3(x, 0, z);
    const dv        = DIR_VECTOR[player.dir];
    const forward   = new THREE.Vector3(dv.x, 0, dv.z);

    const wantPos = bikePos.clone()
      .addScaledVector(forward, -CAM_DIST   * CELL_SIZE)
      .setY(              CAM_HEIGHT * CELL_SIZE);

    const wantLook = bikePos.clone()
      .addScaledVector(forward, CAM_AHEAD * CELL_SIZE);

    // Frame-rate-independent smooth lerp
    const t = 1 - Math.exp(-deltaMs * 0.012);
    this.camera.position.lerp(wantPos, t);
    this._camTarget.lerp(wantLook, t);
    this.camera.lookAt(this._camTarget);
  }

  _orbitCamera(deltaMs) {
    const R = 120, H = 90, SPEED = 0.00015;
    const a = performance.now() * SPEED;
    this.camera.position.set(Math.sin(a) * R, H, Math.cos(a) * R);
    this.camera.lookAt(0, 0, 0);
  }

  // ─── Input ─────────────────────────────────────────────────────────────────

  _bindInput() {
    document.addEventListener('keydown', e => {
      if (!this.running) return;
      const player = this.bikes[0];
      if (!player?.alive) return;
      if (e.code === 'KeyA') player.queueTurn('LEFT');
      if (e.code === 'KeyD') player.queueTurn('RIGHT');
    });
  }
}
