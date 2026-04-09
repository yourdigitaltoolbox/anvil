/**
 * Route assembly — builds scope-aware route structure from tool surfaces.
 *
 * Takes the scope tree and tool client surfaces, produces a structured
 * route map that a router (TanStack Router, React Router, etc.) can consume.
 *
 * This is a pure function with no React dependency — it produces data
 * that the framework's createApp() or a custom router setup can use.
 *
 * @example
 * ```ts
 * import { assembleRoutes } from '@ydtb/anvil-client'
 *
 * const routeMap = assembleRoutes(scopeTree, toolSurfaces)
 * // routeMap.scopes[0].routes → routes for the system scope
 * // routeMap.authenticated → app-level authenticated routes
 * // routeMap.public → public routes
 * ```
 */

import type { ScopeDefinition } from './scope.ts'
import type { Client, RouteEntry } from './client.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolClientEntry {
  id: string
  surface: Client
}

export interface ScopeRouteGroup {
  /** Scope type (e.g., 'system', 'company', 'location') */
  type: string
  /** Scope label */
  label: string
  /** URL prefix pattern (e.g., '/c/$scopeId') */
  urlPrefix: string
  /** Routes from tools included in this scope */
  routes: Array<RouteEntry & { toolId: string }>
  /** Navigation entries from tools included in this scope */
  navigation: Array<{ toolId: string; label: string; path: string; icon: unknown; position?: string; pinned?: boolean }>
  /** Child scope groups */
  children: ScopeRouteGroup[]
}

export interface AssembledRoutes {
  /** Scope-grouped routes — nested like the scope tree */
  scopes: ScopeRouteGroup
  /** Public routes (no auth required) — from all tools */
  publicRoutes: Array<RouteEntry & { toolId: string }>
  /** Authenticated routes (auth required, no scope) — from all tools */
  authenticatedRoutes: Array<RouteEntry & { toolId: string }>
  /** Fullscreen routes (no scope chrome) — from all tools */
  fullscreenRoutes: Array<RouteEntry & { toolId: string }>
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * Assemble routes from tool client surfaces organized by scope.
 *
 * For each scope in the tree, collects routes and navigation from tools
 * that are included in that scope. Also collects non-scoped routes
 * (public, authenticated, fullscreen) from all tools.
 */
export function assembleRoutes(
  scopeTree: ScopeDefinition,
  tools: ToolClientEntry[],
): AssembledRoutes {
  const toolMap = new Map(tools.map((t) => [t.id, t]))

  // Collect non-scoped routes from all tools
  const publicRoutes: Array<RouteEntry & { toolId: string }> = []
  const authenticatedRoutes: Array<RouteEntry & { toolId: string }> = []
  const fullscreenRoutes: Array<RouteEntry & { toolId: string }> = []

  for (const tool of tools) {
    const s = tool.surface
    if (s.publicRoutes) {
      publicRoutes.push(...s.publicRoutes.map((r) => ({ ...r, toolId: tool.id })))
    }
    if (s.authenticatedRoutes) {
      authenticatedRoutes.push(...s.authenticatedRoutes.map((r) => ({ ...r, toolId: tool.id })))
    }
    if (s.fullscreenRoutes) {
      fullscreenRoutes.push(...s.fullscreenRoutes.map((r) => ({ ...r, toolId: tool.id })))
    }
  }

  // Build scope tree with routes
  function buildScopeGroup(scope: ScopeDefinition): ScopeRouteGroup {
    const routes: Array<RouteEntry & { toolId: string }> = []
    const navigation: ScopeRouteGroup['navigation'] = []

    for (const toolDesc of scope.includes ?? []) {
      const tool = toolMap.get(toolDesc.id)
      if (!tool) continue

      const s = tool.surface
      if (s.routes) {
        // Filter routes by scope type if the route specifies scope filtering
        const scopeRoutes = s.routes.filter(
          (r) => !r.scope || r.scope.includes(scope.type)
        )
        routes.push(...scopeRoutes.map((r) => ({ ...r, toolId: tool.id })))
      }
      if (s.navigation) {
        navigation.push(
          ...s.navigation.map((n) => ({ ...n, toolId: tool.id, icon: n.icon as unknown }))
        )
      }
    }

    return {
      type: scope.type,
      label: scope.label,
      urlPrefix: scope.urlPrefix,
      routes,
      navigation,
      children: (scope.children ?? []).map(buildScopeGroup),
    }
  }

  return {
    scopes: buildScopeGroup(scopeTree),
    publicRoutes,
    authenticatedRoutes,
    fullscreenRoutes,
  }
}
