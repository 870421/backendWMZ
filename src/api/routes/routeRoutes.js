const { Router } = require('express');

const { postFastestRoute } = require('../controllers/routeController');

const routeRouter = Router();

routeRouter.post('/fastest', postFastestRoute);

module.exports = { routeRouter };
