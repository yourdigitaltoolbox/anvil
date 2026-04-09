/**
 * createAnvilApp — assembles a React app from Anvil's composition config.
 *
 * Handles the 80% case: scope-aware routing, auth gate, provider hierarchy,
 * and tool surface wiring. The app can customize via options.
 *
 * @example
 * ```tsx
 * import { createAnvilApp } from '@ydtb/anvil-client'
 *
 * const { App, router } = createAnvilApp({
 *   scopeTree,
 *   tools: toolClientSurfaces,
 *   auth: {
 *     loginPath: '/login',
 *     apiUrl: 'http://localhost:3001',
 *   },
 *   layers: { analytics: posthog({ apiKey: '...' }) },
 *   renderLayout: ({ children, scope }) => (
 *     <DashboardLayout scope={scope}>{children}</DashboardLayout>
 *   ),
 * })
 *
 * // Mount the app
 * createRoot(document.getElementById('app')!).render(<App />)
 * ```
 */

import React, { useEffect, useState, type ReactNode, type ComponentType } from 'react'
import type { ScopeDefinition, Client } from '@ydtb/anvil'
import { assembleRoutes } from './assemble-routes.ts'
import type { ToolClientEntry, ScopeRouteGroup } from './assemble-routes.ts'
import { ScopeProvider, getCurrentScope } from './scope.tsx'
import { LayerProvider, type ClientLayerMap } from './layers.tsx'
import { configureApiClients } from './api-client.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnvilAppConfig {
  /** Scope tree from compose.config */
  scopeTree: ScopeDefinition
  /** Tool client surfaces — from virtual:anvil/client-tools or manual wiring */
  tools: ToolClientEntry[]
  /** Auth configuration */
  auth?: {
    /** Path to redirect to when not authenticated (default: '/login') */
    loginPath?: string
    /** API base URL for configuring API clients (default: window.location.origin) */
    apiUrl?: string
    /** Function to check if user is authenticated */
    isAuthenticated?: () => boolean | Promise<boolean>
  }
  /** Client layer implementations (analytics, feature flags, etc.) */
  layers?: Partial<ClientLayerMap>
  /**
   * Custom layout wrapper for scope pages.
   * Receives the current scope info and children to render.
   */
  renderLayout?: ComponentType<{
    children: ReactNode
    scopeType: string | null
    scopeId: string | null
  }>
  /**
   * App-level routes that exist outside scopes.
   * Rendered at the top level alongside scope routes.
   */
  appRoutes?: Array<{
    path: string
    component: ComponentType
  }>
  /**
   * Additional React providers to wrap the app in.
   * Applied outermost-first (first in array = outermost provider).
   */
  providers?: Array<ComponentType<{ children: ReactNode }>>
}

export interface AnvilApp {
  /** The root React component — mount this */
  App: ComponentType
  /** The assembled route structure — for custom router integration */
  routes: ReturnType<typeof assembleRoutes>
  /** The scope route groups — for building navigation */
  scopes: ScopeRouteGroup
}

// ---------------------------------------------------------------------------
// createAnvilApp
// ---------------------------------------------------------------------------

/**
 * Create a mountable React app from Anvil's composition config.
 *
 * This handles:
 * - Route assembly from scope tree + tool surfaces
 * - API client configuration with scope header injection
 * - Provider hierarchy (layers, scope, auth, custom providers)
 * - Auth gate (redirects to login if not authenticated)
 *
 * The returned App component can be mounted directly:
 * ```tsx
 * const { App } = createAnvilApp({ ... })
 * createRoot(document.getElementById('app')!).render(<App />)
 * ```
 *
 * For custom router integration (TanStack Router, React Router),
 * use the returned `routes` and `scopes` data to build your own
 * router setup. The App component uses a simple hash-based router
 * for zero-dependency operation.
 */
