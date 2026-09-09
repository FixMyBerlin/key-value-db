/** @type {import('knip').KnipConfig} */
// Copy to project-root knip.config.mjs — tune entry/ignoreBinaries per references/knip.md
// Verify scripts (@see references/package-json-scripts.md):
//   "knip": "KNIP_STRICT=1 knip --config knip.config.mjs",
//   "knip-warn": "knip --config knip.config.mjs || true",
//   "check": "bun run --parallel type-check lint format test-run knip-warn",
//   "check-pre-push": "bun run --parallel type-check lint format test-run knip",
const strict = process.env.KNIP_STRICT === '1'

export default {
  ignoreExportsUsedInFile: true,
  rules: {
    files: 'error',
    dependencies: 'error',
    devDependencies: 'error',
    unlisted: 'error',
    binaries: 'error',
    exports: strict ? 'error' : 'warn',
    types: strict ? 'error' : 'warn',
    enumMembers: strict ? 'error' : 'warn',
    duplicates: 'warn',
  },
  workspaces: {
    '.': {
      entry: [],
      ignoreDependencies: [
        'vitest',
        'eslint-plugin-compat',
        '@typescript/typescript-darwin-arm64',
        '@typescript/typescript-linux-x64',
      ],
    },
    'apps/api': {
      entry: ['src/index.ts', 'test/**/*.ts', 'vitest.config.mts'],
      ignoreDependencies: ['cloudflare'],
    },
    'apps/demo': {
      entry: ['src/main.tsx', 'src/routes/**', 'src/**/*.test.ts', 'vite.config.ts', 'vitest.config.ts'],
      ignoreDependencies: ['tailwind-merge', 'eslint-plugin-compat'],
    },
    'packages/kv-client': {
      entry: ['src/index.ts', '**/*.test.ts', 'vitest.config.mts'],
    },
  },
}
