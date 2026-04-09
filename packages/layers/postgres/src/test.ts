/**
 * Test helper for the postgres layer.
 *
 * Provides a pre-configured factory for test environments with
 * sensible defaults (small pool, short timeouts).
 *
 * @example
 * ```ts
 * import { testPostgres } from '@ydtb/anvil-layer-postgres/test'
 *
 * const config = defineApp({
 *   layers: {
 *     database: testPostgres({ url: process.env.TEST_DATABASE_URL! }),
 *   },
 * })
 * ```
 */

import { postgres } from './index.ts'
import type { LayerConfig } from '@ydtb/anvil'

export interface TestPostgresConfig {
  /** Test database connection URL */
  url: string
  /** Pool size (default: 3) */
  pool?: number
}

/**
 * Create a postgres layer configured for testing.
 * Small pool, short timeouts, same driver as production.
 */
export function testPostgres(config: TestPostgresConfig): LayerConfig<'database'> {
  return postgres({
    url: config.url,
    pool: config.pool ?? 3,
    idleTimeout: 5,
    connectTimeout: 5,
  })
}
