// eslint.config.js
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  // ───────────────────────────────────────────────────────────────────────────
  // GLOBAL IGNORES
  // ───────────────────────────────────────────────────────────────────────────
  globalIgnores(['dist', 'build', 'coverage', 'node_modules', 'archive', 'src/_archive_ai_source']),

  // ───────────────────────────────────────────────────────────────────────────
  // BASE JS (for JS files only)
  // ───────────────────────────────────────────────────────────────────────────
  js.configs.recommended,

  // ───────────────────────────────────────────────────────────────────────────
  // APP TS/TSX (TYPE-AWARE) — IMPORTANT: scoped to src/**/*.ts(x)
  // ───────────────────────────────────────────────────────────────────────────
  ...tseslint.configs.recommendedTypeChecked.map((cfg) => ({
    ...cfg,
    files: ['src/**/*.{ts,tsx}'],
  })),

  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.browser,

      // ✅ This is what enables typed linting in flat config
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },

    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },

    settings: { react: { version: 'detect' } },

    rules: {
      ...reactHooks.configs.recommended.rules,
      ...reactRefresh.configs.vite.rules,

      'react/no-array-index-key': 'warn',
      'react/react-in-jsx-scope': 'off',

      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  {
    files: ['supabase/functions/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parser: js.configs.recommended.languageOptions.parser,
      globals: { ...globals.browser, Deno: 'readonly' },
    },
    rules: {
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  // ───────────────────────────────────────────────────────────────────────────
  // SUPABASE EDGE FUNCTIONS (NOT type-aware)
  // ───────────────────────────────────────────────────────────────────────────
  {
    files: ['supabase/functions/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        Deno: 'readonly',
      },
    },
    rules: {
      // no React refresh in edge functions
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
]);
