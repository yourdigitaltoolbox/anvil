/**
 * @ydtb/anvil-server — Server runtime for Anvil.
 *
 * Provides:
 * - `createServer(config)` — boots layers, processes surfaces, serves HTTP
 * - `getLayer(key)` — synchronous access to infrastructure layers
 * - `getHooks()` — access the hook system
 * - `getRequestContext()` — per-request state (requestId, userId, scopeId, logger)
 * - `getLogger()` — structured logger with request context
 *
 * @example
 * ```ts
 * import { createServer, getLayer, getLogger } from '@ydtb/anvil-server'
 *
 * const server = createServer({
 *   config: composeConfig,
 *   tools,
 *   port: 3000,
 * })
 *
 * await server.start()
 * ```
 */

// Server entry point
export { createServer } from './create-server.ts'
export type { ServerConfig, AnvilServer } from './create-server.ts'

// Accessors
export { getLayer, getHooks } from './accessors.ts'

// Request context
export { getRequestContext, getLogger } from './request-context.ts'
export type { RequestContext } from './request-context.ts'

// Lifecycle (for advanced use / testing)
export type { LifecycleManager } from './lifecycle.ts'

// Surface types (for virtual module authors)
export type { ToolEntry, ProcessedSurfaces } from './surfaces.ts'

// Router helpers
export { fromOrpc } from './from-orpc.ts'

// Test helpers
export { provideLayerResolver, provideHookSystem } from './accessors.ts'
