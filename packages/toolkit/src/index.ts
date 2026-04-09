/**
 * @ydtb/anvil-toolkit — YDTB's tool/scope pattern for Anvil.
 *
 * Two entry points:
 * - `@ydtb/anvil-toolkit/core` — universal (no server, no React). Use everywhere.
 * - `@ydtb/anvil-toolkit` — everything (re-exports core + server wrappers + React helpers)
 *
 * @example
 * ```ts
 * // In compose.config.ts, vite.config.ts, client code, server code:
 * import { defineTool, defineScope, defineClient, defineServer } from '@ydtb/anvil-toolkit/core'
 *
 * // In server entry (needs server runtime):
 * import { createToolServer, toolEntry } from '@ydtb/anvil-toolkit'
 *
 * // In client entry (needs React):
 * import { createAnvilApp } from '@ydtb/anvil-toolkit'
 * ```
 */

// Re-export everything from core (universal — no server, no React)
export * from './core.ts'

// Server wrappers (requires @ydtb/anvil-server)
export { createToolServer } from './create-tool-server.ts'
export type { ToolServerConfig } from './create-tool-server.ts'
export { createToolWorker } from './create-tool-worker.ts'
export type { ToolWorkerConfig } from './create-tool-worker.ts'

// Surface processor (requires @ydtb/anvil-server)
export { processSurfaces, toolEntry } from './surfaces.ts'
export type { ToolEntry, ProcessedSurfaces } from './surfaces.ts'

// Client helpers (requires React)
export { createAnvilApp } from './create-app.tsx'
export type { AnvilAppConfig, AnvilApp } from './create-app.tsx'

// Route assembly (requires React types for ComponentType)
export { assembleRoutes } from './assemble-routes.ts'
export type { ToolClientEntry, ScopeRouteGroup, AssembledRoutes } from './assemble-routes.ts'

// Build integration re-exported for convenience
export { collectTools, collectToolsWithScopes } from './collect-tools.ts'
