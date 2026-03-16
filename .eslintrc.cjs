module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2020, sourceType: 'module' },

  env: {
    browser: true,
    node: true,
    es2021: true,
  },

  globals: {
    IntersectionObserver: 'readonly',
    document: 'readonly',
    window: 'readonly',
  },

  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],

  plugins: ['react', '@typescript-eslint'],

  settings: {
    react: { version: 'detect' },
  },

  rules: {},
};