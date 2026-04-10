/**
 * Route assembly — builds layout-grouped route structure from tool surfaces.
 *
 * Takes tool client surfaces and produces a structured route map grouped
 * by layout ID. Routes specify their layout via the `layout` field on
 * RouteEntry — if omitted, they default to the 'scoped' layout.
 *
 * Also groups scoped routes by scope type based on the scope tree.
 *
 * @example
 * ```ts
 * import { assembleRoutes } from '@ydtb/anvil-toolkit'
 *
 * const routeMap = assembleRoutes(scopeTree, toolSurfaces)
 * // routeMap.scopes — routes grouped by scope (for scoped layouts)
 * // routeMap.layouts — all routes grouped by layout ID
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
  /** Scope type */
  type: string
  /** Scope label */
  label: string
  /** URL prefix pattern */
  urlPrefix: string
  /** Routes from tools included in this scope (layout=undefined or layout matching scoped) */
  routes: Array<RouteEntry & { toolId: string }>
  /** Navigation entries from tools included in this scope */
  navigation: Array<{ toolId: string; label: string; path: string; icon: unknown; position?: string; pinned?: boolean }>
  /** Child scope groups */
  children: ScopeRouteGroup[]
}

export interface AssembledRoutes {
  /** Scope-grouped routes — nested like the scope tree */
  scopes: ScopeRouteGroup
  /** All routes grouped by layout ID */
  layouts: Record<string, Array<RouteEntry & { toolId: string }>>
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * Assemble routes from tool client surfaces.
 *
 * Routes are grouped two ways:
 * 1. By layout ID — for routing (which layout container renders this route)
 * 2. By scope — for scope-aware routing (which tools are in which scope)
 *
 * Routes with no `layout` field default to no layout key (scoped routes
 * are handled via the scope tree).
 */
export function assembleRoutes(
  scopeTree: ScopeDefinition,
  tools: ToolClientEntry[],
): AssembledRoutes {
  const toolMap = new Map(tools.map((t) => [t.id, t]))

  // Group all routes by layout ID
  const layouts: Record<string, Array<RouteEntry & { toolId: string }>> = {}

  for (const tool of tools) {
    const s = tool.surface
    if (s.routes) {
      for (const route of s.routes) {
        const layoutId = route.layout ?? 'scoped'
        if (!layouts[layoutId]) layouts[layoutId] = []
        layouts[layoutId].push({ ...route, toolId: tool.id })
      }
    }
  }

  // Build scope tree with scoped routes and navigation
  function buildScopeGroup(scope: ScopeDefinition): ScopeRouteGroup {
    const routes: Array<RouteEntry & { toolId: string }> = []
    const navigation: ScopeRouteGroup['navigation'] = []

    for (const toolDesc of scope.includes ?? []) {
      const tool = toolMap.get(toolDesc.id)
      if (!tool) continue

      const s = tool.surface
      if (s.routes) {
        // Collect routes that are scoped (no layout or layout='scoped')
        const scopeRoutes = s.routes.filter((r) => {
          const isScoped = !r.layout || r.layout === 'scoped'
          const matchesScope = !r.scope || r.scope.includes(scope.type)
          return isScoped && matchesScope
        })
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
    layouts,
  }
}
