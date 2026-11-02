const { getZaragozaWeather } = require('../../services/weather/weatherService');

async function getCurrentWeather(_req, res, next) {
  try {
    const weather = await getZaragozaWeather();
    res.json({ weather });
  } catch (error) {
    next(error);
  }
}

module.exports = { getCurrentWeather };
