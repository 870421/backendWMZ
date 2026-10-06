function positiveNumberOrNull(value) {
  const number = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
  return typeof number === 'number' && Number.isFinite(number) && number > 0 ? number : null;
}

function implausibilityReason(heightM, floors, config) {
  if (heightM < config.minPlausibleM) return 'height_below_min';
  if (heightM > config.maxPlausibleM) return 'height_above_max';
  if (floors) {
    const perFloor = heightM / floors;
    if (perFloor < config.minPerFloorM || perFloor > config.maxPerFloorM) {
      return 'height_per_floor_out_of_range';
    }
  }
  return null;
}

/*
 * Best available height, in this order (see docs/DECISIONS.md):
 * 1. measured height, if plausible on its own and relative to the floor count;
 * 2. floors × floorHeightM + groundFloorExtraM;
 * 3. a configurable default, flagged as 'default'.
 * fallbackReason explains why a better source was not used; it is logged, not rejected.
 */
function estimateBuildingHeight({ measuredHeightM, storeys }, config) {
  const floors = Number.isInteger(storeys) && storeys > 0 ? storeys : null;
  const measured = positiveNumberOrNull(measuredHeightM);
  const issue =
    measured === null ? 'missing_measured_height' : implausibilityReason(measured, floors, config);

  if (!issue) return { heightM: measured, heightSource: 'measured', floors, fallbackReason: null };
  if (floors) {
    return {
      heightM: floors * config.floorHeightM + config.groundFloorExtraM,
      heightSource: 'floors_estimate',
      floors,
      fallbackReason: issue
    };
  }
  return {
    heightM: config.defaultHeightM,
    heightSource: 'default',
    floors: null,
    fallbackReason: measured === null ? 'missing_height_and_storeys' : `${issue}_without_storeys`
  };
}

module.exports = { estimateBuildingHeight, positiveNumberOrNull };
