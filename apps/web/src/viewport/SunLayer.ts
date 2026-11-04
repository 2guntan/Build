import * as THREE from 'three';
import type { SunPosition } from '@fs/sun';
import { sunRamp } from './colors';

export interface HeatCell {
  pos: [number, number, number];
  normal: [number, number, number] | null;
  w: number;
  h: number;
}

/** Key light (sun or a default studio sun), sky light, and the sun-hours heat map on surfaces. */
export class SunLayer {
  private readonly light = new THREE.DirectionalLight('#fff4e0', 2.4);
  private readonly hemi = new THREE.HemisphereLight('#dbe9ff', '#a89f8f', 0.85);
  private readonly target = new THREE.Object3D();
  private heat: THREE.Mesh | null = null;
  private center = new THREE.Vector3();

  constructor(private readonly scene: THREE.Scene) {
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(4096, 4096);
    const cam = this.light.shadow.camera;
    cam.left = -160;
    cam.right = 160;
    cam.top = 160;
    cam.bottom = -160;
    cam.near = 1;
    cam.far = 900;
    this.light.shadow.bias = -0.0004;
    this.light.shadow.normalBias = 0.04;
    this.light.shadow.radius = 3;
    this.light.target = this.target;
    scene.add(this.light, this.hemi, this.target);
    this.setPosition(null);
  }

  setCenter(x: number, z: number) {
    this.center.set(x, 0, z);
    this.target.position.copy(this.center);
  }

  setShadows(on: boolean) {
    this.light.castShadow = on;
  }

  setDark(dark: boolean) {
    this.hemi.color.set(dark ? '#5b6b85' : '#dbe9ff');
    this.hemi.groundColor.set(dark ? '#1c1f24' : '#b9b2a4');
    this.hemi.intensity = dark ? 0.7 : 0.85;
  }

  /** Real sun when given; otherwise a pleasant default (south-east, 45°) for modelling. */
  setPosition(p: SunPosition | null) {
    let v: [number, number, number];
    if (p && p.altitudeDeg > 0) {
      v = p.vector;
      this.light.intensity = 1.2 + 1.6 * Math.min(1, Math.sin((p.altitudeDeg * Math.PI) / 180) * 1.5);
    } else if (p) {
      this.light.intensity = 0;
      return;
    } else {
      v = [0.5, -0.55, 0.67];
      this.light.intensity = 3;
    }
    const [x, y, z] = v;
    this.light.position.set(this.center.x + x * 400, z * 400, this.center.z - y * 400);
  }

  /** Paints direct-sun hours on small quads laid on the ground and façades. */
  showHours(cells: HeatCell[], hours: ArrayLike<number>) {
    this.clearHours();
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    cells.forEach((c, i) => {
      const [r, g, b] = sunRamp(hours[i] ?? 0);
      const [x, y, z] = c.pos;
      const s = pos.length / 3;
      if (c.normal) {
        // Façade quad: horizontal axis along the wall, vertical axis up.
        const tx = -c.normal[1];
        const ty = c.normal[0];
        const hw = (c.w * 0.98) / 2;
        const hh = (c.h * 0.96) / 2;
        const ox = x + c.normal[0] * 0.04;
        const oy = y + c.normal[1] * 0.04;
        for (const [du, dv] of [
          [-hw, -hh],
          [hw, -hh],
          [hw, hh],
          [-hw, hh],
        ] as const) {
          pos.push(ox + tx * du, z + dv, -(oy + ty * du));
        }
      } else {
        const h = (c.w * 0.98) / 2;
        for (const [dx, dy] of [
          [-h, -h],
          [h, -h],
          [h, h],
          [-h, h],
        ] as const) {
          pos.push(x + dx, 0.08, -(y + dy));
        }
      }
      for (let k = 0; k < 4; k++) col.push(r, g, b);
      idx.push(s, s + 1, s + 2, s, s + 2, s + 3);
    });
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geom.setIndex(idx);
    this.heat = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.92, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.heat.raycast = () => undefined;
    this.scene.add(this.heat);
  }

  clearHours() {
    if (this.heat) {
      this.scene.remove(this.heat);
      this.heat.geometry.dispose();
      this.heat = null;
    }
  }
}
