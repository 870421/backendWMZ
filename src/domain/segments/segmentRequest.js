const { isInsideBbox } = require('../geo/geometryValidation');
const { httpError } = require('../../utils/httpError');

const MAX_SEGMENT_ID = 2147483647; // street_segments.id is a 4-byte SERIAL
const MAX_SOURCE_ID_LENGTH = 100;
const URBAN_ELEMENT_TYPES = ['trees', 'buildings'];

function invalid(field, message) {
  return httpError(400, 'Parámetros no válidos.', { [field]: message });
}

function parseSegmentId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > MAX_SEGMENT_ID) {
    throw invalid('id', 'Debe ser un entero positivo.');
  }
  return Number(value);
}

// Query values arrive as strings (or arrays if the parameter is repeated).
function parseNumber(field, value, limit) {
  if (typeof value !== 'string' || value.trim() === '' || !Number.isFinite(Number(value))) {
    throw invalid(field, 'Debe ser un número.');
  }
  const number = Number(value);
  if (Math.abs(number) > limit) {
    throw invalid(field, `Debe estar entre -${limit} y ${limit}.`);
  }
  return number;
}

function parseCoordinates({ lat, lng }, serviceArea) {
  const point = { lat: parseNumber('lat', lat, 90), lng: parseNumber('lng', lng, 180) };
  if (!isInsideBbox([point.lng, point.lat], serviceArea)) {
    throw httpError(400, 'El punto debe estar dentro del municipio de Zaragoza.', {
      lat: 'Fuera de Zaragoza.',
      lng: 'Fuera de Zaragoza.'
    });
  }
  return point;
}

// Absent means both types; otherwise a comma-separated list of trees and/or buildings.
function parseTypes(value) {
  if (value === undefined) return [...URBAN_ELEMENT_TYPES];
  const requested = typeof value === 'string' ? value.split(',').map((type) => type.trim()) : [];
  if (requested.length === 0 || requested.some((type) => !URBAN_ELEMENT_TYPES.includes(type))) {
    throw invalid('types', `Debe ser una lista de: ${URBAN_ELEMENT_TYPES.join(', ')}.`);
  }
  return URBAN_ELEMENT_TYPES.filter((type) => requested.includes(type));
}

function parseSourceId(value) {
  const sourceId = typeof value === 'string' ? value.trim() : '';
  if (sourceId === '' || sourceId.length > MAX_SOURCE_ID_LENGTH) {
    throw invalid('sourceId', `Debe tener entre 1 y ${MAX_SOURCE_ID_LENGTH} caracteres.`);
  }
  return sourceId;
}

module.exports = {
  URBAN_ELEMENT_TYPES,
  parseSegmentId,
  parseCoordinates,
  parseTypes,
  parseSourceId
};
