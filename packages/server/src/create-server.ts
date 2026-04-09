/**
 * createServer — the HTTP entry point for an Anvil server.
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

/**
 * Duck-type check for Hono app instances.
 * instanceof fails across package boundaries with bun link/symlinks.
 */
function isHonoApp(obj: unknown): obj is Hono {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof (obj as Record<string, unknown>).fetch === 'function' &&
    typeof (obj as Record<string, unknown>).route === 'function' &&
    typeof (obj as Record<string, unknown>).use === 'function' &&
    typeof (obj as Record<string, unknown>).get === 'function'
  )
}
import type { AppConfig } from '@ydtb/anvil'
import type { MiddlewareHandler } from 'hono'
import { requestContext, getLogger, getRequestContext } from './request-context.ts'
import type { RequestContext } from './request-context.ts'
import { boot } from './boot.ts'
import type { BootResult } from './boot.ts'
import type { ToolEntry } from './surfaces.ts'
import { getLayer } from './accessors.ts'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * Middleware entry — either a plain Hono handler or a named/prioritized entry.
 *
 * Plain handlers run in array order. Named entries are sorted by priority
 * (lower = runs first) before being installed.
 */
export type MiddlewareEntry =
  | MiddlewareHandler
  | { id: string; handler: MiddlewareHandler; priority?: number }

export interface ServerConfig {
  /** The app composition config from defineApp() */
  config: AppConfig
  /** Tool entries — typically from virtual:app/server-tools */
  tools: ToolEntry[]
  /**
   * Hono middleware to run on every request.
   *
   * Accepts either plain handlers (run in array order) or named entries
   * with priority ordering (lower priority number = runs first):
   *
   * ```ts
   * middleware: [
   *   { id: 'auth', handler: authMiddleware(), priority: 10 },
   *   { id: 'scope', handler: scopeMiddleware(), priority: 20 },
   *   cors(),  // plain handler — runs after all prioritized entries
   * ]
   * ```
   */
  middleware?: MiddlewareEntry[]
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
  let bootResult: BootResult | null = null

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
  // Global error handler (catches unhandled errors, reports to ErrorLayer)
  // -----------------------------------------------------------------------

  app.onError((error, c) => {
    const logger = getLogger()
    const ctx = getRequestContext()
    const err = error instanceof Error ? error : new Error(String(error))

    logger.error(
      {
        err: { message: err.message, stack: err.stack },
        requestId: ctx?.requestId,
        path: c.req.path,
        method: c.req.method,
      },
      'Unhandled error in route handler'
    )

    // Report to error layer if available
    try {
      const errorLayer = (getLayer as (key: string) => unknown)('errors')
      if (errorLayer && typeof (errorLayer as Record<string, unknown>).capture === 'function') {
        (errorLayer as { capture: (error: Error, context?: Record<string, unknown>) => void }).capture(err, {
          requestId: ctx?.requestId,
          userId: ctx?.userId,
          scopeId: ctx?.scopeId,
          path: c.req.path,
          method: c.req.method,
        })
      }
    } catch {
      // Error layer not available — already logged above
    }

    const status = (err as { status?: number }).status ?? 500
    return c.json(
      {
        error: status >= 500 ? 'Internal server error' : err.message,
        requestId: ctx?.requestId,
      },
      status as any,
    )
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
    if (!bootResult) {
      return c.json({ status: 'error', message: 'Server not started' }, 503)
    }

    const results = await bootResult.lifecycle.checkHealth()
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
    // Shared boot: layers, hooks, surfaces
    bootResult = await boot({ config, tools, label: 'server' })

    const logger = getLogger()

    // Mount tool and extension routers
    for (const [id, router] of Object.entries(bootResult.processed.routers)) {
      if (isHonoApp(router)) {
        app.route(`/api/${id}`, router)
        logger.info({ id, path: `/api/${id}` }, 'Mounted router')
      } else {
        logger.warn(
          { id },
          'Router is not a Hono instance — skipping. Use fromOrpc() or export a Hono sub-app.'
        )
      }
    }

    // Mount app-level routes
    for (const [id, router] of Object.entries(routes)) {
      if (isHonoApp(router)) {
        app.route(`/api/${id}`, router)
        logger.info({ id, path: `/api/${id}` }, 'Mounted app-level route')
      } else {
        logger.warn(
          { id },
          'App-level route is not a Hono instance — skipping.'
        )
      }
    }

    // Install shutdown hooks (Node/Bun environments only)
    if (typeof globalThis.process !== 'undefined') {
      const shutdownHandler = async () => {
        logger.info({}, 'Shutdown signal received')
        await shutdown()
        globalThis.process.exit(0)
      }

      globalThis.process.on('SIGTERM', shutdownHandler)
      globalThis.process.on('SIGINT', shutdownHandler)
    }

    logger.info({ port }, 'Anvil server listening')
  }

  // -----------------------------------------------------------------------
  // Shutdown
  // -----------------------------------------------------------------------

  async function shutdown(): Promise<void> {
    if (bootResult) {
      await bootResult.shutdown()
      bootResult = null
    }
  }

  return { app, start, shutdown }
}
