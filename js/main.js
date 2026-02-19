import * as THREE from 'three';
import { buildScene } from './scene.js';
import { Game }       from './game.js';
import { UI }         from './ui.js';

// ─── Renderer ────────────────────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias:   true,
  powerPreference: 'high-performance',
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
renderer.toneMapping       = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// ─── Scene / Camera / Post-processing ────────────────────────────────────────

const { scene, camera, composer } = buildScene(renderer);

// ─── Game ─────────────────────────────────────────────────────────────────────

const ui   = new UI();
const game = new Game(scene, camera, ui);

ui.showStartScreen(() => game.start());

// ─── Loop ─────────────────────────────────────────────────────────────────────

let last = 0;

function loop(now) {
  requestAnimationFrame(loop);
  const delta = Math.min(now - last, 100); // clamp to avoid spiral on tab switch
  last = now;
  game.update(delta);
  composer.render();
}

requestAnimationFrame(loop);

// ─── Resize ──────────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
});
