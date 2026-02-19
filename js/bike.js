import * as THREE from 'three';
import {
  CELL_SIZE, TRAIL_W, TRAIL_H, BIKE_Y, GLOW_Y,
  DIR_ANGLE, DIR_VECTOR, TURN_LEFT, TURN_RIGHT,
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
    this.segStart  = { gx, gz };   // start of the current growing segment
    this.activeSeg = null;         // the mesh being extended this straight run
    this.segments  = [];           // finalised (static) segment meshes

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

  queueTurn(side) {          // side: 'LEFT' | 'RIGHT'
    if (this.alive) this.pendingTurn = side;
  }

  // Return the grid cell the bike will occupy on the NEXT tick
  // (accounts for any pending turn)
  peekNext() {
    const dir = this.pendingTurn
      ? (this.pendingTurn === 'LEFT' ? TURN_LEFT[this.dir] : TURN_RIGHT[this.dir])
      : this.dir;
    const v = DIR_VECTOR[dir];
    return { gx: this.gx + v.x, gz: this.gz + v.z };
  }

  // Execute one grid tick.  grid[][] is updated externally before this call.
  step() {
    // Extend trail visual to cover current cell (which we're about to leave)
    this._extendSegTo(this.gx, this.gz);

    // Apply turn
    if (this.pendingTurn) {
      this._finaliseSegment();                   // lock the current segment mesh
      this.segStart = { gx: this.gx, gz: this.gz };
      this.dir = this.pendingTurn === 'LEFT'
        ? TURN_LEFT[this.dir] : TURN_RIGHT[this.dir];
      this.pendingTurn = null;
    }

    // Advance
    const v = DIR_VECTOR[this.dir];
    this.gx += v.x;
    this.gz += v.z;

    // Sync 3-D model
    const { x, z } = gridToWorld(this.gx, this.gz);
    this.mesh.position.set(x, BIKE_Y, z);
    this.mesh.rotation.y = DIR_ANGLE[this.dir];
    this.glow.position.set(x, GLOW_Y, z);
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
      CELL_SIZE * 1.1,   // length (forward = X axis)
      CELL_SIZE * 0.32,  // height
      CELL_SIZE * 0.48,  // width
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

  // Rebuild the growing trail segment so it spans segStart → (toGx, toGz)
  _extendSegTo(toGx, toGz) {
    if (this.activeSeg) {
      this.scene.remove(this.activeSeg);
      this.activeSeg.geometry.dispose();
      this.activeSeg = null;
    }

    const { x: wx1, z: wz1 } = gridToWorld(this.segStart.gx, this.segStart.gz);
    const { x: wx2, z: wz2 } = gridToWorld(toGx, toGz);

    const midX = (wx1 + wx2) / 2;
    const midZ = (wz1 + wz2) / 2;

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
