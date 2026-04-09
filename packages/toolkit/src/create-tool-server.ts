/**
 * createToolServer — wraps Anvil's createServer with tool surface processing.
 *
 * This is the entry point for apps using the toolkit's tool/scope pattern.
 * It injects the toolkit's processSurfaces into the framework's boot sequence.
 *
 * @example
 * ```ts
 * import { createToolServer, toolEntry } from '@ydtb/anvil-toolkit'
 *
 * const server = createToolServer({
 *   config: composeConfig,
 *   tools: [toolEntry('contacts', contactsServer)],
 *   middleware: [authMiddleware()],
 * })
 *
 * await server.start()
 * ```
 */

import { createServer } from '@ydtb/anvil-server'
import type { AppConfig } from '@ydtb/anvil'
import type { MiddlewareHandler } from 'hono'
import { processSurfaces } from './surfaces.ts'
import type { ToolEntry } from './surfaces.ts'

// Re-export MiddlewareEntry from server for convenience
type MiddlewareEntry =
  | MiddlewareHandler
  | { id: string; handler: MiddlewareHandler; priority?: number }

export interface ToolServerConfig {
  /** The app composition config from defineApp() */
  config: AppConfig
  /** Tool entries */
  tools: ToolEntry[]
  /** Hono middleware */
  middleware?: MiddlewareEntry[]
  /** App-level server routes */
  routes?: Record<string, unknown>
  /** Port (default: 3000) */
  port?: number
}

/**
 * Create an Anvil server with toolkit tool processing.
 *
 * Wraps `createServer` from `@ydtb/anvil-server` and injects the toolkit's
 * `processSurfaces` function so tool server surfaces (routers, hooks, jobs,
 * extension contributions) are processed during boot.
 */
export function createToolServer(config: ToolServerConfig) {
  return createServer({
    config: config.config,
    modules: config.tools,
    processSurfaces: processSurfaces as any,
    middleware: config.middleware,
    routes: config.routes,
    port: config.port,
  })
}
