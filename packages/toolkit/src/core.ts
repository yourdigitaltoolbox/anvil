/**
 * @ydtb/anvil-toolkit/core — universal toolkit exports.
 *
 * No server dependencies (no node:async_hooks, no Effect, no Hono).
 * No React dependencies (no JSX).
 * Safe to import from ANYWHERE: server, client, vite.config, compose.config.
 *
 * Contains only pure type/definition functions with zero side effects.
 *
 * @example
 * ```ts
 * import { scope, defineTool, defineClient, defineServer } from '@ydtb/anvil-toolkit/core'
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

// Client surface
export { defineClient } from './client.ts'
export type { Client, ClientCore } from './client.ts'
export type { RouteEntry, NavigationEntry, PermissionEntry, PermissionGroup } from './client.ts'

// Server surface (types + defineServer — no server runtime deps)
export { defineServer } from './server.ts'
export type { Server, ServerCore, ServerHooks } from './server.ts'

// Build utilities (pure functions, no server deps)
export { collectTools, collectToolsWithScopes } from './collect-tools.ts'
