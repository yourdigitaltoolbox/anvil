/**
 * Tests for @ydtb/anvil-toolkit
 *
 * Proves:
 * - Tool/scope/surface definitions work
 * - AppConfig.scopes augmentation works
 * - createToolServer boots with tool surfaces
 * - collectTools extracts tools from scope tree
 * - toolkitModules generates virtual module source
 */

import { describe, it, expect, afterEach } from 'vitest'
import { defineApp } from '@ydtb/anvil'
import { provideLayerResolver, provideHookSystem, provideContributions, provideLoggingLayerResolver } from '@ydtb/anvil-server'
import {
  defineTool,
  scope,
  defineClient,
  defineServer,
  createToolServer,
  toolEntry,
  collectTools,
  assembleRoutes,
} from '../index.ts'
import { toolkitModules } from '../build-modules.ts'
import { Hono } from 'hono'

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
// Definitions
// ---------------------------------------------------------------------------

describe('toolkit definitions', () => {
  it('defineTool creates a tool descriptor', () => {
    const tool = defineTool({ id: 'contacts', name: 'Contacts', package: '@myapp/contacts' })
    expect(tool.id).toBe('contacts')
    expect(tool.name).toBe('Contacts')
    expect(tool.package).toBe('@myapp/contacts')
  })

  it('scope creates a scope definition with children', () => {
    const tree = scope({
      type: 'system',
      label: 'System',
      urlPrefix: '/s',
      children: [
        scope({ type: 'company', label: 'Company', urlPrefix: '/c/$scopeId' }),
      ],
    })
    expect(tree.type).toBe('system')
    expect(tree.children).toHaveLength(1)
    expect(tree.children![0].type).toBe('company')
  })

  it('defineClient creates a client surface', () => {
    const client = defineClient({
      routes: [{ path: 'test', component: () => null }],
      navigation: [{ label: 'Test', path: 'test', icon: 'X' }],
    })
    expect(client.routes).toHaveLength(1)
    expect(client.navigation).toHaveLength(1)
  })

  it('defineServer creates a server surface', () => {
    const server = defineServer({
      hooks: { actions: { 'test:ping': () => 'pong' } },
    })
    expect(server.hooks?.actions?.['test:ping']).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// AppConfig augmentation
// ---------------------------------------------------------------------------

describe('AppConfig augmentation', () => {
  it('defineApp accepts scopes field when toolkit is imported', () => {
    const contacts = defineTool({ id: 'contacts', name: 'Contacts', package: '@myapp/contacts' })

    const config = defineApp({
      brand: { name: 'Test' },
      layers: {} as any,
      scopes: scope({
        type: 'system',
        label: 'System',
        urlPrefix: '/s',
        includes: [contacts],
      }),
    })

    expect(config.brand.name).toBe('Test')
    expect((config.scopes as any).type).toBe('system')
  })
})

// ---------------------------------------------------------------------------
// collectTools
// ---------------------------------------------------------------------------

describe('collectTools', () => {
  it('extracts deduplicated tools from scope tree', () => {
    const a = defineTool({ id: 'a', name: 'A', package: '@test/a' })
    const b = defineTool({ id: 'b', name: 'B', package: '@test/b' })

    const config = defineApp({
      brand: { name: 'Test' },
      layers: {} as any,
      scopes: scope({
        type: 'root',
        label: 'Root',
        urlPrefix: '/r',
        includes: [a],
        children: [
          scope({ type: 'child', label: 'Child', urlPrefix: '/c/$id', includes: [a, b] }),
        ],
      }),
    })

    const tools = collectTools(config)
    expect(tools).toHaveLength(2)
    expect(tools.map(t => t.id)).toContain('a')
    expect(tools.map(t => t.id)).toContain('b')
  })
})

// ---------------------------------------------------------------------------
// createToolServer
// ---------------------------------------------------------------------------

describe('createToolServer', () => {
  it('boots with tool surfaces and registers hooks', async () => {
    const router = new Hono()
    router.get('/hello', (c) => c.json({ hello: true }))

    const toolSurface = defineServer({
      router,
      hooks: { actions: { 'test:greet': () => 'hi' } },
    })

    const config = defineApp({
      brand: { name: 'Tool Server Test' },
      layers: {} as any,
    })

    const server = createToolServer({
      config,
      tools: [toolEntry('test', toolSurface)],
    })

    await server.start()

    // Tool route mounted
    const res = await server.app.request('/api/test/hello')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.hello).toBe(true)

    // Health check
    const health = await server.app.request('/healthz')
    expect(health.status).toBe(200)

    await server.shutdown()
  })
})

// ---------------------------------------------------------------------------
// toolkitModules
// ---------------------------------------------------------------------------

describe('toolkitModules', () => {
  it('returns virtual module generators', () => {
    const config = defineApp({
      brand: { name: 'Build Test' },
      layers: {} as any,
      scopes: scope({ type: 'root', label: 'Root', urlPrefix: '/r' }),
    })

    const modules = toolkitModules(config)
    expect(modules['virtual:anvil/server-tools']).toBeDefined()
    expect(modules['virtual:anvil/client-tools']).toBeDefined()
    expect(modules['virtual:anvil/schema']).toBeDefined()
    expect(modules['virtual:anvil/scope-tree']).toBeDefined()
    expect(modules['virtual:anvil/permissions']).toBeDefined()
    expect(modules['virtual:anvil/extensions']).toBeDefined()

    // Generators produce valid strings
    const serverTools = modules['virtual:anvil/server-tools'](config)
    expect(serverTools).toContain('export const tools')
  })
})

// ---------------------------------------------------------------------------
// assembleRoutes
// ---------------------------------------------------------------------------

describe('assembleRoutes', () => {
  it('groups routes by scope from tool surfaces', () => {
    const contacts = defineTool({ id: 'contacts', name: 'Contacts', package: '@test/contacts' })

    const scopeTree = scope({
      type: 'root',
      label: 'Root',
      urlPrefix: '/r',
      includes: [contacts],
    })

    const toolSurfaces = [
      {
        id: 'contacts',
        surface: defineClient({
          routes: [{ path: 'list', component: () => null }],
          navigation: [{ label: 'Contacts', path: 'list', icon: 'X' }],
        }),
      },
    ]

    const routes = assembleRoutes(scopeTree, toolSurfaces)
    expect(routes.scopes.routes).toHaveLength(1)
    expect(routes.scopes.routes[0].toolId).toBe('contacts')
  })
})
