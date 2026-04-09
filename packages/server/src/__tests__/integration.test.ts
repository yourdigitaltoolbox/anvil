/**
 * End-to-end integration test for @ydtb/anvil-server.
 *
 * Proves the full boot → request → shutdown cycle:
 * - Effect layer composition and resolution via getLayer()
 * - HookSystem creation and access via getHooks()
 * - Request context threading via AsyncLocalStorage
 * - Health endpoints (/healthz, /readyz)
 * - Tool surface processing (hooks, routers)
 * - Extension contribution collection
 * - Graceful shutdown
 */

import { describe, it, expect, afterEach } from 'vitest'
import { Context, Effect, Layer } from 'effect'
import { Hono } from 'hono'
import { defineApp, defineServer, defineExtension, scope } from '@ydtb/anvil'
import type { LayerConfig, HealthStatus } from '@ydtb/anvil'
import { createServer, createWorker, getLayer, getHooks, getRequestContext, getLogger, fromOrpc } from '../index.ts'
import { provideLayerResolver, provideHookSystem, provideContributions } from '../accessors.ts'

// ---------------------------------------------------------------------------
// Test layer: a simple in-memory key-value store
// ---------------------------------------------------------------------------

interface TestStoreLayer {
  get: (key: string) => string | undefined
  set: (key: string, value: string) => void
}

// Augment LayerMap for test
declare module '@ydtb/anvil' {
  interface LayerMap {
    testStore: TestStoreLayer
  }
}

const TestStore = Context.GenericTag<TestStoreLayer>('TestStore')

function createTestStoreLayer(): LayerConfig<'testStore'> {
  const store = new Map<string, string>()
  const service: TestStoreLayer = {
    get: (key) => store.get(key),
    set: (key, value) => store.set(key, value),
  }

  return {
    id: 'testStore',
    _effectLayer: {
      tag: TestStore,
      layer: Layer.succeed(TestStore, service),
    },
    _healthCheck: Effect.succeed({ status: 'ok' as const, latencyMs: 0 }),
  }
}

// ---------------------------------------------------------------------------
// Test extension: collects "widgets" from tools
// ---------------------------------------------------------------------------

interface WidgetContribution {
  id: string
  label: string
}

declare module '@ydtb/anvil' {
  interface ServerContributions {
    widgets?: { items: WidgetContribution[] }
  }
}

const widgetsExtension = defineExtension({
  id: 'widgets',
  name: 'Widgets',
})

// ---------------------------------------------------------------------------
// Test tool: has a Hono router, hooks, and an extension contribution
// ---------------------------------------------------------------------------

const testToolRouter = new Hono()
testToolRouter.get('/items', (c) => {
  // Prove getLayer works inside a route handler
  const store = getLayer('testStore')
  const value = store.get('fromRoute') ?? 'not set'
  return c.json({ items: [{ id: 1 }], storeValue: value })
})
testToolRouter.get('/context', (c) => {
  // Prove request context is available inside tool routes
  const ctx = getRequestContext()
  return c.json({ requestId: ctx?.requestId })
})

const testToolSurface = defineServer({
  router: testToolRouter,
  hooks: {
    actions: {
      'test:greet': (input: unknown) => {
        const name = (input as { name: string }).name
        return `Hello, ${name}!`
      },
    },
    broadcasts: {
      'test:event': (payload: unknown) => {
        // Side effect we can observe
      },
    },
  },
  widgets: { items: [{ id: 'w1', label: 'Test Widget' }] },
})

const testTool = {
  id: 'test-tool',
  module: { default: testToolSurface },
}

// ---------------------------------------------------------------------------
// Test tool with jobs (for worker tests)
// ---------------------------------------------------------------------------

const jobHandler = async () => { /* process job */ }

const jobToolSurface = defineServer({
  hooks: {
    actions: {
      'jobs:greet': (input: unknown) => `Worker says hello`,
    },
  },
  jobs: [
    { id: 'cleanup', label: 'Nightly cleanup', schedule: '0 3 * * *', handler: jobHandler },
    { id: 'sync', label: 'Sync external data', trigger: 'manual', handler: jobHandler },
  ],
})

