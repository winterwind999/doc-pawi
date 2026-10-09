// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'android/*', 'ios/*', '.expo/*', 'coverage/*'],
  },
  {
    files: ['*.config.js', 'plugins/**/*.js', 'jest.setup.js', 'test/**/*.js'],
    languageOptions: { globals: globals.node },
  },
]);
