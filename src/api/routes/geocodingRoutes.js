const { Router } = require('express');

const { getAutocomplete } = require('../controllers/geocodingController');

const geocodingRouter = Router();

geocodingRouter.get('/autocomplete', getAutocomplete);

module.exports = { geocodingRouter };