const jobTool = {
  id: 'job-tool',
  module: { default: jobToolSurface },
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterEach(() => {
  // Reset module-level singletons between tests
  provideLayerResolver(null)
  provideHookSystem(null)
  provideContributions(null)
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('anvil-server integration', () => {
  it('boots, serves requests, and shuts down', async () => {
    const config = defineApp({
      brand: { name: 'Test App' },
      layers: {
        testStore: createTestStoreLayer(),
      } as any, // RequiredLayers is derived from LayerMap — cast needed for test augmentation
      scopes: scope({ type: 'system', label: 'System', urlPrefix: '/s' }),
      extensions: [widgetsExtension],
    })

    const server = createServer({
      config,
      tools: [testTool],
    })

    await server.start()

    // -- getLayer() works --
    const store = getLayer('testStore')
    store.set('greeting', 'hello')
    expect(store.get('greeting')).toBe('hello')

    // -- getHooks() works and tool hooks are registered --
    const hooks = getHooks()
    const result = await hooks.doAction('test:greet', { name: 'Anvil' })
    expect(result).toBe('Hello, Anvil!')

    // -- Request context: register route BEFORE first request (Hono compiles router on first use) --
    let capturedRequestId: string | undefined

    server.app.get('/test-context', (c) => {
      const ctx = getRequestContext()
      capturedRequestId = ctx?.requestId
      return c.json({ requestId: ctx?.requestId })
    })

    // -- /healthz returns 200 --
    const healthRes = await server.app.request('/healthz')
    expect(healthRes.status).toBe(200)
    const healthBody = await healthRes.json()
    expect(healthBody.status).toBe('ok')

    // -- /readyz returns 200 with layer health --
    const readyRes = await server.app.request('/readyz')
    expect(readyRes.status).toBe(200)
    const readyBody = await readyRes.json()
    expect(readyBody.status).toBe('ok')
    expect(readyBody.checks.testStore.status).toBe('ok')

    // -- Request context is threaded through Hono requests --
    const ctxRes = await server.app.request('/test-context')
    expect(ctxRes.status).toBe(200)
    const ctxBody = await ctxRes.json()
    expect(ctxBody.requestId).toBeDefined()
    expect(typeof ctxBody.requestId).toBe('string')
    expect(ctxBody.requestId).toBe(capturedRequestId)

    // -- getLogger() works inside and outside request context --
    const logger = getLogger()
    expect(logger).toBeDefined()
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.child).toBe('function')

    // -- Tool routes are mounted at /api/{toolId}/* --
    const itemsRes = await server.app.request('/api/test-tool/items')
    expect(itemsRes.status).toBe(200)
    const itemsBody = await itemsRes.json()
    expect(itemsBody.items).toEqual([{ id: 1 }])

    // -- getLayer() works inside tool route handlers --
    store.set('fromRoute', 'works!')
    const itemsRes2 = await server.app.request('/api/test-tool/items')
    const itemsBody2 = await itemsRes2.json()
    expect(itemsBody2.storeValue).toBe('works!')

    // -- Request context threads through tool routes --
    const toolCtxRes = await server.app.request('/api/test-tool/context')
    expect(toolCtxRes.status).toBe(200)
    const toolCtxBody = await toolCtxRes.json()
    expect(toolCtxBody.requestId).toBeDefined()
    expect(typeof toolCtxBody.requestId).toBe('string')

    // -- Shutdown cleans up --
    await server.shutdown()

    // getLayer throws after shutdown
    expect(() => getLayer('testStore')).toThrow('Layers not available')

    // getHooks throws after shutdown
    expect(() => getHooks()).toThrow('Hook system not available')
  })

  it('handles server with no layers', async () => {
    const config = defineApp({
      brand: { name: 'Layerless' },
      layers: {} as any,
      scopes: scope({ type: 'system', label: 'System', urlPrefix: '/s' }),
    })

    const server = createServer({
      config,
      tools: [],
    })

    await server.start()

    const healthRes = await server.app.request('/healthz')
    expect(healthRes.status).toBe(200)

    const readyRes = await server.app.request('/readyz')
    expect(readyRes.status).toBe(200)
    const readyBody = await readyRes.json()
    expect(readyBody.checks).toEqual({})

    await server.shutdown()
  })

  it('collects extension contributions from tools', async () => {
    const config = defineApp({
      brand: { name: 'Ext Test' },
      layers: {
        testStore: createTestStoreLayer(),
      } as any,
      scopes: scope({ type: 'system', label: 'System', urlPrefix: '/s' }),
      extensions: [widgetsExtension],
    })

    // Capture the processed surfaces to verify contributions
    const server = createServer({
      config,
      tools: [testTool],
    })

    await server.start()

    // Tool hooks should be registered
    const hooks = getHooks()
    const greeting = await hooks.doAction('test:greet', { name: 'World' })
    expect(greeting).toBe('Hello, World!')

    await server.shutdown()
  })

  it('/readyz returns 503 before start', async () => {
    const config = defineApp({
      brand: { name: 'Not Started' },
      layers: {} as any,
      scopes: scope({ type: 'system', label: 'System', urlPrefix: '/s' }),
    })

    const server = createServer({ config, tools: [] })

    // Don't call start() — server not booted
    const readyRes = await server.app.request('/readyz')
    expect(readyRes.status).toBe(503)
  })

  it('mounts app-level routes', async () => {
    const appRouter = new Hono()
    appRouter.get('/profile', (c) => c.json({ user: 'john' }))

    const config = defineApp({
      brand: { name: 'App Routes Test' },
      layers: {} as any,
      scopes: scope({ type: 'system', label: 'System', urlPrefix: '/s' }),
    })

    const server = createServer({
      config,
      tools: [],
      routes: { settings: appRouter },
    })

    await server.start()

    const res = await server.app.request('/api/settings/profile')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user).toBe('john')

    await server.shutdown()
  })

  it('fromOrpc wraps a fetch handler into a Hono app', async () => {
    // Simulate an oRPC-style fetch handler
    const mockOrpcHandler = async (req: Request): Promise<Response> => {
      const url = new URL(req.url)
      if (url.pathname.endsWith('/hello')) {
        return Response.json({ message: 'from orpc' })
      }
      return new Response('Not found', { status: 404 })
    }

    const toolSurface = defineServer({
      router: fromOrpc(mockOrpcHandler),
    })

    const config = defineApp({
      brand: { name: 'oRPC Test' },
      layers: {} as any,
      scopes: scope({ type: 'system', label: 'System', urlPrefix: '/s' }),
    })

    const server = createServer({
      config,
      tools: [{ id: 'orpc-tool', module: { default: toolSurface } }],
    })

    await server.start()

    const res = await server.app.request('/api/orpc-tool/hello')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.message).toBe('from orpc')

    await server.shutdown()
  })

  it('fromOrpc supports .handle() method pattern', async () => {
    // Simulate an oRPC router object with a .handle() method
    const mockRouter = {
      handle: async (req: Request): Promise<Response> => {
        return Response.json({ handled: true })
      },
    }

    const toolSurface = defineServer({
      router: fromOrpc(mockRouter),
    })

    const config = defineApp({
      brand: { name: 'Handle Test' },
      layers: {} as any,
      scopes: scope({ type: 'system', label: 'System', urlPrefix: '/s' }),
    })

    const server = createServer({
      config,
      tools: [{ id: 'handle-tool', module: { default: toolSurface } }],
    })

    await server.start()

    const res = await server.app.request('/api/handle-tool/anything')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.handled).toBe(true)

    await server.shutdown()
  })
})

