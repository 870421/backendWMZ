const {
  isInsideBbox,
  toMultiPolygon,
  validateGeometry
} = require('../../domain/geo/geometryValidation');

const bbox = { minLng: -1.2, minLat: 41.4, maxLng: -0.6, maxLat: 41.9 };
const square = [
  [
    [-0.9, 41.6],
    [-0.89, 41.6],
    [-0.89, 41.61],
    [-0.9, 41.6]
  ]
];

describe('validateGeometry', () => {
  it('accepts a polygon inside the bbox', () => {
    expect(
      validateGeometry({ type: 'Polygon', coordinates: square }, ['Polygon'], bbox)
    ).toBeNull();
  });

  it('accepts points and multipolygons', () => {
    expect(
      validateGeometry({ type: 'Point', coordinates: [-0.88, 41.65] }, ['Point'], bbox)
    ).toBeNull();
    expect(
      validateGeometry({ type: 'MultiPolygon', coordinates: [square] }, ['MultiPolygon'], bbox)
    ).toBeNull();
  });

  it.each([
    [null, 'unsupported_geometry_type'],
    [{ type: 'LineString', coordinates: [] }, 'unsupported_geometry_type'],
    [{ type: 'Polygon', coordinates: [] }, 'malformed_coordinates'],
    [{ type: 'Polygon', coordinates: [[[-0.9, 'x']]] }, 'malformed_coordinates'],
    [{ type: 'Polygon', coordinates: [[[-0.9, 95]]] }, 'malformed_coordinates'],
    [{ type: 'Polygon', coordinates: [[[2.0, 41.6]]] }, 'outside_zaragoza_bbox']
  ])('rejects %j with %s', (geometry, reason) => {
    expect(validateGeometry(geometry, ['Polygon'], bbox)).toBe(reason);
  });
});

describe('isInsideBbox', () => {
  it('includes the bbox edges', () => {
    expect(isInsideBbox([-1.2, 41.4], bbox)).toBe(true);
    expect(isInsideBbox([-1.21, 41.4], bbox)).toBe(false);
  });
});

describe('toMultiPolygon', () => {
  it('wraps polygons and leaves multipolygons unchanged', () => {
    expect(toMultiPolygon({ type: 'Polygon', coordinates: square })).toEqual({
      type: 'MultiPolygon',
      coordinates: [square]
    });
    const multi = { type: 'MultiPolygon', coordinates: [square] };
    expect(toMultiPolygon(multi)).toBe(multi);
  });
});
