/**
 * @ydtb/anvil-toolkit — YDTB's tool/scope pattern for Anvil.
 *
 * Provides:
 * - `defineTool`, `defineClient`, `defineServer` — tool surface definitions
 * - `scope` — hierarchical scope grouping with tool includes
 * - `createToolServer`, `createToolWorker` — server wrappers with tool processing
 * - `assembleRoutes`, `createAnvilApp` — client-side route assembly and app helper
 * - `toolEntry`, `collectTools` — utilities
 * - `toolkitModules` — virtual module generators for the build plugin
 *
 * This is the YDTB pattern. Other toolkits can define different module
 * systems (CMS content types, admin panels, etc.) on top of Anvil.
 *
 * @example
 * ```ts
 * import { defineTool, scope, defineClient, defineServer } from '@ydtb/anvil-toolkit'
 * import { createToolServer, toolEntry } from '@ydtb/anvil-toolkit'
 * ```
 */

// Augment AppConfig with scopes field (side-effect import)
import './augment.ts'

// Tool definitions
export { defineTool } from './define-tool.ts'
export type { ToolDescriptor } from './define-tool.ts'

// Scope definitions
export { scope } from './scope.ts'
export type { ScopeDefinition, ScopeTree } from './scope.ts'

// Client surface
export { defineClient } from './client.ts'
export type { Client, ClientCore, ClientContributions } from './client.ts'
export type { RouteEntry, NavigationEntry, PermissionEntry, PermissionGroup } from './client.ts'

// Server surface
export { defineServer } from './server.ts'
export type { Server, ServerCore, ServerContributions, ServerHooks } from './server.ts'

// Tool server/worker wrappers
export { createToolServer } from './create-tool-server.ts'
export type { ToolServerConfig } from './create-tool-server.ts'
export { createToolWorker } from './create-tool-worker.ts'
export type { ToolWorkerConfig } from './create-tool-worker.ts'

// Surface processor
export { processSurfaces, toolEntry } from './surfaces.ts'
export type { ToolEntry, ProcessedSurfaces } from './surfaces.ts'

// Route assembly (client)
export { assembleRoutes } from './assemble-routes.ts'
export type { ToolClientEntry, ScopeRouteGroup, AssembledRoutes } from './assemble-routes.ts'

// App helper (client)
export { createAnvilApp } from './create-app.tsx'
export type { AnvilAppConfig, AnvilApp } from './create-app.tsx'

// Build utilities
export { collectTools, collectToolsWithScopes } from './collect-tools.ts'

// Generators (for advanced use — normally use toolkitModules from ./build)
export {
  generateServerToolsModule,
  generateClientToolsModule,
  generateSchemaModule,
  generateScopeTreeModule,
  generatePermissionsModule,
  generateExtensionsModule,
} from './generators.ts'
