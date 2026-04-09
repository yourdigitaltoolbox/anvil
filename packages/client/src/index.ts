/**
 * @ydtb/anvil-client — Client runtime for Anvil.
 *
 * Generic client primitives. Toolkit-specific features (route assembly,
 * app helper) live in @ydtb/anvil-toolkit.
 *
 * Provides:
 * - `createApiClient(toolId)` — typed API client descriptor per module
 * - `useLayer(key)` / `LayerProvider` — client-side swappable services
 * - `useScope()` / `ScopeProvider` — current scope context
 * - `useAuth()` / `AuthProvider` / `AuthGate` — auth state management
 */

// API client factory (no React dependency)
export { createApiClient, configureApiClients } from './api-client.ts'
export type { ApiClientDescriptor } from './api-client.ts'

// Client layers (React)
export { useLayer, LayerProvider } from './layers.tsx'
export type { ClientLayerMap, LayerProviderProps } from './layers.tsx'

// Scope context (React)
export { useScope, ScopeProvider, getCurrentScope } from './scope.tsx'
export type { ScopeContextValue, ScopeProviderProps } from './scope.tsx'

// Auth (React)
export { AuthProvider, useAuth, AuthGate } from './auth.tsx'
export type { AuthUser, AuthContextValue, AuthProviderProps, AuthGateProps } from './auth.tsx'
