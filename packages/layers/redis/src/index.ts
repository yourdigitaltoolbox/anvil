/**
 * @ydtb/anvil-layer-redis — Redis cache layer for Anvil.
 *
 * Key-value caching with TTL support. Connection lifecycle managed by Effect.
 *
 * @example
 * ```ts
 * import { redis } from '@ydtb/anvil-layer-redis'
 *
 * defineApp({
 *   layers: {
 *     cache: redis({ url: env.REDIS_URL }),
 *   },
 * })
 * ```
 *
 * Then in tool code:
 * ```ts
 * const cache = getLayer('cache')
 * await cache.set('key', 'value', 60)  // TTL 60 seconds
 * const value = await cache.get('key')  // 'value' or null
 * ```
 */

import Redis from 'ioredis'
import { Effect, Layer } from 'effect'
import type { LayerConfig, HealthStatus } from '@ydtb/anvil'
import { createLayerConfig, getLayerTag } from '@ydtb/anvil-server'

// ---------------------------------------------------------------------------
// Layer contract
// ---------------------------------------------------------------------------

export interface CacheLayer {
  /** Get a value by key. Returns null if not found or expired. */
  readonly get: (key: string) => Promise<string | null>
  /** Set a value with optional TTL in seconds. */
  readonly set: (key: string, value: string, ttlSeconds?: number) => Promise<void>
  /** Delete a key. */
  readonly del: (key: string) => Promise<void>
  /** Check if a key exists. */
  readonly has: (key: string) => Promise<boolean>
  /** Get multiple keys at once. */
  readonly getMany: (keys: string[]) => Promise<Array<string | null>>
  /** Delete all keys matching a pattern (e.g., 'user:*'). */
  readonly delPattern: (pattern: string) => Promise<number>
}

// ---------------------------------------------------------------------------
// Augment LayerMap
// ---------------------------------------------------------------------------

declare module '@ydtb/anvil' {
  interface LayerMap {
    cache: CacheLayer
  }
}

// ---------------------------------------------------------------------------
// Effect tag
// ---------------------------------------------------------------------------

const CacheTag = getLayerTag<CacheLayer>('cache')

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface RedisConfig {
  /** Redis connection URL (e.g., 'redis://localhost:6379') */
  url: string
  /** Key prefix for all operations (default: 'anvil:') */
  keyPrefix?: string
  /** Additional ioredis options */
  options?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a Redis cache layer with connection lifecycle.
 *
 * The connection is established on boot and gracefully closed on shutdown.
 */
export function redis(config: RedisConfig): LayerConfig<'cache'> {
  const {
    url,
    keyPrefix = 'anvil:',
    options = {},
  } = config

  const effectLayer = Layer.scoped(
    CacheTag,
    Effect.acquireRelease(
      // Acquire: connect to Redis
      Effect.sync(() => {
        const client = new Redis(url, {
          keyPrefix,
          lazyConnect: false,
          ...options,
        })

        const service: CacheLayer = {
          get: (key) => client.get(key),
          set: async (key, value, ttl) => {
            if (ttl) {
              await client.set(key, value, 'EX', ttl)
            } else {
              await client.set(key, value)
            }
          },
          del: async (key) => { await client.del(key) },
          has: async (key) => (await client.exists(key)) === 1,
          getMany: (keys) => client.mget(...keys),
          delPattern: async (pattern) => {
            const keys = await client.keys(keyPrefix + pattern)
            if (keys.length === 0) return 0
            // Strip prefix for del since ioredis adds it
            const unprefixed = keys.map((k) => k.slice(keyPrefix.length))
            return client.del(...unprefixed)
          },
        }

        return { service, client }
      }),
      // Release: disconnect
      ({ client }) => Effect.promise(() => client.quit()),
    ).pipe(Effect.map(({ service }) => service)),
  )

  // Health check: PING the Redis server
  const healthCheck = Effect.gen(function* () {
    const cache = yield* CacheTag
    const start = Date.now()
    // Use a simple get to verify connectivity
    yield* Effect.tryPromise(() => cache.get('__health__')).pipe(Effect.orDie)
    return {
      status: 'ok' as const,
      latencyMs: Date.now() - start,
    } satisfies HealthStatus
  })

  return createLayerConfig('cache', effectLayer, {
    healthCheck,
  })
}

// Re-export types
export type { CacheLayer as CacheLayerContract }
