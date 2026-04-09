/**
 * Tests for cache layers (memory implementation).
 *
 * Proves the full CacheLayer contract:
 * - get/set/del/has
 * - TTL expiration
 * - getMany
 * - delPattern
 * - Integration with createServer
 */

import { describe, it, expect, afterEach } from 'vitest'
import { defineApp, scope } from '@ydtb/anvil'
import { createServer, getLayer, provideLayerResolver, provideHookSystem, provideContributions, provideLoggingLayerResolver } from '@ydtb/anvil-server'
import { memory } from '../memory.ts'

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterEach(() => {
  provideLayerResolver(null)
  provideHookSystem(null)
  provideContributions(null)
  provideLoggingLayerResolver(null)
})

// ---------------------------------------------------------------------------
// Unit: LayerConfig shape
// ---------------------------------------------------------------------------

describe('memory cache layer', () => {
  it('creates a valid LayerConfig', () => {
    const config = memory()
    expect(config.id).toBe('cache')
    expect(config._effectLayer).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Integration: full CacheLayer contract via createServer
// ---------------------------------------------------------------------------

describe('cache layer + createServer', () => {
  async function bootWithCache(seed?: Record<string, string>) {
    const config = defineApp({
      brand: { name: 'Cache Test' },
      layers: { cache: memory({ seed }) } as any,
      scopes: scope({ type: 'system', label: 'System', urlPrefix: '/s' }),
    })
    const server = createServer({ config, tools: [] })
    await server.start()
    return server
  }

  it('get/set/del', async () => {
    const server = await bootWithCache()
    const cache = getLayer('cache')

    // Set and get
    await cache.set('name', 'anvil')
    expect(await cache.get('name')).toBe('anvil')

    // Overwrite
    await cache.set('name', 'updated')
    expect(await cache.get('name')).toBe('updated')

    // Delete
    await cache.del('name')
    expect(await cache.get('name')).toBeNull()

    await server.shutdown()
  })

  it('has', async () => {
    const server = await bootWithCache()
    const cache = getLayer('cache')

    expect(await cache.has('missing')).toBe(false)

    await cache.set('exists', 'yes')
    expect(await cache.has('exists')).toBe(true)

    await cache.del('exists')
    expect(await cache.has('exists')).toBe(false)

    await server.shutdown()
  })

  it('TTL expiration', async () => {
    const server = await bootWithCache()
    const cache = getLayer('cache')

    // Set with 1 second TTL
    await cache.set('temp', 'value', 1)
    expect(await cache.get('temp')).toBe('value')

    // Wait for expiry
    await new Promise((r) => setTimeout(r, 1100))
    expect(await cache.get('temp')).toBeNull()

    await server.shutdown()
  })

  it('getMany', async () => {
    const server = await bootWithCache()
    const cache = getLayer('cache')

    await cache.set('a', '1')
    await cache.set('b', '2')
    // 'c' not set

    const results = await cache.getMany(['a', 'b', 'c'])
    expect(results).toEqual(['1', '2', null])

    await server.shutdown()
  })

  it('delPattern', async () => {
    const server = await bootWithCache()
    const cache = getLayer('cache')

    await cache.set('user:1', 'alice')
    await cache.set('user:2', 'bob')
    await cache.set('post:1', 'hello')

    const deleted = await cache.delPattern('user:*')
    expect(deleted).toBe(2)

    expect(await cache.get('user:1')).toBeNull()
    expect(await cache.get('user:2')).toBeNull()
    expect(await cache.get('post:1')).toBe('hello')

    await server.shutdown()
  })

  it('seed data', async () => {
    const server = await bootWithCache({ greeting: 'hello', name: 'anvil' })
    const cache = getLayer('cache')

    expect(await cache.get('greeting')).toBe('hello')
    expect(await cache.get('name')).toBe('anvil')

    await server.shutdown()
  })

  it('health check passes', async () => {
    const server = await bootWithCache()

    const res = await server.app.request('/readyz')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.checks.cache.status).toBe('ok')

    await server.shutdown()
  })
})
