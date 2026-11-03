const { routeProfileService } = require('../../services/routing/routeProfileService');

async function listRouteProfiles(req, res, next) {
  try {
    res.status(200).json({ profiles: await routeProfileService.list(req.userId) });
  } catch (error) {
    next(error);
  }
}

async function createRouteProfile(req, res, next) {
  try {
    res.status(201).json({ profile: await routeProfileService.create(req.userId, req.body) });
  } catch (error) {
    next(error);
  }
}

async function updateRouteProfile(req, res, next) {
  try {
    const profile = await routeProfileService.update(req.userId, req.params.id, req.body);
    res.status(200).json({ profile });
  } catch (error) {
    next(error);
  }
}

async function deleteRouteProfile(req, res, next) {
  try {
    await routeProfileService.remove(req.userId, req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

module.exports = { createRouteProfile, deleteRouteProfile, listRouteProfiles, updateRouteProfile };
