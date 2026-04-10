/**
 * createAnvilApp — assembles the Anvil context stack around your app's routing.
 *
 * Two usage modes:
 *
 * **Mode 1: Bring your own router (recommended for production apps)**
 * Pass a `router` component (e.g., TanStack Router's `<RouterProvider>`).
 * The framework wraps it with context providers, layer providers, and
 * contribution collection — but the app owns routing entirely.
 *
 * ```tsx
 * import { createAnvilApp } from '@ydtb/anvil-toolkit/client'
 * import { RouterProvider } from '@tanstack/react-router'
 *
 * const { App, contributions, routes } = createAnvilApp({
 *   scopeTree,
 *   tools,
 *   providers: [queryProvider, authProvider, themeProvider],
 *   router: <RouterProvider router={myRouter} />,
 * })
 * ```
 *
 * **Mode 2: Built-in simple router (for prototyping / simple apps)**
 * Omit `router` and the framework uses its own pathname-based router
 * with layout/guard support. Useful for demos and simple apps, but
 * lacks TanStack Router features (nested layouts, search params,
 * preloading, code splitting, scroll restoration).
 *
 * ```tsx
 * const { App } = createAnvilApp({
 *   scopeTree,
 *   tools,
 *   layouts: [publicLayout, authenticatedLayout],
 * })
 * ```
 */

import React, { useEffect, useState, type ReactNode, type ComponentType } from 'react'
import type { ScopeDefinition } from './scope.ts'
import type { RouteEntry } from './client.ts'
import { assembleRoutes } from './assemble-routes.ts'
import type { ToolClientEntry, ScopeRouteGroup, AssembledRoutes } from './assemble-routes.ts'
import {
  ScopeProvider,
  getCurrentScope,
  configureApiClients,
  LayerProvider,
  ContextProviderStack,
  GuardedLayout,
  type ClientLayerMap,
  type RouteLayout,
  type ContextProviderEntry,
} from '@ydtb/anvil-client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnvilAppConfig {
  /** Scope tree from compose.config */
  scopeTree: ScopeDefinition
  /** Tool client surfaces */
  tools: ToolClientEntry[]
  /**
   * External router component — the app owns routing entirely.
   *
   * When provided, the framework wraps this with context providers,
   * layer providers, and contribution collection. The built-in simple
   * router is NOT used.
   *
   * Typically a TanStack Router `<RouterProvider>`:
   * ```tsx
   * router: <RouterProvider router={myRouter} />
   * ```
   *
   * Or any React element that renders your app's routes.
   */
  router?: ReactNode
  /** Route layouts — define containers with guard pipelines (simple router only) */
  layouts?: RouteLayout[]
  /** Context providers — nested in priority order */
  providers?: ContextProviderEntry[]
  /** Client layer implementations */
  layers?: Partial<ClientLayerMap>
  /** API base URL (default: window.location.origin) */
  apiUrl?: string
  /**
   * App-level routes outside any layout (simple router only).
   * Matched before layout routes.
   */
  appRoutes?: Array<{
    path: string
    component: ComponentType
  }>
  /** Component shown while loading (default: null) */
  loadingFallback?: ReactNode
  /** Component shown for 404 (default: "404 — Page not found") */
  notFoundComponent?: ComponentType
}

export interface AnvilApp {
  /** The root React component — mount this */
  App: ComponentType
  /** The assembled route structure (for use when building your own router) */
  routes: AssembledRoutes
  /** The scope route groups */
  scopes: ScopeRouteGroup
  /** Client contributions collected from all tools, grouped by extension */
  contributions: Record<string, Array<Record<string, unknown> & { toolId: string }>>
}

// ---------------------------------------------------------------------------
// Client contribution collection
// ---------------------------------------------------------------------------

/**
 * Collect client-side extension contributions from tool surfaces.
 *
 * Mirrors the server's processSurfaces contribution collection.
 * Any field on a tool's client surface that isn't a core field
 * (routes, navigation, permissions, setup) and matches a registered
 * extension ID is treated as a contribution.
 */
function collectClientContributions(
  tools: ToolClientEntry[],
  extensionIds: Set<string>,
): Record<string, Array<Record<string, unknown> & { toolId: string }>> {
  const coreKeys = new Set(['routes', 'navigation', 'permissions', 'setup'])
  const contributions: Record<string, Array<Record<string, unknown> & { toolId: string }>> = {}

  for (const extId of extensionIds) {
    contributions[extId] = []
  }

  for (const tool of tools) {
    const surface = tool.surface as Record<string, unknown>
    for (const [key, value] of Object.entries(surface)) {
      if (coreKeys.has(key)) continue
      if (!extensionIds.has(key)) continue
      if (value == null) continue
      contributions[key].push({ toolId: tool.id, ...(value as object) })
    }
  }

  return contributions
}

// ---------------------------------------------------------------------------
// createAnvilApp
// ---------------------------------------------------------------------------

