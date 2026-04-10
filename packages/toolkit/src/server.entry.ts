/**
 * @ydtb/anvil-toolkit/server — server-side toolkit exports.
 *
 * Requires @ydtb/anvil-server (node:async_hooks, Effect, Hono).
 * Do NOT import from client-side code.
 *
 * @example
 * ```ts
 * import { createToolServer, toolEntry } from '@ydtb/anvil-toolkit/server'
 * ```
 */

export { createToolServer } from './create-tool-server.ts'
export type { ToolServerConfig } from './create-tool-server.ts'
export { createToolWorker } from './create-tool-worker.ts'
export type { ToolWorkerConfig } from './create-tool-worker.ts'
export { processSurfaces, toolEntry } from './surfaces.ts'
export type { ToolEntry, ProcessedSurfaces } from './surfaces.ts'
