/**
 * Tests for @ydtb/anvil-client
 *
 * Proves:
 * - Route assembly from scope tree + tool surfaces
 * - API client factory configuration and header injection
 * - Client layers (useLayer + LayerProvider)
 * - Scope context (useScope + ScopeProvider)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import React from 'react'
import { renderHook } from '@testing-library/react'
import { defineTool, defineClient, scope, assembleRoutes } from '@ydtb/anvil-toolkit'
import type { ScopeDefinition, Client, ToolClientEntry } from '@ydtb/anvil-toolkit'
import { createApiClient, configureApiClients } from '../api-client.ts'
import { useLayer, LayerProvider } from '../layers.tsx'
import type { ClientLayerMap } from '../layers.tsx'
import { useScope, ScopeProvider, getCurrentScope } from '../scope.tsx'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const DummyComponent = () => null

const contactsSurface: Client = {
  routes: [
    { path: 'contacts', component: DummyComponent },
    { path: 'contacts/:id', component: DummyComponent },
    { path: 'contact-form', component: DummyComponent, layout: 'public' },
  ],
  navigation: [
    { label: 'Contacts', path: 'contacts', icon: 'Users' },
  ],
  permissions: [
    { feature: 'contacts', label: 'Contacts', actions: [{ key: 'contacts.view', label: 'View' }] },
  ],
}

const billingSurface: Client = {
  routes: [
    { path: 'billing', component: DummyComponent },
    { path: 'upgrade', component: DummyComponent, layout: 'authenticated' },
  ],
  navigation: [
    { label: 'Billing', path: 'billing', icon: 'CreditCard' },
  ],
}

const dashboardSurface: Client = {
  routes: [
    { path: 'dashboard', component: DummyComponent },
  ],
  navigation: [
    { label: 'Dashboard', path: 'dashboard', icon: 'Home' },
  ],
}

const tools: ToolClientEntry[] = [
  { id: 'contacts', surface: contactsSurface },
  { id: 'billing', surface: billingSurface },
  { id: 'dashboard', surface: dashboardSurface },
]

const scopeTree: ScopeDefinition = {
  type: 'system',
  label: 'System',
  urlPrefix: '/s',
  includes: [
    defineTool({ id: 'dashboard', name: 'Dashboard', package: '@myapp/dashboard' }),
  ],
  children: [
    {
      type: 'company',
      label: 'Company',
      urlPrefix: '/c/$scopeId',
      includes: [
        defineTool({ id: 'dashboard', name: 'Dashboard', package: '@myapp/dashboard' }),
        defineTool({ id: 'billing', name: 'Billing', package: '@myapp/billing' }),
      ],
      children: [
        {
          type: 'location',
          label: 'Location',
          urlPrefix: '/l/$scopeId',
          includes: [
            defineTool({ id: 'dashboard', name: 'Dashboard', package: '@myapp/dashboard' }),
            defineTool({ id: 'billing', name: 'Billing', package: '@myapp/billing' }),
            defineTool({ id: 'contacts', name: 'Contacts', package: '@myapp/contacts' }),
          ],
        },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Route assembly
// ---------------------------------------------------------------------------

describe('assembleRoutes', () => {
  it('groups routes by scope type', () => {
    const result = assembleRoutes(scopeTree, tools)

    // System scope — only dashboard
    expect(result.scopes.type).toBe('system')
    expect(result.scopes.routes).toHaveLength(1)
    expect(result.scopes.routes[0].toolId).toBe('dashboard')

    // Company scope — dashboard + billing
    const company = result.scopes.children[0]
    expect(company.type).toBe('company')
    expect(company.routes).toHaveLength(2)
    expect(company.routes.map((r) => r.toolId)).toContain('dashboard')
    expect(company.routes.map((r) => r.toolId)).toContain('billing')

    // Location scope — dashboard + billing + contacts
    const location = company.children[0]
    expect(location.type).toBe('location')
    expect(location.routes).toHaveLength(4) // dashboard(1) + billing(1) + contacts(2)
  })

  it('collects navigation per scope', () => {
    const result = assembleRoutes(scopeTree, tools)

    expect(result.scopes.navigation).toHaveLength(1) // dashboard only
    expect(result.scopes.children[0].navigation).toHaveLength(2) // dashboard + billing
  })

  it('groups routes by layout', () => {
    const result = assembleRoutes(scopeTree, tools)
    expect(result.layouts.public).toHaveLength(1)
    expect(result.layouts.public[0].path).toBe('contact-form')
    expect(result.layouts.authenticated).toHaveLength(1)
    expect(result.layouts.authenticated[0].path).toBe('upgrade')
  })

  it('handles empty scope tree', () => {
    const result = assembleRoutes(
      { type: 'system', label: 'System', urlPrefix: '/s' },
      tools,
    )
    expect(result.scopes.routes).toHaveLength(0)
    expect(result.layouts.public).toHaveLength(1) // still collected from all tools
  })
})

// ---------------------------------------------------------------------------
// API client factory
// ---------------------------------------------------------------------------

describe('createApiClient', () => {
  beforeEach(() => {
    configureApiClients({
      baseUrl: 'http://localhost:3000',
      getScope: () => ({ id: 'co_123', type: 'company' }),
    })
  })

  it('returns a descriptor with URL builder', () => {
    const client = createApiClient('contacts')
    expect(client.toolId).toBe('contacts')
    expect(client.url()).toBe('http://localhost:3000/api/contacts')
  })

  it('includes scope headers', () => {
    const client = createApiClient('contacts')
    const headers = client.headers()
    expect(headers['x-scope-id']).toBe('co_123')
    expect(headers['x-scope-type']).toBe('company')
  })

  it('reads scope lazily on each call', () => {
    let currentId = 'co_1'
    configureApiClients({
      baseUrl: 'http://localhost:3000',
      getScope: () => ({ id: currentId, type: 'company' }),
    })

    const client = createApiClient('billing')

    expect(client.headers()['x-scope-id']).toBe('co_1')
    currentId = 'co_2'
    expect(client.headers()['x-scope-id']).toBe('co_2')
  })

  it('works without scope', () => {
    configureApiClients({ baseUrl: 'http://localhost:3000' })
    const client = createApiClient('contacts')
    const headers = client.headers()
    expect(headers['x-scope-id']).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Client layers
// ---------------------------------------------------------------------------

// Augment ClientLayerMap for tests
declare module '../layers.tsx' {
  interface ClientLayerMap {
    analytics: { track: (event: string) => void }
    featureFlags: { isEnabled: (flag: string) => boolean }
  }
}

describe('useLayer', () => {
  it('returns the layer from LayerProvider', () => {
    const mockTrack = () => {}
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <LayerProvider layers={{ analytics: { track: mockTrack } }}>
        {children}
      </LayerProvider>
    )

    const { result } = renderHook(() => useLayer('analytics'), { wrapper })
    expect(result.current.track).toBe(mockTrack)
  })

  it('throws when called outside LayerProvider', () => {
    expect(() => {
      renderHook(() => useLayer('analytics'))
    }).toThrow('outside a LayerProvider')
  })

  it('throws when layer is not provided', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <LayerProvider layers={{}}>
        {children}
      </LayerProvider>
    )

    expect(() => {
      renderHook(() => useLayer('analytics'), { wrapper })
    }).toThrow("not provided")
  })
})

// ---------------------------------------------------------------------------
// Scope context
// ---------------------------------------------------------------------------

describe('useScope', () => {
  it('returns scope from ScopeProvider', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ScopeProvider scopeId="co_123" scopeType="company">
        {children}
      </ScopeProvider>
    )

    const { result } = renderHook(() => useScope(), { wrapper })
    expect(result.current.scopeId).toBe('co_123')
    expect(result.current.scopeType).toBe('company')
  })

  it('defaults to null when no ScopeProvider', () => {
    const { result } = renderHook(() => useScope())
    expect(result.current.scopeId).toBeNull()
    expect(result.current.scopeType).toBeNull()
  })

  it('getCurrentScope returns module-level ref', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ScopeProvider scopeId="loc_456" scopeType="location">
        {children}
      </ScopeProvider>
    )

    renderHook(() => useScope(), { wrapper })
    const scope = getCurrentScope()
    expect(scope.scopeId).toBe('loc_456')
    expect(scope.scopeType).toBe('location')
  })
})

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

import { defineGuard, runGuardPipeline, defineRouteLayout } from '../index.ts'

describe('defineGuard', () => {
  it('creates a guard with id and check', () => {
    const guard = defineGuard({
      id: 'test',
      check: () => ({ pass: true }),
    })
    expect(guard.id).toBe('test')
    expect(typeof guard.check).toBe('function')
  })
})

describe('runGuardPipeline', () => {
  it('passes when all guards pass', async () => {
    const guard1 = defineGuard({
      id: 'a',
      check: () => ({ pass: true, context: { userId: 'usr_1' } }),
    })
    const guard2 = defineGuard({
      id: 'b',
      check: (ctx) => ({ pass: true, context: { role: 'admin', user: ctx.data.userId } }),
    })

    const result = await runGuardPipeline([guard1, guard2], { path: '/test', params: {} })

    expect('passed' in result && result.passed).toBe(true)
    if ('passed' in result) {
      expect(result.data.userId).toBe('usr_1')
      expect(result.data.role).toBe('admin')
      expect(result.data.user).toBe('usr_1')
    }
  })

  it('stops at first redirect', async () => {
    const guard1 = defineGuard({
      id: 'auth',
      check: () => ({ redirect: '/login' }),
    })
    const guard2 = defineGuard({
      id: 'scope',
      check: () => ({ pass: true }),
    })

    const result = await runGuardPipeline([guard1, guard2], { path: '/test', params: {} })

    expect('redirect' in result).toBe(true)
    if ('redirect' in result) {
      expect(result.redirect).toBe('/login')
    }
  })

  it('stops at first render fallback', async () => {
    const Fallback = () => null
    const guard = defineGuard({
      id: 'check',
      check: () => ({ render: Fallback }),
    })

    const result = await runGuardPipeline([guard], { path: '/test', params: {} })

    expect('render' in result).toBe(true)
    if ('render' in result) {
      expect(result.render).toBe(Fallback)
    }
  })

  it('passes context from earlier guards to later ones', async () => {
    let capturedData: Record<string, unknown> = {}

    const guard1 = defineGuard({
      id: 'auth',
      check: () => ({ pass: true, context: { userId: 'usr_1' } }),
    })
    const guard2 = defineGuard({
      id: 'scope',
      check: (ctx) => {
        capturedData = { ...ctx.data }
        return { pass: true }
      },
    })

    await runGuardPipeline([guard1, guard2], { path: '/test', params: {} })
    expect(capturedData.userId).toBe('usr_1')
  })

  it('passes URL params to guards', async () => {
    let capturedParams: Record<string, string> = {}

    const guard = defineGuard({
      id: 'check',
      check: (ctx) => {
        capturedParams = ctx.params
        return { pass: true }
      },
    })

    await runGuardPipeline([guard], { path: '/w/co_123', params: { scopeId: 'co_123' } })
    expect(capturedParams.scopeId).toBe('co_123')
  })

  it('works with empty pipeline', async () => {
    const result = await runGuardPipeline([], { path: '/test', params: {} })
    expect('passed' in result && result.passed).toBe(true)
  })

  it('works with async guards', async () => {
    const guard = defineGuard({
      id: 'async',
      check: async () => {
        await new Promise(r => setTimeout(r, 10))
        return { pass: true, context: { async: true } }
      },
    })

    const result = await runGuardPipeline([guard], { path: '/test', params: {} })
    expect('passed' in result && result.passed).toBe(true)
    if ('passed' in result) {
      expect(result.data.async).toBe(true)
    }
  })
})

describe('defineRouteLayout', () => {
  it('creates a layout with defaults', () => {
    const layout = defineRouteLayout({
      id: 'workspace',
      urlPrefix: '/w/$scopeId',
      layout: ({ children }) => React.createElement('div', null, children),
      guards: [],
    })

    expect(layout.id).toBe('workspace')
    expect(layout.urlPrefix).toBe('/w/$scopeId')
    expect(layout.priority).toBe(100)
    expect(layout.guards).toEqual([])
  })

  it('accepts custom priority', () => {
    const layout = defineRouteLayout({
      id: 'public',
      layout: ({ children }) => React.createElement('div', null, children),
      guards: [],
      priority: 10,
    })

    expect(layout.priority).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// Context providers
// ---------------------------------------------------------------------------

import { defineContextProvider, ContextProviderStack } from '../index.ts'
import { render } from '@testing-library/react'

describe('defineContextProvider', () => {
  it('creates a provider entry with default priority', () => {
    const entry = defineContextProvider({
      id: 'test',
      provider: ({ children }) => React.createElement('div', null, children),
    })
    expect(entry.id).toBe('test')
    expect(entry.priority).toBe(100)
  })

  it('accepts custom priority', () => {
    const entry = defineContextProvider({
      id: 'early',
      provider: ({ children }) => React.createElement('div', null, children),
      priority: 10,
    })
    expect(entry.priority).toBe(10)
  })
})

describe('ContextProviderStack', () => {
  it('renders children inside nested providers', () => {
    const log: string[] = []

    const ProviderA = ({ children }: { children: React.ReactNode }) => {
      log.push('A')
      return React.createElement('div', { 'data-provider': 'A' }, children)
    }
    const ProviderB = ({ children }: { children: React.ReactNode }) => {
      log.push('B')
      return React.createElement('div', { 'data-provider': 'B' }, children)
    }

    const providers = [
      defineContextProvider({ id: 'a', provider: ProviderA, priority: 10 }),
      defineContextProvider({ id: 'b', provider: ProviderB, priority: 20 }),
    ]

    const { container } = render(
      React.createElement(ContextProviderStack, { providers }, 'Content')
    )

    // A (priority 10) should be outermost, B (priority 20) innermost
    expect(log).toEqual(['A', 'B'])
    expect(container.textContent).toBe('Content')
  })

  it('sorts by priority regardless of array order', () => {
    const log: string[] = []

    const Late = ({ children }: { children: React.ReactNode }) => {
      log.push('late')
      return React.createElement('span', null, children)
    }
    const Early = ({ children }: { children: React.ReactNode }) => {
      log.push('early')
      return React.createElement('span', null, children)
    }

    const providers = [
      defineContextProvider({ id: 'late', provider: Late, priority: 50 }),
      defineContextProvider({ id: 'early', provider: Early, priority: 10 }),
    ]

    render(React.createElement(ContextProviderStack, { providers }, 'X'))

    // Early renders first (outermost), Late renders second (innermost)
    expect(log).toEqual(['early', 'late'])
  })

  it('works with empty providers', () => {
    const { container } = render(
      React.createElement(ContextProviderStack, { providers: [] }, 'bare')
    )
    expect(container.textContent).toBe('bare')
  })
})
