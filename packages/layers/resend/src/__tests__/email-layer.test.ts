/**
 * Tests for @ydtb/anvil-layer-resend (console implementation).
 *
 * Proves the full EmailLayer contract:
 * - send returns an ID
 * - Single and multiple recipients
 * - Optional fields (html, from, replyTo)
 * - Integration with createServer
 */

import { describe, it, expect, afterEach } from 'vitest'
import { defineApp, scope } from '@ydtb/anvil'
import { createServer, getLayer, provideLayerResolver, provideHookSystem, provideContributions, provideLoggingLayerResolver } from '@ydtb/anvil-server'
import { consoleEmail } from '../console.ts'

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

describe('consoleEmail layer', () => {
  it('creates a valid LayerConfig', () => {
    const config = consoleEmail({ silent: true })
    expect(config.id).toBe('email')
    expect(config._effectLayer).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Integration: full EmailLayer contract via createServer
// ---------------------------------------------------------------------------

describe('email layer + createServer', () => {
  async function bootWithEmail() {
    const config = defineApp({
      brand: { name: 'Email Test' },
      layers: { email: consoleEmail({ silent: true }) } as any,
      scopes: scope({ type: 'system', label: 'System', urlPrefix: '/s' }),
    })
    const server = createServer({ config, tools: [] })
    await server.start()
    return server
  }

  it('send returns an ID', async () => {
    const server = await bootWithEmail()
    const email = getLayer('email')

    const result = await email.send({
      to: 'user@example.com',
      subject: 'Hello',
      body: 'World',
    })

    expect(result.id).toBeDefined()
    expect(typeof result.id).toBe('string')

    await server.shutdown()
  })

  it('send to single recipient', async () => {
    const server = await bootWithEmail()
    const email = getLayer('email')

    const result = await email.send({
      to: 'alice@example.com',
      subject: 'Test Subject',
      body: 'Test body content',
    })

    expect(result.id).toBeTruthy()

    await server.shutdown()
  })

  it('send to multiple recipients', async () => {
    const server = await bootWithEmail()
    const email = getLayer('email')

    const result = await email.send({
      to: ['alice@example.com', 'bob@example.com'],
      subject: 'Group Email',
      body: 'Hello everyone',
    })

    expect(result.id).toBeTruthy()

    await server.shutdown()
  })

  it('send with all optional fields', async () => {
    const server = await bootWithEmail()
    const email = getLayer('email')

    const result = await email.send({
      to: 'user@example.com',
      subject: 'Full Message',
      body: 'Plain text body',
      html: '<h1>HTML body</h1>',
      from: 'sender@example.com',
      replyTo: 'reply@example.com',
    })

    expect(result.id).toBeTruthy()

    await server.shutdown()
  })

  it('each send returns a unique ID', async () => {
    const server = await bootWithEmail()
    const email = getLayer('email')

    const r1 = await email.send({ to: 'a@a.com', subject: 'A', body: 'a' })
    const r2 = await email.send({ to: 'b@b.com', subject: 'B', body: 'b' })
    const r3 = await email.send({ to: 'c@c.com', subject: 'C', body: 'c' })

    expect(r1.id).not.toBe(r2.id)
    expect(r2.id).not.toBe(r3.id)

    await server.shutdown()
  })

  it('health check passes', async () => {
    const server = await bootWithEmail()

    const res = await server.app.request('/readyz')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.checks.email.status).toBe('ok')

    await server.shutdown()
  })

  it('email layer accessible inside route handler', async () => {
    const config = defineApp({
      brand: { name: 'Route Email Test' },
      layers: { email: consoleEmail({ silent: true }) } as any,
      scopes: scope({ type: 'system', label: 'System', urlPrefix: '/s' }),
    })

    const server = createServer({ config, tools: [] })

    let sentId: string | null = null
    server.app.get('/send-email', async (c) => {
      const email = getLayer('email')
      const result = await email.send({
        to: 'route-test@example.com',
        subject: 'From Route',
        body: 'Sent from a Hono route handler',
      })
      sentId = result.id
      return c.json({ id: result.id })
    })

    await server.start()

    const res = await server.app.request('/send-email')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBeTruthy()
    expect(sentId).toBeTruthy()

    await server.shutdown()
  })
})
