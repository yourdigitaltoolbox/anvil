/**
 * @ydtb/anvil-toolkit — YDTB's tool/scope pattern for Anvil.
 *
 * Three entry points (no overlap):
 * - `@ydtb/anvil-toolkit/core` — universal (no server, no React)
 * - `@ydtb/anvil-toolkit/client` — core + React helpers (no server deps)
 * - `@ydtb/anvil-toolkit/server` — server wrappers (requires @ydtb/anvil-server)
 *
 * This main barrel re-exports everything. Only use in Bun/bundler
 * contexts where server imports are safe. Do NOT import from this
 * barrel in client-side Vite-bundled code — use /client instead.
 *
 * @example
 * ```ts
 * // Client code:
 * import { createAnvilApp, defineClient } from '@ydtb/anvil-toolkit/client'
 *
 * // Server code:
 * import { createToolServer, toolEntry } from '@ydtb/anvil-toolkit/server'
 *
 * // Config/shared code:
 * import { defineScope, defineTool } from '@ydtb/anvil-toolkit/core'
 * ```
 */

export * from './core.ts'
export * from './client.entry.ts'
export * from './server.entry.ts'
