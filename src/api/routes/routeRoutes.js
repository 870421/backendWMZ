const { Router } = require('express');

const { postFastestRoute, postShadedRoute } = require('../controllers/routeController');

const routeRouter = Router();

routeRouter.post('/fastest', postFastestRoute);
routeRouter.post('/shaded', postShadedRoute);

module.exports = { routeRouter };
