import type { D1Migration } from '@cloudflare/vitest-pool-workers'

declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: D1Migration[]
  }
}

interface Env {
  TEST_MIGRATIONS: D1Migration[]
}
