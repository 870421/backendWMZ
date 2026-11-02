const { Router } = require('express');

const { getStatus } = require('../controllers/dataController');

const dataRouter = Router();

dataRouter.get('/status', getStatus);

module.exports = { dataRouter };
