import * as THREE from 'three';
import type { Vec2 } from '@fs/recipe';
import { BUILDABLE_COLOR } from './colors';

/** Plot boundary, buildable area and setback band drawn just above the ground. */
export class OverlayLayer {
  readonly group = new THREE.Group();

  constructor(scene: THREE.Scene) {
    this.group.name = 'overlay';
    scene.add(this.group);
  }

  private shape(ring: Vec2[]) {
    return new THREE.Shape(ring.map((p) => new THREE.Vector2(p[0], p[1])));
  }

  private loop(ring: Vec2[], color: string, dashed: boolean, y: number, width = 1) {
    const pts = [...ring, ring[0]!].map((p) => new THREE.Vector3(p[0], y, -p[1]));
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 1.2, gapSize: 0.7, linewidth: width }) : new THREE.LineBasicMaterial({ color, linewidth: width });
    const line = new THREE.Line(geom, mat);
    if (dashed) line.computeLineDistances();
    line.raycast = () => undefined;
    return line;
  }

  setPlot(plot: Vec2[], buildable: Vec2[] | null) {
    this.group.clear();
    if (plot.length < 3) return;
    // Plot surface (slightly transparent so map imagery shows through) and setback band.
    const plotShape = this.shape(plot);
    if (buildable && buildable.length >= 3) plotShape.holes.push(new THREE.Path(buildable.map((p) => new THREE.Vector2(p[0], p[1]))));
    const band = new THREE.Mesh(
      new THREE.ShapeGeometry(plotShape).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#f59e0b', transparent: true, opacity: 0.16, depthWrite: false }),
    );
    band.position.y = 0.02;
    band.raycast = () => undefined;
    this.group.add(band);
    if (buildable && buildable.length >= 3) {
      const inner = new THREE.Mesh(
        new THREE.ShapeGeometry(this.shape(buildable)).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: '#14b8a6', transparent: true, opacity: 0.12, depthWrite: false }),
      );
      inner.position.y = 0.025;
      inner.raycast = () => undefined;
      this.group.add(inner, this.loop(buildable, BUILDABLE_COLOR, true, 0.05));
    }
    this.group.add(this.loop(plot, '#dc2626', false, 0.06, 2));
  }
}
