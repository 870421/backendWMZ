const base = require('./jest.config');

module.exports = {
  testEnvironment: 'node',
  cacheDirectory: '<rootDir>/.jest-cache',
  testMatch: ['<rootDir>/src/tests/integration/**/*.test.js'],
  globalSetup: '<rootDir>/src/tests/integration/globalSetup.js',
  maxWorkers: 1,
  collectCoverageFrom: base.collectCoverageFrom
};
