/**
 * @ydtb/anvil-layer-postgres — Postgres database layer for Anvil.
 *
 * Provides a Drizzle ORM instance backed by postgres.js with full
 * connection pool lifecycle management via Effect.
 *
 * - Connections are acquired on boot and released on shutdown
 * - Health check validates connectivity with `SELECT 1`
 * - Pool size, idle timeout, and other options are configurable
 *
 * @example
 * ```ts
 * // compose.config.ts
 * import { postgres } from '@ydtb/anvil-layer-postgres'
 *
 * export default defineApp({
 *   layers: {
 *     database: postgres({ url: env.DATABASE_URL }),
 *   },
 * })
 * ```
 *
 * Then in tool code:
 * ```ts
 * import { getLayer } from '@ydtb/anvil-server'
 *
 * const { db, sql } = getLayer('database')
 * const users = await db.select().from(usersTable)
 * ```
 */

import postgresJs from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { Effect, Layer } from 'effect'
import type { LayerConfig, HealthStatus } from '@ydtb/anvil'
import { createLayerConfig, getLayerTag } from '@ydtb/anvil-server'

// ---------------------------------------------------------------------------
// Layer contract
// ---------------------------------------------------------------------------

export interface DatabaseLayer {
  /** Drizzle ORM instance — use for queries, inserts, updates, deletes */
  readonly db: PostgresJsDatabase
  /** Raw postgres.js SQL template tag — for raw queries and migrations */
  readonly sql: postgresJs.Sql
}

// ---------------------------------------------------------------------------
// Augment LayerMap
// ---------------------------------------------------------------------------

declare module '@ydtb/anvil' {
  interface LayerMap {
    database: DatabaseLayer
  }
}

// ---------------------------------------------------------------------------
// Effect tag
// ---------------------------------------------------------------------------

const DatabaseTag = getLayerTag<DatabaseLayer>('database')

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface PostgresConfig {
  /** Postgres connection URL */
  url: string
  /** Maximum connections in the pool (default: 10) */
  pool?: number
  /** Idle timeout in seconds (default: 20) */
  idleTimeout?: number
  /** Connection timeout in seconds (default: 10) */
  connectTimeout?: number
  /** Additional postgres.js options */
  options?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a postgres database layer with connection pool lifecycle.
 *
 * The connection pool is acquired on server boot and gracefully closed
 * on shutdown. Effect's acquireRelease guarantees cleanup even on
 * unexpected termination.
 *
 * @example
 * ```ts
 * import { postgres } from '@ydtb/anvil-layer-postgres'
 *
 * defineApp({
 *   layers: {
 *     database: postgres({
 *       url: 'postgresql://user:pass@localhost:5432/mydb',
 *       pool: 20,
 *     }),
 *   },
 * })
 * ```
 */
export function postgres(config: PostgresConfig): LayerConfig<'database'> {
  const {
    url,
    pool = 10,
    idleTimeout = 20,
    connectTimeout = 10,
    options = {},
  } = config

  // Build the Effect Layer with acquireRelease for lifecycle management
  const effectLayer = Layer.scoped(
    DatabaseTag,
    Effect.acquireRelease(
      // Acquire: create connection pool + drizzle instance
      Effect.sync(() => {
        const sql = postgresJs(url, {
          max: pool,
          idle_timeout: idleTimeout,
          connect_timeout: connectTimeout,
          ...options,
        })
        const db = drizzle(sql)
        return { db, sql }
      }),
      // Release: gracefully close all connections
      (service) =>
        Effect.promise(async () => {
          await service.sql.end({ timeout: 5 })
        }),
    ),
  )

  // Health check: verify connectivity
  const healthCheck = Effect.gen(function* () {
    const { sql } = yield* DatabaseTag
    const start = Date.now()
    yield* Effect.tryPromise(() => sql`SELECT 1`).pipe(Effect.orDie)
    return {
      status: 'ok' as const,
      latencyMs: Date.now() - start,
    } satisfies HealthStatus
  })

  return createLayerConfig('database', effectLayer, {
    healthCheck,
  })
}

// Re-export for tool authors who want Drizzle types
export type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
