/**
 * @ydtb/anvil-toolkit/client — client-safe toolkit exports.
 *
 * No server dependencies (no node:async_hooks, no Effect, no Hono).
 * Safe to import from client-side code bundled by Vite.
 *
 * @example
 * ```ts
 * import { createAnvilApp, assembleRoutes } from '@ydtb/anvil-toolkit/client'
 * ```
 */

// Augmentation (side-effect)
import './augment.ts'

// Client app helper
export { createAnvilApp } from './create-app.tsx'
export type { AnvilAppConfig, AnvilApp } from './create-app.tsx'

// Route assembly
export { assembleRoutes } from './assemble-routes.ts'
export type { ToolClientEntry, ScopeRouteGroup, AssembledRoutes } from './assemble-routes.ts'

// Definitions (no server deps)
export { defineTool } from './define-tool.ts'
export type { ToolDescriptor } from './define-tool.ts'
export { scope } from './scope.ts'
export type { ScopeDefinition, ScopeTree } from './scope.ts'
export { defineClient } from './client.ts'
export type { Client, ClientCore, RouteEntry, NavigationEntry, PermissionEntry, PermissionGroup } from './client.ts'
