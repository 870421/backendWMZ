const { QueryTypes } = require('sequelize');

const { sequelize } = require('../config/database');

function select(sql, replacements) {
  return sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
}

// Latest import of each dataset. source_url and details are internal and are not returned.
function getLatestImportRuns() {
  return select(
    `SELECT DISTINCT ON (dataset) dataset, status, started_at AS "startedAt",
       finished_at AS "finishedAt", source_count AS "sourceCount",
       imported_count AS "importedCount", rejected_count AS "rejectedCount"
     FROM import_runs ORDER BY dataset, started_at DESC, id DESC`
  );
}

/*
 * Latest association run of each requested type ('tree', 'building'). A run in progress can be
 * skipped, as markStale does, so the previous finished run still tells if the data are stale.
 */
function getLatestAssociationRuns(types, { includeRunning = true } = {}) {
  return select(
    `SELECT DISTINCT ON (element_type) element_type AS "type", status, started_at AS "startedAt",
       finished_at AS "finishedAt", total, nearest_ok AS "nearestOk", isolated,
       pct_associated::float8 AS "pctAssociated"
     FROM association_runs
     WHERE element_type IN (:types) AND (:includeRunning OR status <> 'running')
     ORDER BY element_type, id DESC`,
    { types, includeRunning }
  );
}

module.exports = { getLatestImportRuns, getLatestAssociationRuns };
