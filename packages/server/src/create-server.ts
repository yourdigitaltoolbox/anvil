/**
 * createServer — the entry point for an Anvil server.
 *
 * Boots layers, creates a Hono app, processes tool and extension surfaces,
 * mounts routes, and starts listening.
 *
 * ```ts
 * import { createServer } from '@ydtb/anvil-server'
 *
 * const server = createServer({
 *   config: composeConfig,
 *   tools,
 *   middleware: [cors()],
 *   port: 3000,
 * })
 *
 * server.start()
 * ```
 */

import { Hono } from 'hono'
import type { Hono as HonoType } from 'hono'
import { HookSystem } from '@ydtb/anvil-hooks'
import type { AppConfig } from '@ydtb/anvil'
import type { MiddlewareHandler } from 'hono'
import { requestContext, createConsoleLogger, getLogger } from './request-context.ts'
import type { RequestContext } from './request-context.ts'
import { provideHookSystem } from './accessors.ts'
import { bootLifecycle } from './lifecycle.ts'
import type { LifecycleManager } from './lifecycle.ts'
import { processSurfaces } from './surfaces.ts'
import type { ToolEntry } from './surfaces.ts'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface ServerConfig {
  /** The app composition config from defineApp() */
  config: AppConfig
  /** Tool entries — typically from virtual:app/server-tools */
  tools: ToolEntry[]
  /** Hono middleware to run on every request (CORS, auth, rate limiting, etc.) */
  middleware?: MiddlewareHandler[]
  /** App-level server routes (not tools, not extensions) */
  routes?: Record<string, unknown>
  /** Port to listen on (default: 3000) */
  port?: number
}

export interface AnvilServer {
  /** The Hono app instance — for advanced use cases */
  app: Hono
  /** Start listening for HTTP requests */
  start: () => Promise<void>
  /** Gracefully shut down the server */
  shutdown: () => Promise<void>
}

// ---------------------------------------------------------------------------
// createServer
// ---------------------------------------------------------------------------

export function createServer(serverConfig: ServerConfig): AnvilServer {
  const {
    config,
    tools,
    middleware = [],
    routes = {},
    port = 3000,
  } = serverConfig

  const app = new Hono()
  let lifecycle: LifecycleManager | null = null

  // -----------------------------------------------------------------------
  // Middleware: request context
  // -----------------------------------------------------------------------

  app.use('*', async (c, next) => {
    const logger = getLogger()
    const reqId = crypto.randomUUID()
    const ctx: RequestContext = {
      requestId: reqId,
      logger: logger.child({ requestId: reqId }),
      startedAt: performance.now(),
    }

    return requestContext.run(ctx, () => next())
  })

  // -----------------------------------------------------------------------
  // Middleware: user-provided
  // -----------------------------------------------------------------------

  for (const mw of middleware) {
    app.use('*', mw)
  }

  // -----------------------------------------------------------------------
  // Health endpoints
  // -----------------------------------------------------------------------

  app.get('/healthz', (c) => c.json({ status: 'ok' }))

  app.get('/readyz', async (c) => {
    if (!lifecycle) {
      return c.json({ status: 'error', message: 'Server not started' }, 503)
    }

    const results = await lifecycle.checkHealth()
    const allOk = Object.values(results).every((r) => r.status === 'ok')

    return c.json(
      {
        status: allOk ? 'ok' : 'degraded',
        checks: results,
      },
      allOk ? 200 : 503
    )
  })

  // -----------------------------------------------------------------------
  // Start
  // -----------------------------------------------------------------------

  async function start(): Promise<void> {
    const logger = getLogger()

    // 1. Boot layers
    logger.info({}, 'Starting Anvil server')
    lifecycle = await bootLifecycle(config.layers)

    // 2. Create hook system
    const hooks = new HookSystem()
    provideHookSystem(hooks)

    // 3. Process tool and extension surfaces
    const extensions = config.extensions ?? []
    const processed = processSurfaces(hooks, tools, extensions)

    // 3b. Make extension contributions available via hooks
    for (const [extId, items] of Object.entries(processed.contributions)) {
      if (items.length > 0) {
        const contributionItems = items
        hooks.addFilter(`ext:${extId}:contributions`, () => contributionItems)
        logger.info({ extensionId: extId, count: items.length }, 'Registered extension contributions')
      }
    }

    // 4. Mount tool and extension routers
    for (const [id, router] of Object.entries(processed.routers)) {
      if (router instanceof Hono) {
        app.route(`/api/${id}`, router)
        logger.info({ id, path: `/api/${id}` }, 'Mounted router')
      } else {
        logger.warn(
          { id },
          'Router is not a Hono instance — skipping. Use fromOrpc() or export a Hono sub-app.'
        )
      }
    }

    // 5. Mount app-level routes
    for (const [id, router] of Object.entries(routes)) {
      if (router instanceof Hono) {
        app.route(`/api/${id}`, router)
        logger.info({ id, path: `/api/${id}` }, 'Mounted app-level route')
      } else {
        logger.warn(
          { id },
          'App-level route is not a Hono instance — skipping.'
        )
      }
    }

    // 6. Install shutdown hooks (Node/Bun environments only)
    if (typeof globalThis.process !== 'undefined') {
      const shutdownHandler = async () => {
        logger.info({}, 'Shutdown signal received')
        await shutdown()
        globalThis.process.exit(0)
      }

      globalThis.process.on('SIGTERM', shutdownHandler)
      globalThis.process.on('SIGINT', shutdownHandler)
    }

    // 7. Start listening
    logger.info({ port }, 'Anvil server listening')
  }

  // -----------------------------------------------------------------------
  // Shutdown
  // -----------------------------------------------------------------------

  async function shutdown(): Promise<void> {
    const logger = getLogger()
    logger.info({}, 'Shutting down Anvil server')

    // Clean up accessors
    provideHookSystem(null)

    // Shut down layers (releases resources in reverse order)
    if (lifecycle) {
      await lifecycle.shutdown()
      lifecycle = null
    }

    logger.info({}, 'Anvil server shut down')
  }

  return { app, start, shutdown }
}
