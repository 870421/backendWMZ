const { Router } = require('express');

const { getHealth } = require('../controllers/healthController');

const healthRouter = Router();

healthRouter.get('/', getHealth);

module.exports = { healthRouter };
