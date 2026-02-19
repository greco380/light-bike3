import * as THREE from 'three';
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GRID_SIZE, CELL_SIZE } from './constants.js';

export function buildScene(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x00000a);
  scene.fog = new THREE.FogExp2(0x000510, 0.006);

  _addSkybox(scene);
  _addPlatform(scene);
  _addLights(scene);

  const camera = new THREE.PerspectiveCamera(
    55, window.innerWidth / window.innerHeight, 0.5, 1200,
  );
  camera.position.set(0, 80, 100);
  camera.lookAt(0, 0, 0);

  const composer = _buildComposer(renderer, scene, camera);

  return { scene, camera, composer };
}

// ─── Bloom ───────────────────────────────────────────────────────────────────

function _buildComposer(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.4,   // strength
    0.6,   // radius
    0.25,  // threshold
  );
  composer.addPass(bloom);
  return composer;
}

// ─── Skybox ───────────────────────────────────────────────────────────────────

function _addSkybox(scene) {
  const geo = new THREE.SphereGeometry(600, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vDir;

      float gridLine(float v, float spacing, float w) {
        float s = fract(v / spacing);
        return 1.0 - smoothstep(0.0, w, min(s, 1.0 - s));
      }

      void main() {
        vec3 d = normalize(vDir);
        float phi   = atan(d.z, d.x) / 6.2832 + 0.5;
        float theta = acos(clamp(d.y, -1.0, 1.0)) / 3.1416;

        float g1 = max(gridLine(phi, 0.04, 0.008), gridLine(theta, 0.04, 0.008));
        float g2 = max(gridLine(phi, 0.01, 0.003), gridLine(theta, 0.01, 0.003)) * 0.25;

        float horiz = pow(max(0.0, 1.0 - abs(d.y) * 2.5), 3.0);

        vec3 base  = vec3(0.0, 0.008, 0.03);
        vec3 color = base
          + vec3(0.0, 0.25, 0.55) * g1
          + vec3(0.0, 0.12, 0.3)  * g2
          + vec3(0.0, 0.12, 0.4)  * horiz;

        gl_FragColor = vec4(color, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(geo, mat));
}

// ─── Platform ────────────────────────────────────────────────────────────────

function _addPlatform(scene) {
  const size = GRID_SIZE * CELL_SIZE;

  // Dark base
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ color: 0x000d1a, roughness: 0.9, metalness: 0.1 }),
  );
  base.rotation.x = -Math.PI / 2;
  base.receiveShadow = true;
  scene.add(base);

  // Grid lines overlay
  const gridMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uCells: { value: GRID_SIZE },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform float uCells;

      void main() {
        vec2 cell = vUv * uCells;
        vec2 f = fract(cell);
        float b = 0.03;
        float line = step(1.0 - b, f.x) + step(1.0 - b, f.y);
        line = clamp(line, 0.0, 1.0);

        float edge = min(min(vUv.x, 1.0-vUv.x), min(vUv.y, 1.0-vUv.y));
        float glow = pow(1.0 - clamp(edge * 18.0, 0.0, 1.0), 2.5);

        vec3 col = vec3(0.0, 0.45, 0.9) * line * 0.35
                 + vec3(0.0, 0.7,  1.0) * glow * 0.5;
        float a = line * 0.3 + glow * 0.45;

        gl_FragColor = vec4(col, a);
      }`,
  });
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(size, size), gridMat);
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = 0.02;
  scene.add(grid);

  // Border walls (visual neon edge)
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x0055cc,
    emissive: 0x0033aa,
    emissiveIntensity: 1.0,
    transparent: true,
    opacity: 0.7,
  });
  const wh = CELL_SIZE * 0.5;
  const wt = CELL_SIZE * 0.25;
  const h = size / 2;
  const walls = [
    [size + wt * 2, wt,  0,       -h - wt / 2],
    [size + wt * 2, wt,  0,        h + wt / 2],
    [wt, size + wt * 2, -h - wt / 2, 0       ],
    [wt, size + wt * 2,  h + wt / 2, 0       ],
  ];
  for (const [w, d, x, z] of walls) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, wh, d), wallMat);
    m.position.set(x, wh / 2, z);
    scene.add(m);
  }
}

// ─── Lights ───────────────────────────────────────────────────────────────────

function _addLights(scene) {
  scene.add(new THREE.AmbientLight(0x112255, 0.5));

  const dir = new THREE.DirectionalLight(0x334477, 0.7);
  dir.position.set(60, 120, 60);
  dir.castShadow = true;
  dir.shadow.mapSize.set(1024, 1024);
  scene.add(dir);
}
