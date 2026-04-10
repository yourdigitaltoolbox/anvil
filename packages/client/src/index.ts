/**
 * @ydtb/anvil-client — Client runtime for Anvil.
 *
 * Generic client primitives:
 * - Guards — `defineGuard`, composable route access pipeline
 * - Route layouts — `defineRouteLayout`, containers with guard pipelines
 * - Layers — `useLayer` / `LayerProvider`, client-side swappable services
 * - Scope — `useScope` / `ScopeProvider`, current scope context
 * - Auth — `useAuth` / `AuthProvider` / `AuthGate`, auth state
 * - API — `createApiClient`, typed API client descriptors
 */

// Guards
export { defineGuard, runGuardPipeline } from './guards.ts'
export type { Guard, GuardContext, GuardResult } from './guards.ts'

// Route layouts
export { defineRouteLayout } from './route-layout.ts'
export type { RouteLayout } from './route-layout.ts'

// Guarded layout component
export { GuardedLayout } from './guarded-layout.tsx'
export type { GuardedLayoutProps } from './guarded-layout.tsx'

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

// Context providers (React)
export { defineContextProvider, ContextProviderStack } from './context-providers.tsx'
export type { ContextProviderEntry, ContextProviderStackProps } from './context-providers.tsx'
