const { Router } = require('express');

const { geocodingRouter } = require('./geocodingRoutes');
const { healthRouter } = require('./healthRoutes');
const { routeRouter } = require('./routeRoutes');

const apiRouter = Router();

apiRouter.use('/geocoding', geocodingRouter);
apiRouter.use('/health', healthRouter);
apiRouter.use('/routes', routeRouter);

module.exports = { apiRouter };
