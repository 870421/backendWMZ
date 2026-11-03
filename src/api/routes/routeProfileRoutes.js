const { Router } = require('express');

const {
  createRouteProfile,
  deleteRouteProfile,
  listRouteProfiles,
  updateRouteProfile
} = require('../controllers/routeProfileController');

const routeProfileRouter = Router();

routeProfileRouter.get('/', listRouteProfiles);
routeProfileRouter.post('/', createRouteProfile);
routeProfileRouter.put('/:id', updateRouteProfile);
routeProfileRouter.delete('/:id', deleteRouteProfile);

module.exports = { routeProfileRouter };
