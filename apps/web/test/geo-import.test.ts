import { describe, expect, it } from 'vitest';
import { parsePlotFile, ImportError } from '../src/lib/geo-import';

describe('plot file import', () => {
  it('reads a GeoJSON FeatureCollection', () => {
    const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[-17.46, 14.71], [-17.459, 14.71], [-17.459, 14.711], [-17.46, 14.71]]] } }] };
    expect(parsePlotFile('p.geojson', JSON.stringify(fc))).toHaveLength(3);
  });
  it('reads a KML polygon', () => {
    const kml = '<?xml version="1.0"?><kml><Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>-17.46,14.71,0 -17.459,14.71,0 -17.459,14.711,0 -17.46,14.71,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></kml>';
    expect(parsePlotFile('p.kml', kml)).toEqual([[-17.46, 14.71], [-17.459, 14.71], [-17.459, 14.711]]);
  });
  it('rejects bad input', () => {
    expect(() => parsePlotFile('x.json', '{')).toThrow(ImportError);
    expect(() => parsePlotFile('x.json', JSON.stringify({ type: 'Point', coordinates: [0, 0] }))).toThrow(/No polygon/);
    expect(() => parsePlotFile('x.json', JSON.stringify({ type: 'Polygon', coordinates: [[[500, 0], [1, 1], [2, 2]]] }))).toThrow(/WGS84/);
  });
});
