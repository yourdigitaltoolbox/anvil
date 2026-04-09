/**
 * @ydtb/anvil-build — Build system for Anvil.
 *
 * Generic build primitives. Toolkit-specific virtual module generators
 * live in @ydtb/anvil-toolkit/build.
 *
 * Provides:
 * - `anvilPlugin(config, { modules })` — extensible Vite/Rollup plugin
 * - `createDevServer(config)` — Bun --watch + Vite dev server
 * - `createViteConfig(options)` — pre-configured Vite config with proxy
 */

export { anvilPlugin } from './plugin.ts'
export type { AnvilPluginOptions, VirtualModuleGenerator } from './plugin.ts'

export { createDevServer } from './dev-server.ts'
export type { DevServerConfig } from './dev-server.ts'

export { createViteConfig } from './vite-config.ts'
export type { ViteConfigOptions } from './vite-config.ts'
