import * as THREE from 'three';
import {
  CELL_SIZE, TRAIL_W, TRAIL_H, BIKE_Y, GLOW_Y,
  DIR_ANGLE, DIR_VECTOR, TURN_LEFT, TURN_RIGHT,
  JUMP_HEIGHT_WORLD, JUMP_DURATION_MS, MAX_JUMPS,
  gridToWorld,
} from './constants.js';

export class Bike {
  constructor(scene, id, color, gx, gz, dir) {
    this.scene  = scene;
    this.id     = id;
    this.color  = color;
    this.gx     = gx;
    this.gz     = gz;
    this.dir    = dir;
    this.alive  = true;

    this.pendingTurn = null; // 'LEFT' | 'RIGHT'

    // Trail segment bookkeeping
    this.segStart  = { gx, gz };
    this.activeSeg = null;
    this.segments  = [];           // finalised static segment meshes

    // Grid cells this bike has claimed — used to clear the grid on death
    this._trailGridCells = [];

    // Jump state
    this.jumpCount    = 0;
    this._jumpStartMs = 0;         // 0 = not jumping
    this._wasJumping  = false;

    this._trailMat = new THREE.MeshStandardMaterial({
      color:             this.color,
      emissive:          this.color,
      emissiveIntensity: 1.0,
      transparent:       true,
      opacity:           0.92,
    });

    this._buildMesh();
  }

  // ─── Public ───────────────────────────────────────────────────────────────

  queueTurn(side) {
    if (this.alive) this.pendingTurn = side;
  }

  isJumping() {
    return this._jumpStartMs > 0
      && (performance.now() - this._jumpStartMs) < JUMP_DURATION_MS;
  }

  jump() {
    if (!this.alive || this.jumpCount >= MAX_JUMPS || this.isJumping()) return;
    this.jumpCount++;
    this._jumpStartMs = performance.now();
  }

  // Called by Game when marking a grid cell that belongs to this bike
  recordTrailCell(gx, gz) {
    this._trailGridCells.push({ gx, gz });
  }

  // Remove this bike's trail from the scene AND clear its cells in grid[][]
  clearTrail(grid) {
    this._trailGridCells.forEach(({ gx, gz }) => {
      if (grid[gz]?.[gx] === this.id) grid[gz][gx] = null;
    });
    this._trailGridCells = [];

    if (this.activeSeg) {
      this.scene.remove(this.activeSeg);
      this.activeSeg.geometry.dispose();
      this.activeSeg = null;
    }
    this.segments.forEach(m => {
      this.scene.remove(m);
      m.geometry.dispose();
    });
    this.segments = [];

    // Reset segment start so a new trail can begin if somehow still alive
    this.segStart = { gx: this.gx, gz: this.gz };
  }

  // Peek at the next grid cell without moving (accounts for pending turn)
  peekNext() {
    const dir = this.pendingTurn
      ? (this.pendingTurn === 'LEFT' ? TURN_LEFT[this.dir] : TURN_RIGHT[this.dir])
      : this.dir;
    const v = DIR_VECTOR[dir];
    return { gx: this.gx + v.x, gz: this.gz + v.z };
  }

  // Execute one grid tick.
  // Caller is responsible for grid[][] marking (via recordTrailCell) before calling this.
  step() {
    const jumping = this.isJumping();

    if (this._wasJumping && !jumping) {
      // Just landed — start a fresh trail segment from landing position
      this.segStart = { gx: this.gx, gz: this.gz };
    }
    this._wasJumping = jumping;

    if (!jumping) {
      this._extendSegTo(this.gx, this.gz);
    } else if (this.activeSeg) {
      // Liftoff — seal the segment at the jump-start cell
      this._finaliseSegment();
    }

    // Apply turn
    if (this.pendingTurn) {
      if (!jumping) this._finaliseSegment();
      this.segStart = { gx: this.gx, gz: this.gz };
      this.dir = this.pendingTurn === 'LEFT'
        ? TURN_LEFT[this.dir] : TURN_RIGHT[this.dir];
      this.pendingTurn = null;
    }

    // Advance
    const v = DIR_VECTOR[this.dir];
    this.gx += v.x;
    this.gz += v.z;

    // Update XZ immediately; Y is handled smoothly by updateVisual() every frame
    const { x, z } = gridToWorld(this.gx, this.gz);
    this.mesh.position.x = x;
    this.mesh.position.z = z;
    this.mesh.rotation.y = DIR_ANGLE[this.dir];
    this.glow.position.x = x;
    this.glow.position.z = z;

    if (!jumping) {
      this.mesh.position.y = BIKE_Y;
      this.glow.position.y  = GLOW_Y;
    }
  }

