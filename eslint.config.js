import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      'services/**',
      'apps/api/drizzle/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.mjs', '**/e2e/**', 'scripts/**', 'benchmarks/**'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly', fetch: 'readonly' } },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // Shared packages must stay pure and deterministic.
    files: ['packages/{recipe,builder,rules,solver,yield,sun,geometry}/src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Shared packages must be deterministic.' },
        { object: 'Date', property: 'now', message: 'Shared packages must be deterministic.' },
      ],
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['node:*', 'fs', 'path', 'crypto'], message: 'Shared packages must not use Node APIs.' }] },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'process', 'performance'],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@anthropic-ai/*'], message: 'The Claude SDK is server-only.' }] },
      ],
    },
  },
);
