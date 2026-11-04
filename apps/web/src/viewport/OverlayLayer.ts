import * as THREE from 'three';
import type { Vec2 } from '@fs/recipe';
import { BUILDABLE_COLOR, PLOT_COLOR } from './colors';

/** Plot boundary and buildable area (setback lines) drawn just above the ground. */
export class OverlayLayer {
  readonly group = new THREE.Group();

  constructor(scene: THREE.Scene) {
    this.group.name = 'overlay';
    scene.add(this.group);
  }

  private loop(ring: Vec2[], color: string, dashed: boolean, y: number) {
    const pts = [...ring, ring[0]!].map((p) => new THREE.Vector3(p[0], y, -p[1]));
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = dashed
      ? new THREE.LineDashedMaterial({ color, dashSize: 1, gapSize: 0.6 })
      : new THREE.LineBasicMaterial({ color });
    const line = new THREE.Line(geom, mat);
    if (dashed) line.computeLineDistances();
    return line;
  }

  setPlot(plot: Vec2[], buildable: Vec2[] | null) {
    this.group.clear();
    if (plot.length < 3) return;
    const shape = new THREE.Shape(plot.map((p) => new THREE.Vector2(p[0], p[1])));
    const fill = new THREE.Mesh(
      new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#d9e7e3', transparent: true, opacity: 0.6, depthWrite: false }),
    );
    fill.position.y = 0.01;
    fill.receiveShadow = true;
    this.group.add(fill);
    this.group.add(this.loop(plot, PLOT_COLOR, false, 0.03));
    if (buildable && buildable.length >= 3) this.group.add(this.loop(buildable, BUILDABLE_COLOR, true, 0.04));
  }
}
