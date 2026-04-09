/**
 * @ydtb/anvil-toolkit/core — toolkit exports without React/TSX dependencies.
 *
 * Safe to import from vite.config.ts and other Node.js contexts that
 * can't handle .tsx files. Includes everything except createAnvilApp
 * and assembleRoutes (which depend on React types).
 *
 * @example
 * ```ts
 * // In vite.config.ts or compose.config.ts (Node context)
 * import { scope, defineTool } from '@ydtb/anvil-toolkit/core'
 * ```
 */

// Augment AppConfig with scopes field
import './augment.ts'

// Tool definitions
export { defineTool } from './define-tool.ts'
export type { ToolDescriptor } from './define-tool.ts'

// Scope definitions
export { scope } from './scope.ts'
export type { ScopeDefinition, ScopeTree } from './scope.ts'

// Client surface (types only — no React components)
export { defineClient } from './client.ts'
export type { Client, ClientCore } from './client.ts'
export type { RouteEntry, NavigationEntry, PermissionEntry, PermissionGroup } from './client.ts'

// Server surface
export { defineServer } from './server.ts'
export type { Server, ServerCore, ServerHooks } from './server.ts'

// Tool server/worker wrappers
export { createToolServer } from './create-tool-server.ts'
export type { ToolServerConfig } from './create-tool-server.ts'
export { createToolWorker } from './create-tool-worker.ts'
export type { ToolWorkerConfig } from './create-tool-worker.ts'

// Surface processor
export { processSurfaces, toolEntry } from './surfaces.ts'
export type { ToolEntry, ProcessedSurfaces } from './surfaces.ts'

// Build utilities
export { collectTools, collectToolsWithScopes } from './collect-tools.ts'
