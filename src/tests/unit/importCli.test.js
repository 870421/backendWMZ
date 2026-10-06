jest.mock('../../config/database', () => ({ sequelize: { close: jest.fn() } }));

const { sequelize } = require('../../config/database');
const { runImportsCli } = require('../../integrations/cli');

const summary = (status) => ({
  runId: 1,
  dataset: 'trees',
  status,
  sourceCount: 2,
  imported: 2,
  rejected: 0,
  details: {}
});

describe('runImportsCli', () => {
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('exits with 0 when every import succeeds', async () => {
    await runImportsCli([async () => summary('success'), async () => summary('success')]);

    expect(process.exitCode).toBe(0);
    expect(sequelize.close).toHaveBeenCalled();
  });

  it('exits with 1 on a mismatch', async () => {
    await runImportsCli([async () => summary('mismatch')]);

    expect(process.exitCode).toBe(1);
  });

  it('keeps running later imports after a failure and exits with 1', async () => {
    const later = jest.fn().mockResolvedValue(summary('success'));

    await runImportsCli([
      async () => {
        throw new Error('source down');
      },
      later
    ]);

    expect(later).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
