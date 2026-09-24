const { searchPlaces } = require('../../services/geo/geocodingService');

async function getAutocomplete(req, res, next) {
  try {
    const results = await searchPlaces(req.query);

    res.json({ results });
  } catch (error) {
    next(error);
  }
}

module.exports = { getAutocomplete };
