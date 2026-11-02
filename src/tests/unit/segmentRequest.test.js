const { importConfig } = require('../../config/importConfig');
const {
  parseCoordinates,
  parseSegmentId,
  parseSourceId,
  parseTypes
} = require('../../domain/segments/segmentRequest');

const bbox = importConfig.zaragozaBbox;

function failure(callback) {
  try {
    callback();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the validation to fail');
}

describe('parseSegmentId', () => {
  it('accepts positive integers', () => {
    expect(parseSegmentId('1')).toBe(1);
    expect(parseSegmentId('2147483647')).toBe(2147483647);
  });

  it.each(['0', '-1', '01', '1.5', 'abc', '', '2147483648', undefined, ['1']])(
    'rejects %p',
    (value) => {
      const error = failure(() => parseSegmentId(value));
      expect(error.status).toBe(400);
      expect(error.fields).toHaveProperty('id');
    }
  );
});

describe('parseCoordinates', () => {
  it('returns numeric coordinates inside Zaragoza', () => {
    expect(parseCoordinates({ lat: '41.6488', lng: '-0.8891' }, bbox)).toEqual({
      lat: 41.6488,
      lng: -0.8891
    });
  });

  it.each([
    [{}, 'lat'],
    [{ lat: 'abc', lng: '-0.88' }, 'lat'],
    [{ lat: '', lng: '-0.88' }, 'lat'],
    [{ lat: ['41.6', '41.7'], lng: '-0.88' }, 'lat'],
    [{ lat: 'Infinity', lng: '-0.88' }, 'lat'],
    [{ lat: '95', lng: '-0.88' }, 'lat'],
    [{ lat: '41.6', lng: '181' }, 'lng'],
    [{ lat: '41.6', lng: 'x' }, 'lng']
  ])('rejects %j', (query, field) => {
    const error = failure(() => parseCoordinates(query, bbox));
    expect(error.status).toBe(400);
    expect(error.fields).toHaveProperty(field);
  });

  it('rejects valid coordinates outside the bounding box of Zaragoza', () => {
    const error = failure(() => parseCoordinates({ lat: '40.4', lng: '-3.7' }, bbox));
    expect(error.status).toBe(400);
    expect(error.message).toMatch(/Zaragoza/);
  });
});

describe('parseTypes', () => {
  it('defaults to both types', () => {
    expect(parseTypes(undefined)).toEqual(['trees', 'buildings']);
  });

  it('accepts one or both types, without duplicates and in a fixed order', () => {
    expect(parseTypes('buildings')).toEqual(['buildings']);
    expect(parseTypes('buildings, trees,trees')).toEqual(['trees', 'buildings']);
  });

  it.each(['', 'cars', 'trees,cars', 'trees,', ['trees']])('rejects %p', (value) => {
    const error = failure(() => parseTypes(value));
    expect(error.status).toBe(400);
    expect(error.fields).toHaveProperty('types');
  });
});

describe('parseSourceId', () => {
  it('trims the source id', () => {
    expect(parseSourceId(' 399096155:2 ')).toBe('399096155:2');
  });

  it.each(['', '   ', 'x'.repeat(101), undefined])('rejects %p', (value) => {
    const error = failure(() => parseSourceId(value));
    expect(error.status).toBe(400);
    expect(error.fields).toHaveProperty('sourceId');
  });
});
