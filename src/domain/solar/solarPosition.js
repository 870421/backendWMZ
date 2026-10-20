const { DateTime, IANAZone } = require('luxon');
const SunCalc = require('suncalc');

const ZARAGOZA_TIME_ZONE = 'Europe/Madrid';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}(?::\d{2})?$/;

function validateCoordinates(latitude, longitude) {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new TypeError('latitude must be a finite number between -90 and 90');
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new TypeError('longitude must be a finite number between -180 and 180');
  }
}

function parseLocalDateTime(date, time, timeZone) {
  if (typeof date !== 'string' || !DATE_PATTERN.test(date)) {
    throw new TypeError('date must use YYYY-MM-DD');
  }
  if (typeof time !== 'string' || !TIME_PATTERN.test(time)) {
    throw new TypeError('time must use HH:mm or HH:mm:ss');
  }
  if (typeof timeZone !== 'string' || !IANAZone.isValidZone(timeZone)) {
    throw new TypeError('timeZone must be a valid IANA time zone');
  }

  const format = time.length === 5 ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd HH:mm:ss';
  const input = `${date} ${time}`;
  const local = DateTime.fromFormat(input, format, {
    zone: timeZone,
    setZone: true,
    locale: 'en',
    numberingSystem: 'latn'
  });

  // Luxon moves nonexistent DST times forwards. The round trip makes that an explicit error.
  if (!local.isValid || local.toFormat(format) !== input) {
    throw new RangeError('date and time must identify a valid local time');
  }
  if (local.getPossibleOffsets().length > 1) {
    throw new RangeError('date and time are ambiguous because of a daylight-saving transition');
  }
  return local;
}

/**
 * Calculates apparent solar position. Azimuth is clockwise from geographic north and elevation
 * is degrees above the horizon. The input date and time are civil time in the supplied IANA zone.
 */
function calculateSolarPosition({
  date,
  time,
  latitude,
  longitude,
  timeZone = ZARAGOZA_TIME_ZONE
}) {
  validateCoordinates(latitude, longitude);
  const localDateTime = parseLocalDateTime(date, time, timeZone);
  const position = SunCalc.getPosition(localDateTime.toJSDate(), latitude, longitude);

  return {
    azimuthDegrees: position.azimuth,
    elevationDegrees: position.altitude,
    aboveHorizon: position.altitude > 0,
    instant: localDateTime.toUTC().toISO({ suppressMilliseconds: true }),
    localDateTime: localDateTime.toISO({ suppressMilliseconds: true }),
    timeZone,
    latitude,
    longitude
  };
}

module.exports = {
  ZARAGOZA_TIME_ZONE,
  calculateSolarPosition,
  parseLocalDateTime,
  validateCoordinates
};
