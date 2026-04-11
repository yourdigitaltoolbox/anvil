/**
 * @ydtb/anvil-toolkit/client — client-safe toolkit exports.
 *
 * No server dependencies (no node:async_hooks, no Effect, no Hono).
 * Safe to import from client-side code bundled by Vite.
 *
 * Re-exports everything from ./core plus React helpers.
 *
 * @example
 * ```ts
 * import { createAnvilApp, assembleRoutes, defineClient } from '@ydtb/anvil-toolkit/client'
 * ```
 */

// Re-export core (universal definitions)
export * from './core.ts'

// Client helpers (requires React)
export { createAnvilApp } from './create-app.tsx'
export type { AnvilAppConfig, AnvilApp } from './create-app.tsx'

// Route assembly (requires React types)
export { assembleRoutes } from './assemble-routes.ts'
export type { ToolClientEntry, ScopeRouteGroup, AssembledRoutes } from './assemble-routes.ts'

// Client contribution access
export { ContributionProvider, useContributions } from './use-contributions.tsx'
export type { ContributionProviderProps } from './use-contributions.tsx'

// Scope client utilities (React hooks + pure functions for tool packages)
export {
  initScopeClient,
  useScopeLink,
  useScopeLabel,
  useChildScopeLabel,
  scopeLink,
  detectScopeFromPath,
  getUrlPrefixes,
  scopeHasUrlScopeId,
  isSingletonScope,
} from './scope-client.tsx'

// Layout portals — pre-named slots for scoped dashboard layouts
export {
  HeaderPortal,
  SidebarPortal,
  HEADER_SLOT,
  SIDEBAR_SLOT,
  SIDEBAR_DRAWER_SLOT,
} from './layout-portals.tsx'
export type { HeaderPortalProps, SidebarPortalProps } from './layout-portals.tsx'
