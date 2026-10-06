import eslintConfigPrettier from 'eslint-config-prettier/flat';
import airbnb from 'eslint-stylistic-airbnb';

const projectFiles = ['src/**/*.js', 'jest.config.js'];

const nodeGlobals = {
  AbortController: 'readonly',
  AbortSignal: 'readonly',
  URL: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  module: 'readonly',
  process: 'readonly',
  require: 'readonly',
  setTimeout: 'readonly',
};

const jestGlobals = {
  afterEach: 'readonly',
  beforeEach: 'readonly',
  describe: 'readonly',
  expect: 'readonly',
  it: 'readonly',
  jest: 'readonly',
  test: 'readonly',
};

export default [
  {
    ignores: ['coverage/**', 'node_modules/**'],
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },
  {
    ...airbnb.configs['flat/recommended'],
    files: projectFiles,
    languageOptions: {
      ecmaVersion: 'latest',
      globals: nodeGlobals,
      sourceType: 'commonjs',
    },
    rules: {
      ...airbnb.configs['flat/recommended'].rules,
      'no-console': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/tests/**/*.test.js'],
    languageOptions: {
      globals: jestGlobals,
    },
    rules: {
      'no-underscore-dangle': 'off',
    },
  },
  eslintConfigPrettier,
];
