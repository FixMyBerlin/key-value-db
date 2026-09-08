import { fileURLToPath } from 'node:url'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

const migrations = await readD1Migrations(fileURLToPath(new URL('./migrations', import.meta.url)))

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        // Pool's workerd (via wrangler 4.128 / miniflare 5.20260815) max date is 2026-08-22.
        compatibilityDate: '2026-08-22',
        bindings: {
          TEST_MIGRATIONS: migrations,
          ADMIN_KEYS_JSON:
            '{"test":"0000000000000000000000000000000000000000000000000000000000000000"}',
        },
      },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/apply-migrations.ts'],
  },
})
