const { Router } = require('express');

const { getCurrentWeather } = require('../controllers/weatherController');

const weatherRouter = Router();

weatherRouter.get('/current', getCurrentWeather);

module.exports = { weatherRouter };
