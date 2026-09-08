/** @type {import('knip').KnipConfig} */
// Copy to project-root knip.config.mjs — tune entry/ignoreBinaries per references/knip.md
// Verify scripts (@see references/package-json-scripts.md):
//   "knip": "KNIP_STRICT=1 knip --config knip.config.mjs",
//   "knip-warn": "knip --config knip.config.mjs || true",
//   "check": "bun run --parallel type-check lint format test-run knip-warn",
//   "check-pre-push": "bun run --parallel type-check lint format test-run knip",
const strict = process.env.KNIP_STRICT === '1'

export default {
  ignore: ['.agents/**', 'apps/demo/src/routeTree.gen.ts', 'apps/api/worker-configuration.d.ts'],
  ignoreBinaries: ['code', 'gh', 'rg'],
  ignoreUnresolved: ['cloudflare:test', 'cloudflare:workers'],
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
      ignoreDependencies: ['vitest'],
    },
    'apps/api': {
      entry: ['src/index.ts', 'test/**/*.ts', 'vitest.config.mts'],
    },
    'apps/demo': {
      entry: ['src/main.ts', 'src/main.tsx', 'src/router.tsx', 'src/routes/**', 'vite.config.ts'],
    },
    'packages/kv-client': {
      entry: ['src/index.ts', '**/*.test.ts', 'vitest.config.mts'],
    },
  },
}
