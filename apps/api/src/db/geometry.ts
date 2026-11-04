import { customType } from 'drizzle-orm/pg-core';
import type { GeoJsonPolygon } from '@fs/api-contract';

/** Polygon ↔ EWKT for writing; hex EWKB → GeoJSON for reading. SRID 4326. */
export function polygonToEwkt(p: GeoJsonPolygon): string {
  const rings = p.coordinates.map((ring) => {
    const pts = ring.map((c) => `${c[0]} ${c[1]}`);
    const f = ring[0]!;
    const l = ring[ring.length - 1]!;
    if (f[0] !== l[0] || f[1] !== l[1]) pts.push(`${f[0]} ${f[1]}`);
    return `(${pts.join(',')})`;
  });
  return `SRID=4326;POLYGON(${rings.join(',')})`;
}

export function ewkbHexToPolygon(hex: string): GeoJsonPolygon {
  const buf = Buffer.from(hex, 'hex');
  let o = 0;
  const le = buf.readUInt8(o) === 1;
  o += 1;
  const u32 = () => {
    const v = le ? buf.readUInt32LE(o) : buf.readUInt32BE(o);
    o += 4;
    return v;
  };
  const f64 = () => {
    const v = le ? buf.readDoubleLE(o) : buf.readDoubleBE(o);
    o += 8;
    return v;
  };
  let type = u32();
  const hasZ = (type & 0x80000000) !== 0;
  if (type & 0x20000000) u32(); // SRID
  type &= 0xffff;
  if (type !== 3) throw new Error(`Expected Polygon WKB, got type ${type}`);
  const nRings = u32();
  const coordinates: [number, number][][] = [];
  for (let r = 0; r < nRings; r++) {
    const n = u32();
    const ring: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const x = f64();
      const y = f64();
      if (hasZ) f64();
      ring.push([x, y]);
    }
    coordinates.push(ring);
  }
  return { type: 'Polygon', coordinates };
}

export const polygon4326 = customType<{ data: GeoJsonPolygon; driverData: string }>({
  dataType() {
    return 'geometry(Polygon,4326)';
  },
  toDriver(value) {
    return polygonToEwkt(value);
  },
  fromDriver(value) {
    return ewkbHexToPolygon(value);
  },
});
