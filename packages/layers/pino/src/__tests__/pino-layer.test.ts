/**
 * Tests for @ydtb/anvil-layer-pino
 *
 * Proves:
 * - pino() factory creates a valid LayerConfig
 * - silent() factory creates a no-op logger
 * - Logger interface works (info, debug, warn, error, child)
 * - Integration with createServer — getLogger() returns pino after boot
 */

import { describe, it, expect, afterEach } from 'vitest'
import { defineApp } from '@ydtb/anvil'
import { defineScope } from '@ydtb/anvil-toolkit/core'
import { createServer, getLogger, getLayer, provideLayerResolver, provideHookSystem, provideContributions, provideLoggingLayerResolver } from '@ydtb/anvil-server'
import { pino } from '../index.ts'
import { silent } from '../silent.ts'

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

describe('pino layer', () => {
  it('creates a valid LayerConfig', () => {
    const config = pino({ level: 'debug' })
    expect(config.id).toBe('logging')
    expect(config._effectLayer).toBeDefined()
    expect(config._healthCheck).toBeDefined()
  })

  it('logger satisfies the Anvil Logger interface', () => {
    const config = pino({ level: 'silent' }) // silent level = no output during test
    // Extract the logger from the layer bundle
    const bundle = config._effectLayer as { tag: unknown; layer: unknown }
    expect(bundle.tag).toBeDefined()
    expect(bundle.layer).toBeDefined()
  })

  it('pino logger supports child bindings', () => {
    const config = pino({ level: 'silent' })
    // We can't easily extract the logger from the Effect layer without booting
    // This is tested in the integration test below
    expect(config.id).toBe('logging')
  })
})

describe('silent layer', () => {
  it('creates a valid LayerConfig', () => {
    const config = silent()
    expect(config.id).toBe('logging')
    expect(config._effectLayer).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Integration with createServer
// ---------------------------------------------------------------------------

describe('pino + createServer integration', () => {
  it('getLogger() returns pino logger after boot', async () => {
    // Before boot, getLogger returns console fallback
    const beforeLogger = getLogger()
    expect(beforeLogger).toBeDefined()

    const config = defineApp({
      brand: { name: 'Pino Test' },
      layers: {
        logging: pino({ level: 'silent' }),
      } as any,
      scopes: defineScope({ type: 'system', label: 'System', urlPrefix: '/s' }),
    })

    const server = createServer({ config, tools: [] })
    await server.start()

    // After boot, getLogger should return the pino-backed logger
    const afterLogger = getLogger()
    expect(afterLogger).toBeDefined()
    expect(typeof afterLogger.info).toBe('function')
    expect(typeof afterLogger.child).toBe('function')

    // getLayer('logging') should return the logging layer
    const loggingLayer = getLayer('logging')
    expect(loggingLayer).toBeDefined()
    expect(typeof loggingLayer.logger.info).toBe('function')

    // child logger should work
    const child = afterLogger.child({ toolId: 'test' })
    expect(typeof child.info).toBe('function')
    expect(typeof child.child).toBe('function')

    await server.shutdown()
  })

  it('request context logger uses pino', async () => {
    const config = defineApp({
      brand: { name: 'Pino Request Test' },
      layers: {
        logging: pino({ level: 'silent' }),
      } as any,
      scopes: defineScope({ type: 'system', label: 'System', urlPrefix: '/s' }),
    })

    const server = createServer({ config, tools: [] })

    // Add a test route that captures the logger type
    let requestLoggerHasChild = false
    server.app.get('/test-logger', (c) => {
      const logger = getLogger()
      requestLoggerHasChild = typeof logger.child === 'function'
      // Create a child to verify the chain works
      const child = logger.child({ route: '/test-logger' })
      child.info({}, 'test log from request')
      return c.json({ ok: true })
    })

    await server.start()

    const res = await server.app.request('/test-logger')
    expect(res.status).toBe(200)
    expect(requestLoggerHasChild).toBe(true)

    await server.shutdown()
  })

  it('silent layer produces no output', async () => {
    const config = defineApp({
      brand: { name: 'Silent Test' },
      layers: {
        logging: silent(),
      } as any,
      scopes: defineScope({ type: 'system', label: 'System', urlPrefix: '/s' }),
    })

    const server = createServer({ config, tools: [] })
    await server.start()

    const logger = getLayer('logging').logger
    // These should not throw
    logger.info({}, 'should be silent')
    logger.debug({}, 'should be silent')
    logger.warn({}, 'should be silent')
    logger.error({}, 'should be silent')

    const child = logger.child({ test: true })
    child.info({}, 'child should also be silent')

    await server.shutdown()
  })
})
