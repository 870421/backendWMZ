const { parseProfileInput } = require('../../domain/routes/routeWeights');
const defaultRepository = require('../../repositories/routeProfileRepository');
const { httpError } = require('../../utils/httpError');

// Enough for a few routes of one's own; it keeps a single account from filling the table.
const MAX_PROFILES_PER_USER = 20;
const NOT_FOUND = 'No existe esa ruta.';

function parseProfileId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0 || id > 2147483647) throw httpError(404, NOT_FOUND);
  return id;
}

function createRouteProfileService(repository = defaultRepository) {
  return {
    list: (userId) => repository.listForUser(userId),

    async create(userId, input) {
      const profile = parseProfileInput(input);
      if ((await repository.countForUser(userId)) >= MAX_PROFILES_PER_USER) {
        throw httpError(409, `Puedes guardar como máximo ${MAX_PROFILES_PER_USER} rutas.`);
      }
      return repository.createForUser(userId, profile);
    },

    async update(userId, id, input) {
      const updated = await repository.updateForUser(
        userId,
        parseProfileId(id),
        parseProfileInput(input)
      );
      if (!updated) throw httpError(404, NOT_FOUND);
      return updated;
    },

    async remove(userId, id) {
      if (!(await repository.deleteForUser(userId, parseProfileId(id)))) {
        throw httpError(404, NOT_FOUND);
      }
    }
  };
}

module.exports = {
  MAX_PROFILES_PER_USER,
  createRouteProfileService,
  routeProfileService: createRouteProfileService()
};
