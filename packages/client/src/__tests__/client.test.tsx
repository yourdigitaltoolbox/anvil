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
  ],
  navigation: [
    { label: 'Contacts', path: 'contacts', icon: 'Users' },
  ],
  permissions: [
    { feature: 'contacts', label: 'Contacts', actions: [{ key: 'contacts.view', label: 'View' }] },
  ],
  publicRoutes: [
    { path: 'contact-form', component: DummyComponent },
  ],
}

const billingSurface: Client = {
  routes: [
    { path: 'billing', component: DummyComponent },
  ],
  navigation: [
    { label: 'Billing', path: 'billing', icon: 'CreditCard' },
  ],
  authenticatedRoutes: [
    { path: 'upgrade', component: DummyComponent },
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

  it('collects public routes from all tools', () => {
    const result = assembleRoutes(scopeTree, tools)
    expect(result.publicRoutes).toHaveLength(1)
    expect(result.publicRoutes[0].path).toBe('contact-form')
  })

  it('collects authenticated routes from all tools', () => {
    const result = assembleRoutes(scopeTree, tools)
    expect(result.authenticatedRoutes).toHaveLength(1)
    expect(result.authenticatedRoutes[0].path).toBe('upgrade')
  })

  it('handles empty scope tree', () => {
    const result = assembleRoutes(
      { type: 'system', label: 'System', urlPrefix: '/s' },
      tools,
    )
    expect(result.scopes.routes).toHaveLength(0)
    expect(result.publicRoutes).toHaveLength(1) // still collected from all tools
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