  // Called every render frame for smooth jump arc animation
  updateVisual() {
    if (this._jumpStartMs === 0) return;
    const elapsed = performance.now() - this._jumpStartMs;
    if (elapsed < JUMP_DURATION_MS) {
      const t = elapsed / JUMP_DURATION_MS;
      const h = Math.sin(t * Math.PI) * JUMP_HEIGHT_WORLD;
      this.mesh.position.y = BIKE_Y + h;
      this.glow.position.y  = GLOW_Y  + h;
    } else {
      this.mesh.position.y = BIKE_Y;
      this.glow.position.y  = GLOW_Y;
      this._jumpStartMs = 0;
    }
  }

  die() {
    this.alive = false;
    this._finaliseSegment();
    this.mesh.material.emissiveIntensity = 0.15;
    this.mesh.material.transparent = true;
    this.mesh.material.opacity     = 0.35;
    this.glow.intensity = 0;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.scene.remove(this.glow);
    if (this.activeSeg) {
      this.scene.remove(this.activeSeg);
      this.activeSeg.geometry.dispose();
    }
    this.segments.forEach(m => {
      this.scene.remove(m);
      m.geometry.dispose();
    });
    this._trailMat.dispose();
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  _buildMesh() {
    const geo = new THREE.BoxGeometry(
      CELL_SIZE * 1.1,
      CELL_SIZE * 0.32,
      CELL_SIZE * 0.48,
    );
    const mat = new THREE.MeshStandardMaterial({
      color:             this.color,
      emissive:          this.color,
      emissiveIntensity: 0.9,
      metalness:         0.5,
      roughness:         0.3,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;

    const { x, z } = gridToWorld(this.gx, this.gz);
    this.mesh.position.set(x, BIKE_Y, z);
    this.mesh.rotation.y = DIR_ANGLE[this.dir];
    this.scene.add(this.mesh);

    this.glow = new THREE.PointLight(this.color, 3, CELL_SIZE * 7);
    this.glow.position.set(x, GLOW_Y, z);
    this.scene.add(this.glow);
  }

  _extendSegTo(toGx, toGz) {
    if (this.activeSeg) {
      this.scene.remove(this.activeSeg);
      this.activeSeg.geometry.dispose();
      this.activeSeg = null;
    }

    const { x: wx1, z: wz1 } = gridToWorld(this.segStart.gx, this.segStart.gz);
    const { x: wx2, z: wz2 } = gridToWorld(toGx, toGz);

    const midX  = (wx1 + wx2) / 2;
    const midZ  = (wz1 + wz2) / 2;
    const horiz = (this.segStart.gz === toGz);
    const cells = horiz
      ? Math.abs(toGx - this.segStart.gx) + 1
      : Math.abs(toGz - this.segStart.gz) + 1;
    const len = cells * CELL_SIZE;

    const geo = horiz
      ? new THREE.BoxGeometry(len, TRAIL_H, TRAIL_W)
      : new THREE.BoxGeometry(TRAIL_W, TRAIL_H, len);

    this.activeSeg = new THREE.Mesh(geo, this._trailMat);
    this.activeSeg.position.set(midX, TRAIL_H / 2, midZ);
    this.scene.add(this.activeSeg);
  }

  _finaliseSegment() {
    if (this.activeSeg) {
      this.segments.push(this.activeSeg);
      this.activeSeg = null;
    }
  }
}
