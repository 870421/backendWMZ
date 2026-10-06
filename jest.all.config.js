const base = require('./jest.config');
const integration = require('./jest.integration.config');

module.exports = {
  ...base,
  testPathIgnorePatterns: ['/node_modules/'],
  globalSetup: integration.globalSetup,
  maxWorkers: 1
};
