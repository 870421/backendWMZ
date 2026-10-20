function validateSolarAngles({ azimuthDegrees, elevationDegrees }) {
  if (!Number.isFinite(azimuthDegrees) || azimuthDegrees < 0 || azimuthDegrees >= 360) {
    throw new TypeError('azimuthDegrees must be between 0 (inclusive) and 360 (exclusive)');
  }
  if (!Number.isFinite(elevationDegrees) || elevationDegrees < -90 || elevationDegrees > 90) {
    throw new TypeError('elevationDegrees must be between -90 and 90');
  }
}

/**
 * Returns the horizontal shadow vector in projected metres. X points east and Y points north.
 * The shadow points in the direction opposite to the solar azimuth.
 */
function shadowVectorForHeight({ azimuthDegrees, elevationDegrees, heightM }) {
  validateSolarAngles({ azimuthDegrees, elevationDegrees });
  if (!Number.isFinite(heightM) || heightM <= 0) {
    throw new TypeError('heightM must be a finite number greater than 0');
  }
  if (elevationDegrees <= 0) return null;

  const radians = Math.PI / 180;
  const azimuth = azimuthDegrees * radians;
  const lengthM = heightM / Math.tan(elevationDegrees * radians);

  return {
    lengthM,
    eastM: -lengthM * Math.sin(azimuth),
    northM: -lengthM * Math.cos(azimuth)
  };
}

function shadowFactors(solarPosition) {
  const unitHeightVector = shadowVectorForHeight({ ...solarPosition, heightM: 1 });
  if (!unitHeightVector) return null;
  return {
    lengthPerHeight: unitHeightVector.lengthM,
    eastPerHeight: unitHeightVector.eastM,
    northPerHeight: unitHeightVector.northM
  };
}

function validateSegmentIds(segmentIds) {
  if (!Array.isArray(segmentIds) || segmentIds.length === 0) {
    throw new TypeError('segmentIds must be a non-empty array');
  }
  const unique = [...new Set(segmentIds)];
  if (!unique.every((id) => Number.isInteger(id) && id > 0 && id <= 2147483647)) {
    throw new TypeError('segmentIds must contain positive integer database identifiers');
  }
  return unique;
}

module.exports = {
  shadowFactors,
  shadowVectorForHeight,
  validateSegmentIds,
  validateSolarAngles
};
