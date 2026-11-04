import * as THREE from 'three';
import type { SunPosition } from '@fs/sun';
import { sunRamp } from './colors';

/** Directional sun light with shadow maps, plus the sun-hours point map. */
export class SunLayer {
  private readonly light = new THREE.DirectionalLight('#fff7e6', 2.2);
  private readonly target = new THREE.Object3D();
  private points: THREE.Points | null = null;

  constructor(private readonly scene: THREE.Scene) {
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(2048, 2048);
    const cam = this.light.shadow.camera;
    cam.left = -150;
    cam.right = 150;
    cam.top = 150;
    cam.bottom = -150;
    cam.near = 1;
    cam.far = 800;
    this.light.shadow.bias = -0.0005;
    this.light.target = this.target;
    this.light.visible = false;
    scene.add(this.light, this.target);
  }

  setShadows(on: boolean) {
    this.light.castShadow = on;
  }

  /** Places the light along the sun vector (local x east, y north, z up). */
  setPosition(p: SunPosition | null, shadows = true) {
    if (!p || p.altitudeDeg <= 0) {
      this.light.visible = false;
      return;
    }
    const [x, y, z] = p.vector;
    this.light.position.set(x * 300, z * 300, -y * 300);
    this.light.castShadow = shadows;
    this.light.visible = true;
  }

  showHours(points: [number, number, number][], hours: ArrayLike<number>) {
    this.clearHours();
    const pos = new Float32Array(points.length * 3);
    const col = new Float32Array(points.length * 3);
    points.forEach((p, i) => {
      pos.set([p[0], p[2], -p[1]], i * 3);
      col.set(sunRamp(hours[i] ?? 0), i * 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.9, vertexColors: true, sizeAttenuation: true }));
    this.scene.add(this.points);
  }

  clearHours() {
    if (this.points) {
      this.scene.remove(this.points);
      this.points.geometry.dispose();
      this.points = null;
    }
  }
}
