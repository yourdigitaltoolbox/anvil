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

// Worker entry point
export { createWorker } from './create-worker.ts'
export type { WorkerConfig, AnvilWorker } from './create-worker.ts'

// Accessors
export { getLayer, getHooks, getContributions } from './accessors.ts'

// Request context
export { getRequestContext, getLogger } from './request-context.ts'
export type { RequestContext } from './request-context.ts'

// Lifecycle (for advanced use / testing)
export type { LifecycleManager } from './lifecycle.ts'

// Surface types and helpers
export { toolEntry } from './surfaces.ts'
export type { ToolEntry, ProcessedSurfaces } from './surfaces.ts'

// Router helpers
export { fromOrpc } from './from-orpc.ts'

// SPA handler
export { createSpaHandler } from './spa-handler.ts'
export type { RouteMatch, SpaHandlerConfig, RegisteredRoute } from './spa-handler.ts'

// Layer authoring helpers
export { createLayerConfig, createLayerConfigWithTag } from './layer-helpers.ts'
export { getLayerTag } from './layer-tags.ts'

// Test helpers
export { provideLayerResolver, provideHookSystem, provideContributions } from './accessors.ts'
export { provideLoggingLayerResolver } from './request-context.ts'
