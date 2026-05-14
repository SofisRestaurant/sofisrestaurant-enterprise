// eslint.config.js
import js from '@eslint/js';
import globals from 'globals';
import eslintReact from '@eslint-react/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

// ── Type-aware rules — require a TypeScript program to run ───────────────────
// Must be 'off' for any block without parserOptions.projectService.
const TYPE_AWARE_RULES_OFF = {
  '@typescript-eslint/await-thenable': 'off',
  '@typescript-eslint/no-floating-promises': 'off',
  '@typescript-eslint/no-misused-promises': 'off',
  '@typescript-eslint/no-base-to-string': 'off',
  '@typescript-eslint/no-redundant-type-constituents': 'off',
  '@typescript-eslint/no-unnecessary-type-assertion': 'off',
  '@typescript-eslint/no-unsafe-argument': 'off',
  '@typescript-eslint/no-unsafe-assignment': 'off',
  '@typescript-eslint/no-unsafe-call': 'off',
  '@typescript-eslint/no-unsafe-enum-comparison': 'off',
  '@typescript-eslint/no-unsafe-member-access': 'off',
  '@typescript-eslint/no-unsafe-return': 'off',
  '@typescript-eslint/only-throw-error': 'off',
  '@typescript-eslint/require-await': 'off',
};

