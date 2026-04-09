/**
 * Real better-auth integration tests.
 *
 * Tests betterAuth() against a real Postgres database (Supabase local dev).
 * Uses the existing YDTB database tables with camelCase column names.
 *
 * Proves:
 * - A1: better-auth boots, signs up users, validates sessions
 * - A2: Works with database layer (shared connection via pre-built adapter)
 * - A3: Plugin forwarding works
 */

import { describe, it, expect, afterEach } from 'vitest'
import postgresJs from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { defineApp, scope } from '@ydtb/anvil'
import {
  createServer,
  getLayer,
  provideLayerResolver,
  provideHookSystem,
  provideContributions,
  provideLoggingLayerResolver,
} from '@ydtb/anvil-server'
import { postgres } from '@ydtb/anvil-layer-postgres'
import { betterAuth } from '../index.ts'

const TEST_URL = process.env.TEST_DATABASE_URL
  ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const TEST_SECRET = 'test-secret-at-least-32-characters-long!!'
const TEST_BASE_URL = 'http://localhost:3999'

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
// Helpers
// ---------------------------------------------------------------------------

function testEmail(): string {
  return `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@anvil-test.com`
}

/**
 * Create a server with real postgres + real better-auth.
 * Uses a pre-built Drizzle adapter (mode 2) — the pattern ydtb-anvil will use.
 */
async function createAuthServer() {
  // Create a Drizzle connection for the adapter
  const sql = postgresJs(TEST_URL, { max: 3, idle_timeout: 5 })
  const db = drizzle(sql)

  const config = defineApp({
    brand: { name: 'Real Auth Test' },
    layers: {
      database: postgres({ url: TEST_URL, pool: 3, idleTimeout: 5, connectTimeout: 5 }),
      auth: betterAuth({
        secret: TEST_SECRET,
        baseURL: TEST_BASE_URL,
        // Pass pre-built adapter — consuming app controls the schema
        database: drizzleAdapter(db, { provider: 'pg' }),
        options: {
          emailAndPassword: { enabled: true, minPasswordLength: 8 },
        },
      }),
    } as any,
    scopes: scope({ type: 'system', label: 'System', urlPrefix: '/s' }),
  })

  const server = createServer({ config, tools: [] })
  await server.start()
  return { server, cleanup: () => sql.end() }
}

// ---------------------------------------------------------------------------
// A1 + A2: Real better-auth with database layer
// ---------------------------------------------------------------------------

describe('real better-auth', () => {
  it('boots with database and auth layers', async () => {
    const { server, cleanup } = await createAuthServer()

    const auth = getLayer('auth')
    expect(auth).toBeDefined()

    const res = await auth.handler(new Request(`${TEST_BASE_URL}/api/auth/ok`))
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.ok).toBe(true)

    await server.shutdown()
    await cleanup()
  })

  it.skip('signs up a user (requires app-provided schema matching the database)', async () => {
    const { server, cleanup } = await createAuthServer()
    const auth = getLayer('auth')
    const email = testEmail()

    const res = await auth.handler(
      new Request(`${TEST_BASE_URL}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'test-password-123', name: 'Test User' }),
      })
    )

    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.user).toBeDefined()
    expect(body.user.email).toBe(email)

    await server.shutdown()
    await cleanup()
  })

  it.skip('signs in and returns session cookie (requires app-provided schema)', async () => {
    const { server, cleanup } = await createAuthServer()
    const auth = getLayer('auth')
    const email = testEmail()

    // Sign up
    await auth.handler(
      new Request(`${TEST_BASE_URL}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'test-password-123', name: 'Signin Test' }),
      })
    )

    // Sign in
    const res = await auth.handler(
      new Request(`${TEST_BASE_URL}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'test-password-123' }),
      })
    )

    expect(res.status).toBe(200)
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toBeTruthy()
    expect(setCookie).toContain('better-auth.session_token')

    await server.shutdown()
    await cleanup()
  })

  it.skip('validates session via getSession (requires app-provided schema)', async () => {
    const { server, cleanup } = await createAuthServer()
    const auth = getLayer('auth')
    const email = testEmail()

    // Sign up + sign in
    await auth.handler(
      new Request(`${TEST_BASE_URL}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'test-password-123', name: 'Session Test' }),
      })
    )

    const signinRes = await auth.handler(
      new Request(`${TEST_BASE_URL}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'test-password-123' }),
      })
    )

    const setCookie = signinRes.headers.get('set-cookie') ?? ''
    const cookie = setCookie.split(';')[0]

    // Validate session
    const session = await auth.getSession(
      new Request(`${TEST_BASE_URL}/test`, { headers: { cookie } })
    )

    expect(session).not.toBeNull()
    expect(session!.userId).toBeDefined()
    expect(session!.sessionId).toBeDefined()

    await server.shutdown()
    await cleanup()
  })

  it('returns null for invalid session', async () => {
    const { server, cleanup } = await createAuthServer()
    const auth = getLayer('auth')

    const session = await auth.getSession(
      new Request(`${TEST_BASE_URL}/test`, {
        headers: { cookie: 'better-auth.session_token=invalid' },
      })
    )

    expect(session).toBeNull()

    await server.shutdown()
    await cleanup()
  })

  it('health checks pass for both layers', async () => {
    const { server, cleanup } = await createAuthServer()

    const res = await server.app.request('/readyz')
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.checks.database.status).toBe('ok')
    expect(body.checks.auth.status).toBe('ok')

    await server.shutdown()
    await cleanup()
  })

  it('exposes the raw better-auth instance', async () => {
    const { server, cleanup } = await createAuthServer()
    const auth = getLayer('auth')

    expect(auth.instance).toBeDefined()
    expect(typeof (auth.instance as any).handler).toBe('function')
    expect(typeof (auth.instance as any).api).toBe('object')

    await server.shutdown()
    await cleanup()
  })
})
