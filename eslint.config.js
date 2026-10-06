const { FlatCompat } = require('@eslint/eslintrc');
const js = require('@eslint/js');
const prettier = require('eslint-config-prettier');
const globals = require('globals');

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended
});

module.exports = [
  { ignores: ['coverage/', '.jest-cache/', 'node_modules/'] },
  ...compat.extends('airbnb-base'),
  prettier,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node }
    },
    rules: {
      'no-underscore-dangle': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'import/no-extraneous-dependencies': [
        'error',
        { devDependencies: ['eslint.config.js', '.sequelizerc', 'src/tests/**', '**/*.test.js'] }
      ],
      'no-restricted-syntax': ['error', 'ForInStatement', 'LabeledStatement', 'WithStatement']
    }
  },
  {
    files: ['src/tests/**/*.js', '**/*.test.js'],
    languageOptions: { globals: { ...globals.jest } }
  },
  {
    files: ['src/repositories/migrations/**/*.js'],
    rules: { 'no-unused-vars': ['error', { args: 'none' }] }
  }
];
