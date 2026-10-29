const { numberFromEnv } = require('./importConfig');

// Limits of the on-demand shadow calculation; both values are explained in ADR-015
// (workspace docs/DECISIONS.md).
const shadowConfig = {
  // Below this solar elevation shadows are not projected: their length (height / tan(elevation))
  // grows without bound and the query ends up processing most of the city.
  minSunElevationDeg: numberFromEnv('SHADOW_MIN_SUN_ELEVATION_DEG', 10),
  // PostgreSQL statement_timeout for the shadow query, so one request cannot block the server.
  queryTimeoutMs: numberFromEnv('SHADOW_QUERY_TIMEOUT_MS', 20000)
};

module.exports = { shadowConfig };
