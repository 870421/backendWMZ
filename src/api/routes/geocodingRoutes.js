const { Router } = require('express');

const { getAutocomplete, getReverse } = require('../controllers/geocodingController');

const geocodingRouter = Router();

geocodingRouter.get('/autocomplete', getAutocomplete);
geocodingRouter.get('/reverse', getReverse);

module.exports = { geocodingRouter };