export default defineConfig([
  // ── Global ignores ──────────────────────────────────────────────────────────
  globalIgnores([
    // Build outputs
    'dist',
    'dist/**/*',
    'build',
    'build/**/*',
    'coverage',
    'coverage/**/*',

    // Dependencies
    'node_modules',
    'node_modules/**/*',

    // Archives / AI scratch
    'archive',
    'archive/**/*',
    'src/_archive_ai_source',
    'src/_archive_ai_source/**/*',

    // Generated Capacitor/mobile output
    'ios',
    'ios/**/*',
    'android',
    'android/**/*',

    // Generated type files
    'src/types/supabase.ts',
    'src/lib/supabase/database.types.ts',
    'supabase/functions/_shared/database.types.ts',

    // Minified/vendor files
    '**/*.min.js',
    '**/workbox-*.js',
  ]),

  // ── Base JS recommended ─────────────────────────────────────────────────────
  js.configs.recommended,

  // ── Declaration files (.d.ts) ───────────────────────────────────────────────
  //
  // This block must come BEFORE the recommendedTypeChecked spread and the
  // main frontend block, because flat config is order-dependent and later
  // blocks override earlier ones. Placing it first lets subsequent blocks
  // leave .d.ts files alone entirely.
  //
  // THREE things are needed for .d.ts files:
  //
  // 1. TypeScript parser — without it, Espree (the default JS parser) fails on
  //    `declare module` syntax with "Parsing error: Unexpected token module".
  //    Set here explicitly; NOT inherited from recommendedTypeChecked (which is
  //    excluded from .d.ts via per-block `ignores` below).
  //
  // 2. No projectService — typescript-eslint's projectService cannot open a
  //    .d.ts file as a program root (it's not a source entry point). Setting
  //    projectService here would trigger either:
  //      "was not found by the project service"
  //    or the allowDefaultProject glob-too-wide error if a ** pattern is used.
  //    Solution: simply omit projectService. The TS parser handles syntax
  //    without needing a type program.
  //
  // 3. All lint rules off — declaration files contain only ambient type
  //    information. Rules like no-unused-vars, no-undef, and all type-aware
  //    rules produce false positives on interface parameters, global augments,
  //    and JSX namespace declarations. Silence them all.
  {
    files: ['**/*.d.ts'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    languageOptions: {
      // TS parser for syntax — no projectService, no type program.
      parser: tseslint.parser,
      parserOptions: {
        project: false, // explicitly opt out of any inherited projectService
      },
    },
    rules: {
      // JS rules (from js.configs.recommended) that fire on .d.ts files
      'no-unused-vars': 'off', // fires on interface params, JSX namespace decls
      'no-undef': 'off', // fires on HTMLElement, CustomEvent, Blob, etc.
      'no-redeclare': 'off', // fires on ambient module re-declarations

      // @typescript-eslint rules
      ...TYPE_AWARE_RULES_OFF,
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // ── k6 load tests ───────────────────────────────────────────────────────────
  {
    files: ['load-tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        __ENV: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      'no-undef': 'off',
    },
  },

  // ── Tests ───────────────────────────────────────────────────────────────────
  {
    files: ['src/tests/**/*.ts', 'src/tests/**/*.tsx'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: false,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      ...TYPE_AWARE_RULES_OFF,
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // ── TypeScript type-checked rules (src .ts/.tsx only, not .d.ts) ────────────
  //
  // Per-block `ignores: ['**/*.d.ts']` excludes declaration files.
  // This is the correct flat-config mechanism — negation inside `files[]`
  // is not supported by ESLint flat config and is silently ignored.
  ...tseslint.configs.recommendedTypeChecked.map((cfg) => ({
    ...cfg,
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['**/*.d.ts', 'src/tests/**/*'],
  })),

  // ── TypeScript + React frontend (src .ts/.tsx, not .d.ts) ───────────────────
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['**/*.d.ts', 'src/tests/**/*'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        // projectService: true — standard form, no allowDefaultProject needed.
        //
        // .d.ts files are excluded from this block via `ignores: ['**/*.d.ts']`
        // above, so projectService never encounters them here and never needs
        // allowDefaultProject. The previous approach of using
        // allowDefaultProject: ['src/**/*.d.ts'] was wrong: typescript-eslint
        // forbids '**' in allowDefaultProject globs (glob-too-wide error) and
        // it caused the projectService to treat ALL src files as default-project
        // candidates, breaking linting for the entire project.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@eslint-react': eslintReact,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // React hooks
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Fast refresh
      'react-refresh/only-export-components': 'off',

      // React
      '@eslint-react/no-array-index-key': 'warn',

      // TypeScript — variables
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // TypeScript — async correctness (strict)
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],

      // TypeScript — type-aware, softened for existing debt
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/only-throw-error': 'warn',
      '@typescript-eslint/await-thenable': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      '@typescript-eslint/no-base-to-string': 'warn',
      '@typescript-eslint/no-redundant-type-constituents': 'warn',
      '@typescript-eslint/no-unsafe-enum-comparison': 'warn',

      // TypeScript — surface typing debt
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',

      // JS
      'no-control-regex': 'warn',
      'no-unsafe-finally': 'error',
    },
  },

  // ── Supabase / Deno backend functions ───────────────────────────────────────
  ...tseslint.configs.recommended.map((cfg) => ({
    ...cfg,
    files: ['supabase/functions/**/*.ts'],
  })),

  {
    files: ['supabase/functions/**/*.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        Deno: 'readonly',
      },
    },
    rules: {
      'react-refresh/only-export-components': 'off',
      ...TYPE_AWARE_RULES_OFF,
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
      'no-control-regex': 'warn',
      'no-unsafe-finally': 'error',
    },
  },

  // ── Admin / legacy modules ───────────────────────────────────────────────────
  {
    files: [
      'src/pages/Admin/**/*.ts',
      'src/pages/Admin/**/*.tsx',
      'src/services/admin/**/*.ts',
      'src/services/_legacy/**/*.ts',
      'src/status/**/*.ts',
      'src/status/**/*.tsx',
      'src/lib/supabase/**/*.ts',
      'src/modules/checkout/api/**/*.ts',
      'src/modules/cart/**/*.ts',
      'src/modules/cart/**/*.tsx',
      'src/modules/menu/**/*.ts',
      'src/modules/menu/**/*.tsx',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-base-to-string': 'warn',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      '@typescript-eslint/no-redundant-type-constituents': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/only-throw-error': 'warn',
      '@typescript-eslint/await-thenable': 'warn',
      'react-refresh/only-export-components': 'off',
      'no-control-regex': 'warn',
    },
  },
]);