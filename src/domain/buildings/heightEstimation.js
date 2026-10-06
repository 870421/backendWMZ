function positiveNumberOrNull(value) {
  const number = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
  return typeof number === 'number' && Number.isFinite(number) && number > 0 ? number : null;
}

function isMultiStorey(floors) {
  return floors !== null && floors >= 2;
}

// Returns why a measured height is clearly wrong, or null if it is accepted. Limits are inclusive.
function errorReason(heightM, floors, config) {
  if (heightM < config.minHeightM) return 'height_below_min';
  if (heightM > config.maxHeightM) return 'height_above_max';
  if (!isMultiStorey(floors)) {
    return heightM > config.maxSingleStoreyHeightM ? 'single_storey_height_above_max' : null;
  }
  const perFloor = heightM / floors;
  if (perFloor < config.minHeightPerFloorM) return 'height_per_floor_below_min';
  if (perFloor > config.maxHeightPerFloorM) return 'height_per_floor_above_max';
  return null;
}

function isSuspicious(heightM, floors, config) {
  if (!isMultiStorey(floors)) return heightM > config.suspiciousSingleStoreyHeightM;
  return heightM / floors > config.suspiciousHeightPerFloorM;
}

/*
 * Chooses the height used for shadows. The measured height (IDEZAR, Catastro-derived) is the
 * primary source and is only replaced when it is clearly wrong (default limits in importConfig:
 * outside [2, 150] m, outside [2, 8] m per storey with 2+ storeys, above 40 m with one storey).
 * Single-storey buildings get a wide range because warehouses, churches and sports halls are
 * genuinely tall with one storey; the first rule cut their heights and shortened their shadows.
 * Replacement: storeys × floor height + ground-floor extra ('floors_estimate'); without storeys,
 * a configured default ('default').
 * Accepted but atypical heights are only flagged (heightSuspicious), never corrected, so they can
 * be reviewed later without changing the calculation. See ADR-001 in docs/DECISIONS.md.
 */
function estimateBuildingHeight({ measuredHeightM, storeys }, config) {
  const floors = Number.isInteger(storeys) && storeys > 0 ? storeys : null;
  const measured = positiveNumberOrNull(measuredHeightM);
  const reason =
    measured === null ? 'missing_measured_height' : errorReason(measured, floors, config);

  if (!reason) {
    return {
      heightM: measured,
      heightSource: 'measured',
      heightSuspicious: isSuspicious(measured, floors, config),
      floors,
      fallbackReason: null
    };
  }
  if (floors) {
    return {
      heightM: floors * config.floorHeightM + config.groundFloorExtraM,
      heightSource: 'floors_estimate',
      heightSuspicious: false,
      floors,
      fallbackReason: reason
    };
  }
  return {
    heightM: config.defaultHeightM,
    heightSource: 'default',
    heightSuspicious: false,
    floors: null,
    fallbackReason: measured === null ? 'missing_height_and_storeys' : `${reason}_without_storeys`
  };
}

module.exports = { estimateBuildingHeight, positiveNumberOrNull };
