const { estimateBuildingHeight } = require('../../domain/buildings/heightEstimation');
const { toMultiPolygon, validateGeometry } = require('../../domain/geo/geometryValidation');

function mapBuildingFeature(feature, { bbox, heightConfig }) {
  const properties = feature?.properties || {};
  const sourceId = typeof properties.identifier === 'string' ? properties.identifier.trim() : '';
  if (!sourceId) return { sourceId: feature?.id ?? null, rejection: 'missing_identifier' };

  const geometryIssue = validateGeometry(feature.geometry, ['Polygon', 'MultiPolygon'], bbox);
  if (geometryIssue) return { sourceId, rejection: geometryIssue };

  const height = estimateBuildingHeight(
    { measuredHeightM: properties.measured_height, storeys: properties.storeys_above_ground },
    heightConfig
  );
  const warnings = height.fallbackReason
    ? [
        `height ${height.heightSource} (${height.fallbackReason}): measured_height=${properties.measured_height} storeys=${properties.storeys_above_ground}`
      ]
    : [];
  return {
    sourceId,
    records: [
      {
        itemId: sourceId,
        sourceId,
        heightM: height.heightM,
        heightSource: height.heightSource,
        floors: height.floors,
        geometry: toMultiPolygon(feature.geometry)
      }
    ],
    stats: {
      [`height_source:${height.heightSource}`]: 1,
      ...(height.fallbackReason && { [`height_fallback:${height.fallbackReason}`]: 1 })
    },
    warnings
  };
}

module.exports = { mapBuildingFeature };
