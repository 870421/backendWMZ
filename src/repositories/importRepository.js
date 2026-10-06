const { ImportRejection, ImportRun } = require('./models');

async function createRun({ dataset, sourceUrl }) {
  const run = await ImportRun.create({ dataset, sourceUrl });
  return run.id;
}

async function finishRun(runId, { sourceCount, importedCount, rejectedCount, status, details }) {
  await ImportRun.update(
    { sourceCount, importedCount, rejectedCount, status, details, finishedAt: new Date() },
    { where: { id: runId } }
  );
}

async function insertRejections(runId, dataset, rejections) {
  if (rejections.length === 0) return;
  await ImportRejection.bulkCreate(
    rejections.map(({ sourceId, reason, raw }) => ({
      importRunId: runId,
      dataset,
      sourceId: sourceId === null || sourceId === undefined ? null : String(sourceId),
      reason,
      raw: raw ?? null
    }))
  );
}

module.exports = { createRun, finishRun, insertRejections };
