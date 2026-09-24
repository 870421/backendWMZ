const { autocompletePlaces } = require('../../integrations/openRouteService/geocodingClient');

async function searchPlaces({ text = '', limit = '5' }) {
  if (typeof text !== 'string' || text.trim().length > 200 ||
      typeof limit !== 'string' || !/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 10) {
    const error = new Error('Search text must be at most 200 characters and limit an integer from 1 to 10.');
    error.status = 400;
    throw error;
  }
  if (text.trim().length < 3) return [];
  return autocompletePlaces({ text: text.trim(), limit: Number(limit) });
}

module.exports = { searchPlaces };
