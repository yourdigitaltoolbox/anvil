/**
 * @ydtb/anvil-client — Client runtime for Anvil.
 *
 * Provides:
 * - `assembleRoutes()` — builds scope-aware route structure from tool surfaces
 * - `createApiClient(toolId)` — typed API client descriptor per tool
 * - `useLayer(key)` / `LayerProvider` — client-side swappable services
 * - `useScope()` / `ScopeProvider` — current scope context
 *
 * @example
 * ```ts
 * import { createApiClient, useLayer, useScope } from '@ydtb/anvil-client'
 *
 * // Per-tool API client (module scope)
 * export const contactsApi = createApiClient('contacts')
 *
 * // In components
 * const analytics = useLayer('analytics')
 * const { scopeId } = useScope()
 * ```
 */

// Route assembly (pure functions, no React)
export { assembleRoutes } from './assemble-routes.ts'
export type { ToolClientEntry, ScopeRouteGroup, AssembledRoutes } from './assemble-routes.ts'

// API client factory (no React dependency)
export { createApiClient, configureApiClients } from './api-client.ts'
export type { ApiClientDescriptor } from './api-client.ts'

// Client layers (React)
export { useLayer, LayerProvider } from './layers.tsx'
export type { ClientLayerMap, LayerProviderProps } from './layers.tsx'

// Scope context (React)
export { useScope, ScopeProvider, getCurrentScope } from './scope.tsx'
export type { ScopeContextValue, ScopeProviderProps } from './scope.tsx'

// App helper
export { createAnvilApp } from './create-app.tsx'
export type { AnvilAppConfig, AnvilApp } from './create-app.tsx'

// Auth (React)
export { AuthProvider, useAuth, AuthGate } from './auth.tsx'
export type { AuthUser, AuthContextValue, AuthProviderProps, AuthGateProps } from './auth.tsx'