export function createAnvilApp(config: AnvilAppConfig): AnvilApp {
  const {
    scopeTree,
    tools,
    router: externalRouter,
    layouts = [],
    providers = [],
    layers = {},
    apiUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
    appRoutes = [],
    loadingFallback = null,
    notFoundComponent: NotFound = () => React.createElement('div', null, '404 — Page not found'),
  } = config

  // Configure API clients
  configureApiClients({
    baseUrl: apiUrl,
    getScope: () => {
      const s = getCurrentScope()
      return { id: s.scopeId, type: s.scopeType }
    },
  })

  // Assemble routes (grouped by layout + by scope)
  const routes = assembleRoutes(scopeTree, tools)

  // Collect client contributions from all non-core surface keys
  const allExtKeys = new Set<string>()
  for (const tool of tools) {
    const surface = tool.surface as Record<string, unknown>
    const coreKeys = new Set(['routes', 'navigation', 'permissions', 'setup'])
    for (const key of Object.keys(surface)) {
      if (!coreKeys.has(key)) allExtKeys.add(key)
    }
  }
  const contributions = collectClientContributions(tools, allExtKeys)

  // Build layout map for quick lookup (used by simple router)
  const layoutMap = new Map<string, RouteLayout>()
  for (const layout of layouts) {
    layoutMap.set(layout.id, layout)
  }

  // -----------------------------------------------------------------------
  // App component
  // -----------------------------------------------------------------------

  function App() {
    // Choose routing: external router OR built-in simple router
    const content = externalRouter ?? <SimpleRouter />

    if (providers.length > 0) {
      return (
        <ContextProviderStack providers={providers}>
          <LayerProvider layers={layers}>
            {content}
          </LayerProvider>
        </ContextProviderStack>
      )
    }

    return (
      <LayerProvider layers={layers}>
        {content}
      </LayerProvider>
    )
  }

  // -----------------------------------------------------------------------
  // Simple Router (used when no external router provided)
  // -----------------------------------------------------------------------

  function SimpleRouter() {
    const [currentPath, setCurrentPath] = useState(
      typeof window !== 'undefined' ? window.location.pathname : '/'
    )

    useEffect(() => {
      const handlePopState = () => setCurrentPath(window.location.pathname)
      window.addEventListener('popstate', handlePopState)
      return () => window.removeEventListener('popstate', handlePopState)
    }, [])

    // 1. Match app-level routes (outside any layout)
    for (const route of appRoutes) {
      if (matchPattern(currentPath, route.path)) {
        const Component = route.component
        return <Component />
      }
    }

    // 2. Match layout-grouped routes
    for (const [layoutId, layoutRoutes] of Object.entries(routes.layouts)) {
      if (layoutId === 'scoped') continue

      for (const route of layoutRoutes) {
        if (matchPattern(currentPath, route.path)) {
          const layout = layoutMap.get(layoutId)
          const Component = resolveComponent(route.component)
          const params = extractParams(currentPath, route.path) ?? {}

          if (layout && layout.guards.length > 0) {
            return (
              <GuardedLayout
                guards={layout.guards}
                layout={layout.layout}
                path={currentPath}
                params={params}
                loadingFallback={loadingFallback}
              >
                <Component />
              </GuardedLayout>
            )
          }

          if (layout) {
            const Layout = layout.layout
            return <Layout><Component /></Layout>
          }

          return <Component />
        }
      }
    }

    // 3. Match scope routes
    const scopeMatch = matchScopeRoute(currentPath, routes.scopes)
    if (scopeMatch) {
      const { route, scopeType, scopeId, params } = scopeMatch
      const Component = resolveComponent(route.component)
      const scopedLayout = layoutMap.get('scoped')

      const inner = (
        <ScopeProvider scopeId={scopeId} scopeType={scopeType}>
          <Component />
        </ScopeProvider>
      )

      if (scopedLayout && scopedLayout.guards.length > 0) {
        return (
          <GuardedLayout
            guards={scopedLayout.guards}
            layout={scopedLayout.layout}
            path={currentPath}
            params={params}
            loadingFallback={loadingFallback}
          >
            {inner}
          </GuardedLayout>
        )
      }

      if (scopedLayout) {
        const Layout = scopedLayout.layout
        return <Layout>{inner}</Layout>
      }

      return inner
    }

    // 4. Not found
    return <NotFound />
  }

  return { App, routes, scopes: routes.scopes, contributions }
}

// ---------------------------------------------------------------------------
// Route matching helpers (used by simple router only)
// ---------------------------------------------------------------------------

interface ScopeRouteMatch {
  route: RouteEntry & { toolId: string }
  scopeType: string
  scopeId: string | null
  params: Record<string, string>
}

function matchScopeRoute(path: string, scope: ScopeRouteGroup): ScopeRouteMatch | null {
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

    for (const route of scope.routes) {
      const routeParams = extractParams(remaining, route.path)
      if (routeParams !== null) {
        return {
          route,
          scopeType: scope.type,
          scopeId: params.scopeId ?? null,
          params: { ...params, ...routeParams },
        }
      }
    }
  }

  for (const child of scope.children) {
    const childMatch = matchScopeRoute(path, child)
    if (childMatch) return childMatch
  }

  return null
}

function matchPattern(path: string, pattern: string): boolean {
  return extractParams(path, pattern) !== null
}

function extractParams(path: string, pattern: string): Record<string, string> | null {
  const pathParts = path.split('/').filter(Boolean)
  const patternParts = pattern.split('/').filter(Boolean)

  if (pathParts.length !== patternParts.length) return null

  const params: Record<string, string> = {}

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':') || patternParts[i].startsWith('$')) {
      params[patternParts[i].replace(/^[$:]/, '')] = pathParts[i]
    } else if (patternParts[i] !== pathParts[i]) {
      return null
    }
  }

  return params
}

function resolveComponent(
  component: ComponentType | (() => Promise<{ default: ComponentType }>)
): ComponentType {
  if (typeof component === 'function' && component.length === 0) {
    try {
      const result = (component as () => unknown)()
      if (result && typeof result === 'object' && 'then' in result) {
        return React.lazy(component as () => Promise<{ default: ComponentType }>)
      }
    } catch {
      // Not a lazy import
    }
  }
  return component as ComponentType
}
