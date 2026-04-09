/**
 * In-memory cache layer — for development and testing.
 *
 * Same CacheLayer contract as Redis, backed by a Map with TTL expiration.
 * No external dependencies, no network calls.
 *
 * @example
 * ```ts
 * import { memory } from '@ydtb/anvil-layer-redis/memory'
 *
 * defineApp({
 *   layers: {
 *     cache: memory(),
 *   },
 * })
 * ```
 */

import { Context, Effect, Layer } from 'effect'
import type { LayerConfig } from '@ydtb/anvil'
import { createLayerConfig } from '@ydtb/anvil-server'
import type { CacheLayer } from './index.ts'
import { CacheTag } from './index.ts'

// ---------------------------------------------------------------------------
// In-memory store with TTL
// ---------------------------------------------------------------------------

interface CacheEntry {
  value: string
  expiresAt: number | null // null = no expiry
}

function createMemoryStore() {
  const store = new Map<string, CacheEntry>()

  function isExpired(entry: CacheEntry): boolean {
    return entry.expiresAt !== null && Date.now() > entry.expiresAt
  }

  function cleanup(): void {
    for (const [key, entry] of store) {
      if (isExpired(entry)) store.delete(key)
    }
  }

  // Periodic cleanup every 30 seconds
  const interval = setInterval(cleanup, 30_000)

  const service: CacheLayer = {
    get: async (key) => {
      const entry = store.get(key)
      if (!entry || isExpired(entry)) {
        if (entry) store.delete(key)
        return null
      }
      return entry.value
    },

    set: async (key, value, ttlSeconds) => {
      store.set(key, {
        value,
        expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
      })
    },

    del: async (key) => {
      store.delete(key)
    },

    has: async (key) => {
      const entry = store.get(key)
      if (!entry || isExpired(entry)) {
        if (entry) store.delete(key)
        return false
      }
      return true
    },

    getMany: async (keys) => {
      return keys.map((key) => {
        const entry = store.get(key)
        if (!entry || isExpired(entry)) {
          if (entry) store.delete(key)
          return null
        }
        return entry.value
      })
    },

    delPattern: async (pattern) => {
      // Simple glob matching: only supports trailing * for now
      const regex = new RegExp(
        '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
      )
      let count = 0
      for (const key of store.keys()) {
        if (regex.test(key)) {
          store.delete(key)
          count++
        }
      }
      return count
    },
  }

  return { service, dispose: () => clearInterval(interval) }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface MemoryCacheConfig {
  /** Initial data to populate the cache with (for testing) */
  seed?: Record<string, string>
}

/**
 * Create an in-memory cache layer.
 *
 * Supports TTL expiration and pattern deletion. Cleanup runs every 30 seconds.
 * Data is lost when the process exits — use for dev/test only.
 */
export function memory(config?: MemoryCacheConfig): LayerConfig<'cache'> {
  const effectLayer = Layer.scoped(
    CacheTag,
    Effect.acquireRelease(
      Effect.sync(() => {
        const { service, dispose } = createMemoryStore()

        // Seed initial data
        if (config?.seed) {
          for (const [key, value] of Object.entries(config.seed)) {
            service.set(key, value)
          }
        }

        return { service, dispose }
      }),
      ({ dispose }) => Effect.sync(dispose),
    ).pipe(Effect.map(({ service }) => service)),
  )

  return createLayerConfig('cache', CacheTag, effectLayer, {
    healthCheck: Effect.succeed({ status: 'ok' as const, latencyMs: 0 }),
  })
}