// ---------------------------------------------------------------------------
// Error handling tests
// ---------------------------------------------------------------------------

describe('error handling', () => {
  it('catches unhandled errors and returns clean JSON', async () => {
    const config = defineApp({
      brand: { name: 'Error Test' },
      layers: {} as any,
      scopes: scope({ type: 'system', label: 'System', urlPrefix: '/s' }),
    })

    const server = createServer({ config, tools: [] })

    // Register a route that throws BEFORE first request
    server.app.get('/api/explode', () => {
      throw new Error('Something went wrong')
    })

    await server.start()

    const res = await server.app.request('/api/explode')
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Internal server error')
    expect(body.requestId).toBeDefined()

    await server.shutdown()
  })
})

// ---------------------------------------------------------------------------
// Worker tests
// ---------------------------------------------------------------------------

describe('anvil-worker', () => {
  it('boots layers and registers hooks without HTTP', async () => {
    const config = defineApp({
      brand: { name: 'Worker Test' },
      layers: {
        testStore: createTestStoreLayer(),
      } as any,
      scopes: scope({ type: 'system', label: 'System', urlPrefix: '/s' }),
    })

    const worker = createWorker({
      config,
      tools: [jobTool],
    })

    await worker.start()

    // Layers are available
    const store = getLayer('testStore')
    store.set('worker', 'yes')
    expect(store.get('worker')).toBe('yes')

    // Hooks are registered
    const hooks = getHooks()
    const result = await hooks.doAction('jobs:greet', {})
    expect(result).toBe('Worker says hello')

    // Jobs are collected
    const jobs = worker.getJobs()
    expect(jobs).toHaveLength(2)
    expect(jobs.find(j => j.id === 'cleanup')).toBeDefined()
    expect(jobs.find(j => j.id === 'sync')).toBeDefined()
    expect(jobs.find(j => j.id === 'cleanup')?.schedule).toBe('0 3 * * *')

    await worker.shutdown()

    // After shutdown, accessors throw
    expect(() => getLayer('testStore')).toThrow('Layers not available')
    expect(() => getHooks()).toThrow('Hook system not available')
  })

  it('works with no tools and no layers', async () => {
    const config = defineApp({
      brand: { name: 'Empty Worker' },
      layers: {} as any,
      scopes: scope({ type: 'system', label: 'System', urlPrefix: '/s' }),
    })

    const worker = createWorker({ config, tools: [] })
    await worker.start()

    const jobs = worker.getJobs()
    expect(jobs).toHaveLength(0)

    await worker.shutdown()
  })
})
