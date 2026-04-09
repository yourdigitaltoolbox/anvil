/**
 * Client surface — what a tool contributes to the browser runtime.
 *
 * The client surface has two parts:
 *
 * 1. **Core fields** — routes, navigation, permissions. The framework knows
 *    how to process these (routing, nav shell, permission registry).
 *
 * 2. **Contributions** — extensible fields defined by Extension packages.
 *    The framework collects them and delivers them to the extension that
 *    owns them. Installing an extension package augments `ClientContributions`
 *    via declaration merging, making new fields available on `defineClient`.
 *
 * @example
 * ```ts
 * import { defineClient } from '@ydtb/anvil'
 *
 * export default defineClient({
 *   // Core — framework processes these
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
 *
 *   // Contributions — defined by installed extension packages
 *   // search: { provider: contactSearch },
 *   // onboarding: { steps: [...] },
 * })
 * ```
 */

import type { ComponentType } from 'react'

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
// Extension Contributions — augmented by Extension packages
// ---------------------------------------------------------------------------

/**
 * Client-side contributions that tools can make to installed extensions.
 * Empty by default — augmented via declaration merging by extension packages.
 *
 * @example
 * ```ts
 * // In @ydtb/ext-search
 * declare module '@ydtb/anvil' {
 *   interface ClientContributions {
 *     search?: { provider: SearchProvider }
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ClientContributions {}

// ---------------------------------------------------------------------------
// Client Core — fields the framework knows how to process
// ---------------------------------------------------------------------------

export interface ClientCore {
  // --- Scoped features (auto-wired per including scope) ---

  /** Routes rendered inside the scope layout */
  routes?: RouteEntry[]
  /** Navigation entries for the scope sidebar */
  navigation?: NavigationEntry[]
  /** Permission declarations registered in the permission system */
  permissions?: PermissionGroup[]

  // --- Non-scoped features (registered globally) ---

  /** Routes rendered without auth (login, signup, public marketing pages) */
  publicRoutes?: RouteEntry[]
  /** Routes rendered fullscreen (no scope chrome) */
  fullscreenRoutes?: RouteEntry[]
  /** Routes rendered with auth but outside any scope (/profile, /settings) */
  authenticatedRoutes?: RouteEntry[]

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
 * Core fields (routes, navigation, permissions) are processed by the framework.
 * Extension contribution fields are collected and delivered to their owning extension.
 */
export function defineClient(definition: Client): Client {
  return definition
}
