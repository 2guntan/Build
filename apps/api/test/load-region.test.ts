import { describe, expect, it } from 'vitest';
import { fromGeoJson, heightFromTags } from '../src/site/load-region.js';

describe('regional extract loader', () => {
  it('labels heights as measured, estimated or default', () => {
    expect(heightFromTags({ height: '12.5' })).toEqual({ heightM: 12.5, heightSource: 'measured' });
    expect(heightFromTags({ 'building:levels': '4' })).toEqual({ heightM: 12, heightSource: 'estimated' });
    expect(heightFromTags({})).toEqual({ heightM: null, heightSource: 'default' });
  });
  it('reads Open Buildings-style GeoJSON with confidence and height estimates', () => {
    const rows = fromGeoJson({ features: [{ properties: { confidence: 0.82, height: 7.4, full_plus_code: '7CVXPH8M+2X' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } }] });
    expect(rows[0]).toMatchObject({ sourceId: '7CVXPH8M+2X', heightM: 7.4, heightSource: 'estimated', confidence: 0.82 });
  });
});
