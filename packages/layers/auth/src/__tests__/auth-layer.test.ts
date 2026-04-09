/**
 * Tests for @ydtb/anvil-layer-auth
 *
 * Uses the mock auth layer — no real database or better-auth instance needed.
 *
 * Proves:
 * - AuthLayer contract (getSession, getUser, handler)
 * - Mock auth with predefined users
 * - Auth middleware populates RequestContext.userId
 * - Auth routes handler
 * - Integration with createServer
 */

import { describe, it, expect, afterEach } from 'vitest'
import { Hono } from 'hono'
import { defineApp } from '@ydtb/anvil'
import { defineScope } from '@ydtb/anvil-toolkit/core'
import {
  createServer,
  getLayer,
  getRequestContext,
  provideLayerResolver,
  provideHookSystem,
  provideContributions,
  provideLoggingLayerResolver,
} from '@ydtb/anvil-server'
import { mockAuth } from '../mock.ts'
import { authMiddleware, authRoutes } from '../middleware.ts'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const testUsers = [
  { id: 'usr_1', email: 'alice@test.com', name: 'Alice' },
  { id: 'usr_2', email: 'bob@test.com', name: 'Bob' },
]

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
// Mock auth unit tests
// ---------------------------------------------------------------------------

describe('mock auth layer', () => {
  it('creates a valid LayerConfig', () => {
    const config = mockAuth({ users: testUsers })
    expect(config.id).toBe('auth')
    expect(config._effectLayer).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Integration with createServer
// ---------------------------------------------------------------------------

describe('auth layer + createServer', () => {
  async function bootWithAuth() {
    const config = defineApp({
      brand: { name: 'Auth Test' },
      layers: {
        auth: mockAuth({ users: testUsers }),
      } as any,
      scopes: defineScope({ type: 'system', label: 'System', urlPrefix: '/s' }),
    })
    const server = createServer({ config, tools: [] })
    await server.start()
    return server
  }

  it('getSession returns session for valid Bearer token', async () => {
    const server = await bootWithAuth()
    const auth = getLayer('auth')

    const request = new Request('http://localhost/api/test', {
      headers: { Authorization: 'Bearer usr_1' },
    })

    const session = await auth.getSession(request)
    expect(session).not.toBeNull()
    expect(session!.userId).toBe('usr_1')
    expect(session!.sessionId).toBe('session_usr_1')

    await server.shutdown()
  })

  it('getSession returns null for invalid token', async () => {
    const server = await bootWithAuth()
    const auth = getLayer('auth')

    const request = new Request('http://localhost/api/test', {
      headers: { Authorization: 'Bearer usr_unknown' },
    })

    const session = await auth.getSession(request)
    expect(session).toBeNull()

    await server.shutdown()
  })

  it('getSession returns null for missing header', async () => {
    const server = await bootWithAuth()
    const auth = getLayer('auth')

    const request = new Request('http://localhost/api/test')
    const session = await auth.getSession(request)
    expect(session).toBeNull()

    await server.shutdown()
  })

  it('getUser returns user for valid ID', async () => {
    const server = await bootWithAuth()
    const auth = getLayer('auth')

    const user = await auth.getUser('usr_1')
    expect(user).not.toBeNull()
    expect(user!.email).toBe('alice@test.com')
    expect(user!.name).toBe('Alice')

    await server.shutdown()
  })

  it('getUser returns null for unknown ID', async () => {
    const server = await bootWithAuth()
    const auth = getLayer('auth')

    const user = await auth.getUser('usr_unknown')
    expect(user).toBeNull()

    await server.shutdown()
  })

  it('handler responds to /session endpoint', async () => {
    const server = await bootWithAuth()
    const auth = getLayer('auth')

    const request = new Request('http://localhost/api/auth/session', {
      headers: { Authorization: 'Bearer usr_1' },
    })

    const response = await auth.handler(request)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.session.userId).toBe('usr_1')

    await server.shutdown()
  })

  it('health check passes', async () => {
    const server = await bootWithAuth()

    const res = await server.app.request('/readyz')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.checks.auth.status).toBe('ok')

    await server.shutdown()
  })
})

// ---------------------------------------------------------------------------
// Auth middleware tests
// ---------------------------------------------------------------------------

describe('auth middleware', () => {
  it('populates RequestContext.userId for authenticated requests', async () => {
    const config = defineApp({
      brand: { name: 'Middleware Test' },
      layers: {
        auth: mockAuth({ users: testUsers }),
      } as any,
      scopes: defineScope({ type: 'system', label: 'System', urlPrefix: '/s' }),
    })

    const server = createServer({
      config,
      tools: [],
      middleware: [authMiddleware()],
    })

    let capturedUserId: string | undefined

    server.app.get('/api/whoami', (c) => {
      const ctx = getRequestContext()
      capturedUserId = ctx?.userId
      return c.json({ userId: ctx?.userId ?? null })
    })

    await server.start()

    const res = await server.app.request('/api/whoami', {
      headers: { Authorization: 'Bearer usr_2' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.userId).toBe('usr_2')
    expect(capturedUserId).toBe('usr_2')

    await server.shutdown()
  })

  it('continues without userId for unauthenticated requests', async () => {
    const config = defineApp({
      brand: { name: 'Unauth Test' },
      layers: {
        auth: mockAuth({ users: testUsers }),
      } as any,
      scopes: defineScope({ type: 'system', label: 'System', urlPrefix: '/s' }),
    })

    const server = createServer({
      config,
      tools: [],
      middleware: [authMiddleware()],
    })

    server.app.get('/api/whoami', (c) => {
      const ctx = getRequestContext()
      return c.json({ userId: ctx?.userId ?? null })
    })

    await server.start()

    const res = await server.app.request('/api/whoami')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.userId).toBeNull()

    await server.shutdown()
  })

  it('returns 401 when requireAuth is true and no session', async () => {
    const config = defineApp({
      brand: { name: 'RequireAuth Test' },
      layers: {
        auth: mockAuth({ users: testUsers }),
      } as any,
      scopes: defineScope({ type: 'system', label: 'System', urlPrefix: '/s' }),
    })

    const server = createServer({
      config,
      tools: [],
      middleware: [authMiddleware({ requireAuth: true, skipPaths: ['/healthz', '/readyz'] })],
    })

    server.app.get('/api/protected', (c) => c.json({ ok: true }))

    await server.start()

    const res = await server.app.request('/api/protected')
    expect(res.status).toBe(401)

    await server.shutdown()
  })

  it('skips configured paths', async () => {
    const config = defineApp({
      brand: { name: 'Skip Test' },
      layers: {
        auth: mockAuth({ users: testUsers }),
      } as any,
      scopes: defineScope({ type: 'system', label: 'System', urlPrefix: '/s' }),
    })

    const server = createServer({
      config,
      tools: [],
      middleware: [authMiddleware({ requireAuth: true, skipPaths: ['/api/public', '/healthz', '/readyz'] })],
    })

    server.app.get('/api/public/hello', (c) => c.json({ public: true }))

    await server.start()

    // Public path should work without auth
    const res = await server.app.request('/api/public/hello')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.public).toBe(true)

    await server.shutdown()
  })
})
