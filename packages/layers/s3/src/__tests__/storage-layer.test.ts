/**
 * Tests for @ydtb/anvil-layer-s3 (memory implementation).
 *
 * Proves the full StorageLayer contract:
 * - put/get/del
 * - exists
 * - getUrl returns memory:// prefix
 * - String, Buffer inputs
 * - Integration with createServer
 */

import { describe, it, expect, afterEach } from 'vitest'
import { defineApp } from '@ydtb/anvil'
import { defineScope } from '@ydtb/anvil-toolkit/core'
import { createServer, getLayer, provideLayerResolver, provideHookSystem, provideContributions, provideLoggingLayerResolver } from '@ydtb/anvil-server'
import { memoryStorage } from '../memory.ts'

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

describe('memoryStorage layer', () => {
  it('creates a valid LayerConfig', () => {
    const config = memoryStorage()
    expect(config.id).toBe('storage')
    expect(config._effectLayer).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Integration: full StorageLayer contract via createServer
// ---------------------------------------------------------------------------

describe('storage layer + createServer', () => {
  async function bootWithStorage(seed?: Record<string, string | Buffer>) {
    const config = defineApp({
      brand: { name: 'Storage Test' },
      layers: { storage: memoryStorage({ seed }) } as any,
      scopes: defineScope({ type: 'system', label: 'System', urlPrefix: '/s' }),
    })
    const server = createServer({ config, tools: [] })
    await server.start()
    return server
  }

  it('put and get string data', async () => {
    const server = await bootWithStorage()
    const storage = getLayer('storage')

    const key = await storage.put('hello.txt', 'Hello, world!')
    expect(key).toBe('hello.txt')

    const data = await storage.get('hello.txt')
    expect(data).not.toBeNull()
    expect(data!.toString()).toBe('Hello, world!')

    await server.shutdown()
  })

  it('put and get Buffer data', async () => {
    const server = await bootWithStorage()
    const storage = getLayer('storage')

    const buf = Buffer.from([0x01, 0x02, 0x03, 0x04])
    await storage.put('binary.bin', buf)

    const data = await storage.get('binary.bin')
    expect(data).not.toBeNull()
    expect(Buffer.compare(data!, buf)).toBe(0)

    await server.shutdown()
  })

  it('get returns null for missing key', async () => {
    const server = await bootWithStorage()
    const storage = getLayer('storage')

    const data = await storage.get('nonexistent.txt')
    expect(data).toBeNull()

    await server.shutdown()
  })

  it('del removes an object', async () => {
    const server = await bootWithStorage()
    const storage = getLayer('storage')

    await storage.put('temp.txt', 'temporary')
    expect(await storage.get('temp.txt')).not.toBeNull()

    await storage.del('temp.txt')
    expect(await storage.get('temp.txt')).toBeNull()

    await server.shutdown()
  })

  it('del on missing key does not throw', async () => {
    const server = await bootWithStorage()
    const storage = getLayer('storage')

    await expect(storage.del('ghost.txt')).resolves.toBeUndefined()

    await server.shutdown()
  })

  it('exists returns true for existing key', async () => {
    const server = await bootWithStorage()
    const storage = getLayer('storage')

    await storage.put('check.txt', 'exists')
    expect(await storage.exists('check.txt')).toBe(true)

    await server.shutdown()
  })

  it('exists returns false for missing key', async () => {
    const server = await bootWithStorage()
    const storage = getLayer('storage')

    expect(await storage.exists('nope.txt')).toBe(false)

    await server.shutdown()
  })

  it('getUrl returns memory:// prefix', async () => {
    const server = await bootWithStorage()
    const storage = getLayer('storage')

    const url = storage.getUrl('avatars/user_123.png')
    expect(url).toBe('memory://avatars/user_123.png')

    await server.shutdown()
  })

  it('overwrite existing key', async () => {
    const server = await bootWithStorage()
    const storage = getLayer('storage')

    await storage.put('file.txt', 'version 1')
    await storage.put('file.txt', 'version 2')

    const data = await storage.get('file.txt')
    expect(data!.toString()).toBe('version 2')

    await server.shutdown()
  })

  it('seed data is available on boot', async () => {
    const server = await bootWithStorage({
      'readme.txt': 'Hello',
      'data.bin': Buffer.from([0xff]),
    })
    const storage = getLayer('storage')

    const readme = await storage.get('readme.txt')
    expect(readme!.toString()).toBe('Hello')

    const bin = await storage.get('data.bin')
    expect(bin![0]).toBe(0xff)

    await server.shutdown()
  })

  it('health check passes', async () => {
    const server = await bootWithStorage()

    const res = await server.app.request('/readyz')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.checks.storage.status).toBe('ok')

    await server.shutdown()
  })

  it('storage layer accessible inside route handler', async () => {
    const config = defineApp({
      brand: { name: 'Route Storage Test' },
      layers: { storage: memoryStorage() } as any,
      scopes: defineScope({ type: 'system', label: 'System', urlPrefix: '/s' }),
    })

    const server = createServer({ config, tools: [] })

    server.app.get('/upload', async (c) => {
      const storage = getLayer('storage')
      const key = await storage.put('from-route.txt', 'route data')
      return c.json({ key })
    })

    server.app.get('/download', async (c) => {
      const storage = getLayer('storage')
      const data = await storage.get('from-route.txt')
      return c.json({ data: data?.toString() ?? null })
    })

    await server.start()

    const uploadRes = await server.app.request('/upload')
    expect(uploadRes.status).toBe(200)
    expect((await uploadRes.json()).key).toBe('from-route.txt')

    const downloadRes = await server.app.request('/download')
    expect(downloadRes.status).toBe(200)
    expect((await downloadRes.json()).data).toBe('route data')

    await server.shutdown()
  })
})
