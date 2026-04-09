/**
 * Route layouts — containers that wrap routes with a layout component
 * and a guard pipeline.
 *
 * Route layouts are the primitive for organizing routes. Each layout
 * defines a URL prefix, a wrapper component, and a pipeline of guards
 * that must pass before routes render.
 *
 * @example
 * ```ts
 * import { defineRouteLayout, defineGuard } from '@ydtb/anvil-client'
 *
 * const workspace = defineRouteLayout({
 *   id: 'workspace',
 *   urlPrefix: '/w/$scopeId',
 *   layout: WorkspaceLayout,
 *   guards: [requireAuth, requireScope, requirePermissions],
 * })
 *
 * const publicLayout = defineRouteLayout({
 *   id: 'public',
 *   layout: MinimalLayout,
 *   guards: [],  // no guards — anyone can access
 * })
 * ```
 */

import type { ComponentType, ReactNode } from 'react'
import type { Guard } from './guards.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RouteLayout {
  /** Unique identifier for this layout */
  id: string
  /** URL prefix pattern (e.g., '/w/$scopeId', '/portal'). Optional for pathless layouts. */
  urlPrefix?: string
  /** Layout component that wraps child routes */
  layout: ComponentType<{ children?: ReactNode }>
  /** Guard pipeline — each guard must pass before routes render */
  guards: Guard[]
  /** Priority for ordering (lower = earlier in router tree, default: 100) */
  priority?: number
  /** Default redirect path when navigating to the layout root */
  defaultRoute?: string
}

// ---------------------------------------------------------------------------
// defineRouteLayout
// ---------------------------------------------------------------------------

/**
 * Define a route layout.
 *
 * Route layouts are containers that group routes with shared layout and
 * access control. Guards run as a pipeline before any route in the
 * layout renders.
 *
 * @example
 * ```ts
 * // Scoped layout — auth + scope + permissions
 * const workspace = defineRouteLayout({
 *   id: 'workspace',
 *   urlPrefix: '/w/$scopeId',
 *   layout: WorkspaceLayout,
 *   guards: [requireAuth, requireScope, requirePermissions],
 * })
 *
 * // Public layout — no guards
 * const publicLayout = defineRouteLayout({
 *   id: 'public',
 *   layout: MinimalLayout,
 *   guards: [],
 * })
 *
 * // Portal — custom auth
 * const portal = defineRouteLayout({
 *   id: 'portal',
 *   urlPrefix: '/portal',
 *   layout: PortalLayout,
 *   guards: [requirePinAuth],
 * })
 * ```
 */
export function defineRouteLayout(layout: RouteLayout): RouteLayout {
  return { priority: 100, ...layout }
}
