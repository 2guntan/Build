import * as THREE from 'three';
import type { BuildResult, Vec2 } from '@fs/recipe';
import type { ContextPrism } from '@fs/sun';
import { ContextLayer } from './ContextLayer';
import { MassingLayer } from './MassingLayer';
import { OverlayLayer } from './OverlayLayer';

let shared: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; massing: MassingLayer; context: ContextLayer; overlay: OverlayLayer; sun: THREE.DirectionalLight } | null = null;

function setup() {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#eef2f3');
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#dadcd5', roughness: 1 }));
  ground.receiveShadow = true;
  ground.position.y = -0.05;
  scene.add(ground, new THREE.HemisphereLight('#dbe9ff', '#a89f8f', 0.9));
  const sun = new THREE.DirectionalLight('#fff4e0', 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -120, right: 120, top: 120, bottom: -120, near: 1, far: 800 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const camera = new THREE.PerspectiveCamera(35, 4 / 3, 0.5, 3000);
  shared = { renderer, scene, camera, massing: new MassingLayer(scene), context: new ContextLayer(scene), overlay: new OverlayLayer(scene), sun };
  return shared;
}

/**
 * Renders a small 3D snapshot of a design with its context (offscreen, shared WebGL context).
 * Returns a PNG data URL.
 */
export function renderThumbnail(a: { build: BuildResult; plot: Vec2[]; buildable?: Vec2[] | null; context?: ContextPrism[]; width?: number; height?: number }): string {
  const s = shared ?? setup();
  const w = a.width ?? 480;
  const h = a.height ?? 360;
  s.renderer.setPixelRatio(1);
  s.renderer.setSize(w, h, false);
  s.camera.aspect = w / h;
  s.overlay.setPlot(a.plot, a.buildable ?? null);
  s.context.update(a.context ?? []);
  s.massing.update(a.build, null, []);
  const box = new THREE.Box3();
  for (const p of a.plot) box.expandByPoint(new THREE.Vector3(p[0], 0, -p[1]));
  box.union(s.massing.bounds());
  const c = box.getCenter(new THREE.Vector3());
  const size = Math.max(30, box.getSize(new THREE.Vector3()).length());
  const dir = new THREE.Vector3(0.6, 0.75, 0.85).normalize().multiplyScalar(size * 1.35);
  s.camera.position.copy(c).add(dir);
  s.camera.lookAt(c.x, c.y * 0.5, c.z);
  s.camera.updateProjectionMatrix();
  s.sun.position.set(c.x + 200, 260, c.z + 220);
  s.sun.target.position.copy(c);
  s.renderer.render(s.scene, s.camera);
  return s.renderer.domElement.toDataURL('image/png');
}
