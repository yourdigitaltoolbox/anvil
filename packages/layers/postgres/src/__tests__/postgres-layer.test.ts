/**
 * Integration tests for @ydtb/anvil-layer-postgres
 *
 * Requires a running Postgres instance. Set TEST_DATABASE_URL or
 * defaults to the local Supabase dev instance.
 *
 * Proves:
 * - Connection pool is acquired on boot
 * - Drizzle queries work through getLayer('database')
 * - Health check validates connectivity
 * - Shutdown gracefully closes connections
 * - Raw SQL works via the sql template tag
 */

import { describe, it, expect, afterEach } from 'vitest'
import { defineApp } from '@ydtb/anvil'
import { defineScope } from '@ydtb/anvil-toolkit/core'
import { createServer, getLayer, provideLayerResolver, provideHookSystem, provideContributions, provideLoggingLayerResolver } from '@ydtb/anvil-server'
import { postgres } from '../index.ts'
import { testPostgres } from '../test.ts'

const TEST_URL = process.env.TEST_DATABASE_URL
  ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

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
// Unit tests
// ---------------------------------------------------------------------------

describe('postgres layer', () => {
  it('creates a valid LayerConfig', () => {
    const config = postgres({ url: TEST_URL })
    expect(config.id).toBe('database')
    expect(config._effectLayer).toBeDefined()
    expect(config._healthCheck).toBeDefined()
  })

  it('testPostgres helper creates config with small pool', () => {
    const config = testPostgres({ url: TEST_URL })
    expect(config.id).toBe('database')
  })
})

// ---------------------------------------------------------------------------
// Integration with createServer
// ---------------------------------------------------------------------------

describe('postgres + createServer integration', () => {
  it('boots, queries, health-checks, and shuts down', async () => {
    const config = defineApp({
      brand: { name: 'Postgres Test' },
      layers: {
        database: testPostgres({ url: TEST_URL }),
      } as any,
      scopes: defineScope({ type: 'system', label: 'System', urlPrefix: '/s' }),
    })

    const server = createServer({ config, tools: [] })
    await server.start()

    // getLayer('database') returns the Drizzle instance
    const { db, sql } = getLayer('database')
    expect(db).toBeDefined()
    expect(sql).toBeDefined()

    // Raw SQL query works
    const result = await sql`SELECT 1 as test`
    expect(result[0].test).toBe(1)

    // Health check passes
    const healthRes = await server.app.request('/readyz')
    expect(healthRes.status).toBe(200)
    const healthBody = await healthRes.json()
    expect(healthBody.status).toBe('ok')
    expect(healthBody.checks.database.status).toBe('ok')
    expect(healthBody.checks.database.latencyMs).toBeDefined()

    // Can query current database via raw sql
    const dbNameResult = await sql`SELECT current_database() as dbname`
    expect(dbNameResult[0].dbname).toBe('postgres')

    // Shutdown closes connections
    await server.shutdown()

    // After shutdown, getLayer throws
    expect(() => getLayer('database')).toThrow('Layers not available')
  })

  it('getLayer works inside Hono route handlers', async () => {
    const { Hono } = await import('hono')

    const router = new Hono()
    router.get('/db-test', async (c) => {
      const { sql } = getLayer('database')
      const result = await sql`SELECT 42 as answer`
      return c.json({ answer: result[0].answer })
    })

    const config = defineApp({
      brand: { name: 'Route DB Test' },
      layers: {
        database: testPostgres({ url: TEST_URL }),
      } as any,
      scopes: defineScope({ type: 'system', label: 'System', urlPrefix: '/s' }),
    })

    const server = createServer({
      config,
      tools: [{ id: 'db-tool', module: { default: { router } } }],
    })

    await server.start()

    const res = await server.app.request('/api/db-tool/db-test')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.answer).toBe(42)

    await server.shutdown()
  })
})
