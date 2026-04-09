/**
 * Cache helpers — optional utilities that use the CacheLayer if installed.
 *
 * All helpers gracefully degrade — if no cache layer is installed, they
 * skip caching and run the original logic directly. Zero overhead when
 * caching isn't configured.
 *
 * Three helpers:
 * - `withCache()` — generic cache-aside wrapper for any async function
 * - `cacheMiddleware()` — Hono middleware for API response caching
 * - SPA handler caching is built into `createSpaHandler` via the `cache` option
 */

import type { MiddlewareHandler } from 'hono'
import { getLogger } from './request-context.ts'

// ---------------------------------------------------------------------------
// Cache layer accessor (safe — returns null if not installed)
// ---------------------------------------------------------------------------

interface CacheService {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string, ttlSeconds?: number) => Promise<void>
  del: (key: string) => Promise<void>
}

/**
 * Layer resolver reference — set by createServer during boot.
 * @internal
 */
let _getLayerFn: ((key: string) => unknown) | null = null

/** @internal — called by createServer after boot */
export function provideCacheResolver(fn: ((key: string) => unknown) | null): void {
  _getLayerFn = fn
}

function tryGetCache(): CacheService | null {
  if (!_getLayerFn) return null
  try {
    const layer = _getLayerFn('cache')
    if (layer && typeof (layer as Record<string, unknown>).get === 'function') {
      return layer as CacheService
    }
    return null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// withCache — generic cache-aside wrapper
// ---------------------------------------------------------------------------

export interface WithCacheOptions {
  /** Cache key */
  key: string
  /** TTL in seconds (default: 60) */
  ttl?: number
}

/**
 * Cache-aside wrapper for any async function.
 *
 * Checks the cache first. On miss, runs the function, caches the result.
 * If no cache layer is installed, runs the function directly.
 *
 * @example
 * ```ts
 * import { withCache } from '@ydtb/anvil-server'
 *
 * const contacts = await withCache(
 *   { key: `contacts:${scopeId}`, ttl: 30 },
 *   () => db.select().from(contactsTable).where(eq(contactsTable.scopeId, scopeId))
 * )
 * ```
 */
export async function withCache<T>(
  options: WithCacheOptions,
  fn: () => Promise<T>,
): Promise<T> {
  const { key, ttl = 60 } = options
  const cache = tryGetCache()

  if (!cache) return fn()

  // Check cache
  try {
    const cached = await cache.get(key)
    if (cached !== null) {
      return JSON.parse(cached) as T
    }
  } catch {
    // Cache read failed — fall through to compute
  }

  // Compute
  const result = await fn()

  // Store (fire-and-forget — don't block the response)
  try {
    cache.set(key, JSON.stringify(result), ttl).catch(() => {})
  } catch {
    // Cache write failed — not critical
  }

  return result
}

// ---------------------------------------------------------------------------
// cacheMiddleware — Hono middleware for API response caching
// ---------------------------------------------------------------------------

export interface CacheMiddlewareOptions {
  /**
   * Build the cache key from the request.
   * Default: `cache:{method}:{path}:{search}`
   */
  keyBuilder?: (c: { req: { method: string; url: string }; }) => string
  /** TTL in seconds (default: 60) */
  ttl?: number
  /**
   * Which HTTP methods to cache.
   * Default: ['GET']
   */
  methods?: string[]
}

/**
 * Hono middleware that caches JSON responses.
 *
 * Only caches successful (200) JSON responses for configured HTTP methods.
 * If no cache layer is installed, passes through with zero overhead.
 *
 * @example
 * ```ts
 * import { cacheMiddleware } from '@ydtb/anvil-server'
 *
 * // Cache all GET responses on this route for 30 seconds
 * router.get('/contacts', cacheMiddleware({ ttl: 30 }), (c) => {
 *   const contacts = await db.select().from(contactsTable)
 *   return c.json({ contacts })
 * })
 * ```
 */
export function cacheMiddleware(options?: CacheMiddlewareOptions): MiddlewareHandler {
  const {
    ttl = 60,
    methods = ['GET'],
    keyBuilder = (c: { req: { method: string; url: string } }) => {
      const url = new URL(c.req.url)
      return `cache:${c.req.method}:${url.pathname}:${url.search}`
    },
  } = options ?? {}

  return async (c, next) => {
    // Only cache configured methods
    if (!methods.includes(c.req.method)) {
      return next()
    }

    const cache = tryGetCache()
    if (!cache) return next()

    const key = keyBuilder(c)

    // Check cache
    try {
      const cached = await cache.get(key)
      if (cached !== null) {
        const { body, status, headers } = JSON.parse(cached)
        return new Response(body, {
          status,
          headers: { ...headers, 'x-cache': 'HIT' },
        })
      }
    } catch {
      // Cache read failed — fall through
    }

    // Run the handler
    await next()

    // Cache the response if it was successful JSON
    if (c.res.status === 200) {
      const contentType = c.res.headers.get('content-type') ?? ''
      if (contentType.includes('application/json')) {
        try {
          const body = await c.res.clone().text()
          const cacheEntry = JSON.stringify({
            body,
            status: c.res.status,
            headers: { 'content-type': contentType },
          })
          cache.set(key, cacheEntry, ttl).catch(() => {})
        } catch {
          // Cache write failed — not critical
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// invalidateCache — remove cached entries
// ---------------------------------------------------------------------------

/**
 * Invalidate a cache entry by key.
 *
 * Useful after mutations to ensure stale data isn't served.
 * No-op if cache layer isn't installed.
 *
 * @example
 * ```ts
 * import { invalidateCache } from '@ydtb/anvil-server'
 *
 * // After creating a contact
 * await invalidateCache(`contacts:${scopeId}`)
 * ```
 */
export async function invalidateCache(key: string): Promise<void> {
  const cache = tryGetCache()
  if (!cache) return

  try {
    await (cache as unknown as { del: (key: string) => Promise<void> }).del(key)
  } catch {
    // Not critical
  }
}
