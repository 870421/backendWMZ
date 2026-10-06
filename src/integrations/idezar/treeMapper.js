const { positiveNumberOrNull } = require('../../domain/buildings/heightEstimation');
const { validateGeometry } = require('../../domain/geo/geometryValidation');

function mapTreeFeature(feature, { bbox }) {
  const properties = feature?.properties || {};
  const rawId = properties.ID;
  const sourceId = rawId === undefined || rawId === null ? '' : String(rawId).trim();
  if (!sourceId) return { sourceId: feature?.id ?? null, rejection: 'missing_identifier' };

  const geometryIssue = validateGeometry(feature.geometry, ['Point'], bbox);
  if (geometryIssue) return { sourceId, rejection: geometryIssue };

  const species = typeof properties.ESPECIE === 'string' ? properties.ESPECIE.trim() : '';
  const heightM = positiveNumberOrNull(properties.ALTTOTAL);
  // Crown diameter stays null when missing; estimating it is deferred to PBI-5.2.
  const crownDiameterM = positiveNumberOrNull(properties.DIAMCOPA);
  return {
    sourceId,
    records: [
      {
        itemId: sourceId,
        sourceId,
        species: species || null,
        heightM,
        crownDiameterM,
        geometry: { type: 'Point', coordinates: feature.geometry.coordinates.slice(0, 2) }
      }
    ],
    stats: {
      ...(heightM === null && { missing_height: 1 }),
      ...(crownDiameterM === null && { missing_crown_diameter: 1 }),
      ...(!species && { missing_species: 1 })
    },
    warnings: []
  };
}

module.exports = { mapTreeFeature };
