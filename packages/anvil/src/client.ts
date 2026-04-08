/**
 * Client definition — what a tool contributes to the browser runtime.
 *
 * Each tool exports a `Client` (or a function returning one) from its
 * `./client` subpath. Anvil reads these definitions and registers
 * routes, navigation, permissions, dashboard cards, settings, etc.
 *
 * ## Scoped features
 * Auto-wired per scope that includes the tool:
 * `routes`, `navigation`, `dashboardCards`, `permissions`, `settings`,
 * `credentials`, `searchProvider`, `tokenProvider`
 *
 * ## Non-scoped features
 * Registered globally:
 * `publicRoutes`, `fullscreenRoutes`, `authenticatedRoutes`, `routeShells`,
 * `notificationProviders`, `metrics`, `onboarding`
 */

import type { ComponentType, ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Route Types
// ---------------------------------------------------------------------------

export interface RouteEntry {
  /** Route path relative to scope prefix (e.g. 'contacts', 'contacts/:id') */
  path: string
  /** Component — lazy import for code splitting */
  component: ComponentType | (() => Promise<{ default: ComponentType }>)
  /** Scope type filter — only register for these scope types */
  scope?: string[]
  /** Server-side loader for SSR data fetching (Tier 3 — wired up when streaming SSR is ready) */
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
// Client Definition
// ---------------------------------------------------------------------------

export interface Client {
  // --- Scoped features (auto-wired per including scope) ---
  routes?: RouteEntry[]
  navigation?: NavigationEntry[]
  dashboardCards?: unknown[] // CardEntry — defined by consuming app's UI library
  permissions?: PermissionGroup[]
  settings?: unknown[]
  credentials?: unknown[]
  searchProvider?: unknown
  tokenProvider?: unknown

  // --- Non-scoped features (registered globally) ---
  publicRoutes?: RouteEntry[]
  fullscreenRoutes?: RouteEntry[]
  authenticatedRoutes?: RouteEntry[]
  routeShells?: unknown[]
  notificationProviders?: unknown
  metrics?: unknown[]
  onboarding?: unknown[]
  contextProviders?: Array<{
    id: string
    component: ComponentType<{ children: ReactNode }>
    priority?: number
  }>

  // --- Escape hatch ---
  setup?: (ctx: {
    registeredTools: string[]
    hooks: {
      addFilter: <T>(name: string, fn: (value: T) => T, priority?: number) => void
      addAction: <T = void>(name: string, fn: (...args: unknown[]) => T) => void
      onBroadcast: (name: string, fn: (...args: unknown[]) => void) => void
    }
  }) => void
}

/**
 * Define a tool's client contribution.
 *
 * @example
 * ```ts
 * import { defineClient } from '@ydtb/anvil'
 *
 * export default defineClient({
 *   routes: [
 *     { path: 'contacts', component: () => import('./routes/contacts-page') },
 *   ],
 *   navigation: [
 *     { label: 'Contacts', path: 'contacts', icon: 'Users' },
 *   ],
 *   permissions: [
 *     { feature: 'contacts', label: 'Contacts', actions: [
 *       { key: 'contacts.view', label: 'View contacts', category: 'read' },
 *     ]},
 *   ],
 * })
 * ```
 */
export function defineClient(definition: Client): Client {
  return definition
}
