/**
 * Client surface — what a tool contributes to the browser runtime.
 *
 * The client surface has two parts:
 *
 * 1. **Core fields** — routes, navigation, permissions. The toolkit
 *    processes these during route assembly.
 *
 * 2. **Contributions** — extensible fields defined by Extension packages.
 *    Collected and delivered to the extension that owns them.
 *
 * Routes specify which layout they belong to via the `layout` field,
 * matching a `defineRouteLayout({ id })` from `@ydtb/anvil-client`.
 *
 * @example
 * ```ts
 * import { defineClient } from '@ydtb/anvil-toolkit/core'
 *
 * export default defineClient({
 *   routes: [
 *     { path: 'contacts', component: () => import('./pages/list'), layout: 'workspace' },
 *     { path: 'contacts/:id', component: () => import('./pages/detail'), layout: 'workspace' },
 *     { path: 'invite/:code', component: () => import('./pages/invite'), layout: 'public' },
 *   ],
 *   navigation: [
 *     { label: 'Contacts', path: 'contacts', icon: 'Users' },
 *   ],
 * })
 * ```
 */

import type { ComponentType } from 'react'

// ---------------------------------------------------------------------------
// Route Types
// ---------------------------------------------------------------------------

export interface RouteEntry {
  /** Route path relative to layout prefix (e.g. 'contacts', 'contacts/:id') */
  path: string
  /** Component — lazy import for code splitting */
  component: ComponentType | (() => Promise<{ default: ComponentType }>)
  /**
   * Which route layout this route belongs to.
   * Matches the `id` of a `defineRouteLayout()`.
   * If omitted, defaults to the scoped layout (first layout with a scope guard).
   */
  layout?: string
  /** Scope type filter — only register for these scope types */
  scope?: string[]
  /** Server-side loader for SSR data fetching */
  loader?: (context: {
    params: Record<string, string>
    scopeChain?: Array<{ scope: string; scopeId: string }>
  }) => Promise<unknown>
}

// ---------------------------------------------------------------------------
// Navigation Types
// ---------------------------------------------------------------------------

export interface NavigationEntry {
  label: string
  path: string
  icon: string | ComponentType<{ className?: string }>
  position?: 'top' | 'bottom'
  defaultVisible?: boolean
  pinned?: boolean
}

// ---------------------------------------------------------------------------
// Permission Types
// ---------------------------------------------------------------------------

export interface PermissionEntry {
  key: string
  label: string
  category?: 'read' | 'write' | 'admin'
}

export interface PermissionGroup {
  feature: string
  label: string
  guestBlocked?: boolean
  actions: PermissionEntry[]
}

// ---------------------------------------------------------------------------
// Extension Contributions — augmented by Extension packages
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ClientContributions {}

// ---------------------------------------------------------------------------
// Client Core
// ---------------------------------------------------------------------------

export interface ClientCore {
  /**
   * Routes this tool contributes.
   * Each route specifies which layout it belongs to via the `layout` field.
   * Routes without a `layout` default to the scoped layout.
   */
  routes?: RouteEntry[]
  /** Navigation entries for scope sidebars */
  navigation?: NavigationEntry[]
  /** Permission declarations registered in the permission system */
  permissions?: PermissionGroup[]

  // --- Escape hatch ---

  /**
   * Imperative setup for edge cases that can't be expressed declaratively.
   * Called once during client boot after all surfaces are collected.
   */
  setup?: (ctx: {
    registeredTools: string[]
    hooks: {
      addFilter: <T>(name: string, fn: (value: T) => T, priority?: number) => void
      addAction: <T = void>(name: string, fn: (...args: unknown[]) => T) => void
      onBroadcast: (name: string, fn: (...args: unknown[]) => void) => void
    }
  }) => void
}

// ---------------------------------------------------------------------------
// Client — the full type (core + contributions)
// ---------------------------------------------------------------------------

/** Full client surface type — core fields plus extension contributions. */
export type Client = ClientCore & ClientContributions

/**
 * Define a tool's client contribution.
 *
 * Accepts unknown keys beyond the core and contribution types — these are treated
 * as extension contributions collected at boot time.
 */
export function defineClient(definition: Client & Record<string, unknown>): Client {
  return definition
}