export function createAnvilApp(config: AnvilAppConfig): AnvilApp {
  const {
    scopeTree,
    tools,
    auth = {},
    layers = {},
    renderLayout: Layout,
    appRoutes = [],
    providers = [],
  } = config

  const {
    loginPath = '/login',
    apiUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
    isAuthenticated,
  } = auth

  // Configure API clients for all tools
  configureApiClients({
    baseUrl: apiUrl,
    getScope: () => {
      const s = getCurrentScope()
      return { id: s.scopeId, type: s.scopeType }
    },
  })

  // Assemble routes
  const routes = assembleRoutes(scopeTree, tools)

  // Build the App component
  function App() {
    // Wrap in providers (outermost first)
    let content: ReactNode = <AppContent />

    // Layer provider
    content = <LayerProvider layers={layers}>{content}</LayerProvider>

    // Custom providers (outermost first = first in array wraps everything)
    for (let i = providers.length - 1; i >= 0; i--) {
      const Provider = providers[i]
      content = <Provider>{content}</Provider>
    }

    return <>{content}</>
  }

  function AppContent() {
    const [currentPath, setCurrentPath] = useState(
      typeof window !== 'undefined' ? window.location.pathname : '/'
    )

    // Listen for navigation
    useEffect(() => {
      const handlePopState = () => setCurrentPath(window.location.pathname)
      window.addEventListener('popstate', handlePopState)
      return () => window.removeEventListener('popstate', handlePopState)
    }, [])

    // Auth gate
    const [authed, setAuthed] = useState<boolean | null>(isAuthenticated ? null : true)
    useEffect(() => {
      if (!isAuthenticated) return
      Promise.resolve(isAuthenticated()).then(setAuthed)
    }, [currentPath])

    if (authed === null) return <div>Loading...</div>
    if (authed === false && currentPath !== loginPath) {
      if (typeof window !== 'undefined') window.location.href = loginPath
      return null
    }

    // Match route against assembled routes
    const match = matchRoute(currentPath, routes, appRoutes)

    if (!match) {
      return <div>404 — Page not found</div>
    }

    if (match.type === 'app') {
      const Component = match.component
      return <Component />
    }

    // Scope route — wrap in ScopeProvider and optional layout
    const Wrapper = Layout ?? DefaultLayout

    return (
      <ScopeProvider scopeId={match.scopeId} scopeType={match.scopeType}>
        <Wrapper scopeType={match.scopeType} scopeId={match.scopeId}>
          <match.component />
        </Wrapper>
      </ScopeProvider>
    )
  }

  return { App, routes, scopes: routes.scopes }
}

// ---------------------------------------------------------------------------
// Simple route matching (framework-provided, apps can replace with TanStack Router)
// ---------------------------------------------------------------------------

interface RouteMatch {
  type: 'scope' | 'app' | 'public'
  component: ComponentType
  scopeType: string | null
  scopeId: string | null
}

function matchRoute(
  path: string,
  routes: ReturnType<typeof assembleRoutes>,
  appRoutes: Array<{ path: string; component: ComponentType }>,
): RouteMatch | null {
  const pathParts = path.split('/').filter(Boolean)

  // Check app-level routes first
  for (const route of appRoutes) {
    if (matchPattern(path, route.path)) {
      return { type: 'app', component: route.component, scopeType: null, scopeId: null }
    }
  }

  // Check public routes
  for (const route of routes.publicRoutes) {
    if (matchPattern(path, route.path)) {
      const Component = resolveComponent(route.component)
      return { type: 'public', component: Component, scopeType: null, scopeId: null }
    }
  }

  // Check authenticated routes
  for (const route of routes.authenticatedRoutes) {
    if (matchPattern(path, route.path)) {
      const Component = resolveComponent(route.component)
      return { type: 'app', component: Component, scopeType: null, scopeId: null }
    }
  }

  // Check scope routes
  const scopeMatch = matchScopeRoutes(path, routes.scopes)
  if (scopeMatch) return scopeMatch

  return null
}

function matchScopeRoutes(path: string, scope: ScopeRouteGroup): RouteMatch | null {
  // Try to match this scope's URL prefix
  const prefixParts = scope.urlPrefix.split('/').filter(Boolean)
  const pathParts = path.split('/').filter(Boolean)

  if (pathParts.length < prefixParts.length) return null

  const params: Record<string, string> = {}
  let prefixMatch = true

  for (let i = 0; i < prefixParts.length; i++) {
    if (prefixParts[i].startsWith('$') || prefixParts[i].startsWith(':')) {
      params[prefixParts[i].replace(/^[$:]/, '')] = pathParts[i]
    } else if (prefixParts[i] !== pathParts[i]) {
      prefixMatch = false
      break
    }
  }

  if (prefixMatch) {
    const remaining = '/' + pathParts.slice(prefixParts.length).join('/')

    // Try to match a route within this scope
    for (const route of scope.routes) {
      if (matchPattern(remaining, route.path)) {
        const Component = resolveComponent(route.component)
        return {
          type: 'scope',
          component: Component,
          scopeType: scope.type,
          scopeId: params.scopeId ?? null,
        }
      }
    }
  }

  // Try children
  for (const child of scope.children) {
    const childMatch = matchScopeRoutes(path, child)
    if (childMatch) return childMatch
  }

  return null
}

function matchPattern(path: string, pattern: string): boolean {
  const pathParts = path.split('/').filter(Boolean)
  const patternParts = pattern.split('/').filter(Boolean)

  if (pathParts.length !== patternParts.length) return false

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':') || patternParts[i].startsWith('$')) continue
    if (patternParts[i] !== pathParts[i]) return false
  }

  return true
}

function resolveComponent(
  component: ComponentType | (() => Promise<{ default: ComponentType }>)
): ComponentType {
  // For lazy imports, return a simple wrapper
  // In a real app with TanStack Router, this would be handled by the router
  if (typeof component === 'function' && component.length === 0) {
    try {
      const result = (component as () => unknown)()
      if (result && typeof result === 'object' && 'then' in result) {
        // Lazy import — return a suspense-compatible wrapper
        return React.lazy(component as () => Promise<{ default: ComponentType }>)
      }
    } catch {
      // Not a lazy import — it's a regular component
    }
  }
  return component as ComponentType
}

function DefaultLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
