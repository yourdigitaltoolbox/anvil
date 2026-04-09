import { describe, it, expect, afterEach } from 'vitest'
import { defineApp, scope } from '@ydtb/anvil'
import { createServer, getLayer, provideLayerResolver, provideHookSystem, provideContributions, provideLoggingLayerResolver } from '@ydtb/anvil-server'
import { noopErrors } from '../noop.ts'

afterEach(() => {
  provideLayerResolver(null)
  provideHookSystem(null)
  provideContributions(null)
  provideLoggingLayerResolver(null)
})

describe('noop errors layer', () => {
  it('creates a valid LayerConfig', () => {
    const config = noopErrors({ silent: true })
    expect(config.id).toBe('errors')
    expect(config._effectLayer).toBeDefined()
  })

  it('integrates with createServer', async () => {
    const config = defineApp({
      brand: { name: 'Error Test' },
      layers: {
        errors: noopErrors({ silent: true }),
      } as any,
      scopes: scope({ type: 'system', label: 'System', urlPrefix: '/s' }),
    })

    const server = createServer({ config, tools: [] })
    await server.start()

    const errorLayer = getLayer('errors')
    expect(typeof errorLayer.capture).toBe('function')
    expect(typeof errorLayer.setUser).toBe('function')
    expect(typeof errorLayer.addBreadcrumb).toBe('function')

    // These should not throw
    errorLayer.capture(new Error('test'), { userId: 'usr_1' })
    errorLayer.setUser({ id: 'usr_1' })
    errorLayer.addBreadcrumb('test breadcrumb', { key: 'value' })

    await server.shutdown()
  })

  it('error middleware uses error layer when available', async () => {
    let capturedError: Error | null = null

    // Create a custom noop that tracks captures
    const { Layer } = await import('effect')
    const { createLayerConfig, getLayerTag } = await import('@ydtb/anvil-server')

    const ErrorTag = getLayerTag<import('../index.ts').ErrorLayer>('errors')
    const trackingErrors = createLayerConfig(
      'errors',
      Layer.succeed(ErrorTag, {
        capture: (err: Error) => { capturedError = err },
        setUser: () => {},
        addBreadcrumb: () => {},
      }),
    )

    const config = defineApp({
      brand: { name: 'Tracking Test' },
      layers: {
        errors: trackingErrors,
      } as any,
      scopes: scope({ type: 'system', label: 'System', urlPrefix: '/s' }),
    })

    const server = createServer({ config, tools: [] })

    // Add a route that throws BEFORE start
    server.app.get('/api/boom', () => {
      throw new Error('kaboom')
    })

    await server.start()

    const res = await server.app.request('/api/boom')
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Internal server error')

    // Error was reported to the error layer
    expect(capturedError).not.toBeNull()
    expect(capturedError!.message).toBe('kaboom')

    await server.shutdown()
  })
})
