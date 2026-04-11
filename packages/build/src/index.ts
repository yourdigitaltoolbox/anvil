/**
 * @ydtb/anvil-build — Build system for Anvil.
 *
 * Generic build primitives. Toolkit-specific virtual module generators
 * live in @ydtb/anvil-toolkit/build.
 *
 * Provides:
 * - `anvilPlugin(config, { modules })` — extensible Vite/Rollup plugin
 * - `createDevMiddleware()` — Vite in middleware mode (single server, single port)
 * - `createViteConfig(options)` — pre-configured Vite config
 */

export { anvilPlugin } from './plugin.ts'
export type { AnvilPluginOptions, VirtualModuleGenerator } from './plugin.ts'

export { createDevMiddleware } from './dev-middleware.ts'
export type { DevMiddlewareConfig, DevMiddleware } from './dev-middleware.ts'

export { createViteConfig } from './vite-config.ts'
export type { ViteConfigOptions } from './vite-config.ts'

// Legacy — kept for backwards compat but not recommended
export { createDevServer } from './dev-server.ts'
export type { DevServerConfig } from './dev-server.ts'
