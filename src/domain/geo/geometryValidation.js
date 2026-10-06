const DEPTH_BY_TYPE = { Point: 0, LineString: 1, Polygon: 2, MultiPolygon: 3 };

function isPosition(value) {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 90
  );
}

function positionsAtDepth(coordinates, depth) {
  if (depth === 0) return isPosition(coordinates) ? [coordinates] : null;
  if (!Array.isArray(coordinates) || coordinates.length === 0) return null;
  const nested = coordinates.map((child) => positionsAtDepth(child, depth - 1));
  return nested.some((child) => child === null) ? null : nested.flat();
}

function geometryPositions(geometry) {
  const depth = DEPTH_BY_TYPE[geometry?.type];
  return depth === undefined ? null : positionsAtDepth(geometry.coordinates, depth);
}

function isInsideBbox([lng, lat], bbox) {
  return lng >= bbox.minLng && lng <= bbox.maxLng && lat >= bbox.minLat && lat <= bbox.maxLat;
}

/*
 * Structural checks done before PostGIS: supported type, finite WGS84 coordinates and every
 * vertex inside the Zaragoza bbox. Topological validity (ST_IsValid/ST_MakeValid) is checked
 * in the database.
 */
function validateGeometry(geometry, allowedTypes, bbox) {
  if (!geometry || !allowedTypes.includes(geometry.type)) return 'unsupported_geometry_type';
  const positions = geometryPositions(geometry);
  if (!positions) return 'malformed_coordinates';
  if (!positions.every((position) => isInsideBbox(position, bbox))) return 'outside_zaragoza_bbox';
  return null;
}

function toMultiPolygon(geometry) {
  return geometry.type === 'Polygon'
    ? { type: 'MultiPolygon', coordinates: [geometry.coordinates] }
    : geometry;
}

module.exports = { validateGeometry, isInsideBbox, toMultiPolygon };
