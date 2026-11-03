const { Router } = require('express');

const {
  postFastestRoute,
  postShadedRoute,
  postWeightedRoute
} = require('../controllers/routeController');

const routeRouter = Router();

routeRouter.post('/fastest', postFastestRoute);
routeRouter.post('/shaded', postShadedRoute);
routeRouter.post('/weighted', postWeightedRoute);

module.exports = { routeRouter };
