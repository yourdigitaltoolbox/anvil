/**
 * @ydtb/anvil-server — Server runtime for Anvil.
 *
 * Generic server primitives. No toolkit-specific concepts.
 *
 * Provides:
 * - `createServer(config)` — boots layers, serves HTTP
 * - `createWorker(config)` — boots layers, no HTTP
 * - `getLayer(key)` — synchronous access to infrastructure layers
 * - `getHooks()` — access the hook system
 * - `getRequestContext()` / `getLogger()` — per-request state
 * - `createSpaHandler()` — route matching + loader execution
 * - Cache helpers, layer helpers, fromOrpc
 */

// Server entry point
export { createServer } from './create-server.ts'
export type { ServerConfig, AnvilServer, MiddlewareEntry } from './create-server.ts'

// Worker entry point
export { createWorker } from './create-worker.ts'
export type { WorkerConfig, AnvilWorker } from './create-worker.ts'

// Boot (for toolkit wrappers)
export type { BootConfig, BootResult, ProcessedResult } from './boot.ts'

// Accessors
export { getLayer, getHooks, getContributions, withLayers } from './accessors.ts'

// Request context
export { getRequestContext, getLogger } from './request-context.ts'
export type { RequestContext } from './request-context.ts'

// Lifecycle
export type { LifecycleManager } from './lifecycle.ts'

// Router helpers
export { fromOrpc } from './from-orpc.ts'

// Cache helpers
export { withCache, cacheMiddleware, invalidateCache } from './cache-helpers.ts'
export type { WithCacheOptions, CacheMiddlewareOptions } from './cache-helpers.ts'

// SPA handler
export { createSpaHandler } from './spa-handler.ts'
export type { RouteMatch, SpaHandlerConfig, RegisteredRoute, RouteDefinition } from './spa-handler.ts'

// Layer authoring helpers
export { createLayerConfig, createLayerConfigWithTag } from './layer-helpers.ts'
export { getLayerTag } from './layer-tags.ts'

// Test helpers
export { provideLayerResolver, provideHookSystem, provideContributions } from './accessors.ts'
export { provideLoggingLayerResolver } from './request-context.ts'
