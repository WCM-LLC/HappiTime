// https://docs.expo.dev/guides/using-eslint/
const path = require('path');
const { FlatCompat } = require('@eslint/eslintrc');

const compat = new FlatCompat({
  baseDirectory: __dirname,
  resolvePluginsRelativeTo: path.join(
    __dirname,
    'node_modules',
    'eslint-config-expo'
  ),
});

module.exports = [
  ...compat.extends('expo'),
  {
    ignores: ['dist/*', 'components/**', 'eslint.config.js'],
  },
  {
    settings: {
      'import/resolver': {
        typescript: {
          project: './tsconfig.json',
        },
      },
    },
  },
];
