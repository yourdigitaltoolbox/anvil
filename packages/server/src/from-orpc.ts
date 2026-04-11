/**
 * fromOrpc — wraps an oRPC router in a Hono sub-app for mounting.
 *
 * Uses `RPCHandler` from `@orpc/server/fetch` to create a fetch-compatible
 * handler from an oRPC procedure collection. The consuming app must have
 * `@orpc/server` installed — Anvil does NOT depend on oRPC directly.
 *
 * @example
 * ```ts
 * import { fromOrpc } from '@ydtb/anvil-server'
 * import { contactsRouter } from './api/router'
 *
 * // In defineServer (tool surface):
 * export default defineServer({
 *   router: fromOrpc(contactsRouter),
 * })
 *
 * // In createToolServer (app-level routes):
 * createToolServer({
 *   routes: {
 *     platform: fromOrpc(platformRouter),
 *   },
 * })
 * ```
 */

import { Hono } from 'hono'

/**
 * Wrap an oRPC router (procedure collection) in a Hono sub-app.
 *
 * Dynamically imports `@orpc/server/fetch` to create an `RPCHandler`.
 * The handler is created lazily on first request to avoid import-time
 * issues (the dynamic import resolves from the consuming app's node_modules).
 *
 * Also supports pre-built handlers with `.handle()` and raw fetch functions.
 */
export function fromOrpc(router: unknown): Hono {
  const app = new Hono()

  // Lazy-initialized RPCHandler
  let rpcHandler: {
    handle: (req: Request, opts?: Record<string, unknown>) => Promise<{ matched: boolean; response?: Response }>
  } | null = null
  let initPromise: Promise<void> | null = null
  let initFailed = false

  async function ensureHandler() {
    if (rpcHandler || initFailed) return
    if (!initPromise) {
      initPromise = (async () => {
        try {
          const mod = await import('@orpc/server/fetch')
          rpcHandler = new mod.RPCHandler(router as any)
        } catch {
          initFailed = true
        }
      })()
    }
    await initPromise
  }

  app.all('/*', async (c) => {
    const r = router as Record<string, unknown>

    // Pattern 1: pre-built handler with .handle() (e.g., already an RPCHandler)
    if (typeof r.handle === 'function') {
      try {
        const result = await (r as any).handle(c.req.raw, {
          context: { headers: c.req.raw.headers },
        })
        if (result && typeof result === 'object' && 'response' in result) {
          return result.matched ? result.response : c.notFound()
        }
        if (result instanceof Response) return result
      } catch (err) {
        console.error('[fromOrpc] Handler error:', err)
        return c.json({ error: 'Internal server error' }, 500)
      }
    }

    // Pattern 2: raw fetch handler function
    if (typeof router === 'function') {
      return (router as (req: Request) => Response | Promise<Response>)(c.req.raw)
    }

    // Pattern 3: oRPC procedure collection → use RPCHandler adapter
    await ensureHandler()
    if (rpcHandler) {
      try {
        // Determine the prefix to strip.
        // The sub-app is mounted at /api/{id}. The original URL path includes this.
        // We need to tell RPCHandler what prefix to strip to find the procedure name.
        // c.req.path is the path *relative to the sub-app mount* when using route(),
        // but the full path when using fetch delegation. The original URL always has
        // the full path. We derive the prefix by removing the last segment.
        const url = new URL(c.req.url)
        const pathSegments = url.pathname.split('/').filter(Boolean)
        // The procedure name is the last segment(s). The prefix is everything before.
        // For /api/platform/setupStatus → prefix=/api/platform, procedure=setupStatus
        // For nested: /api/contacts/tags/list → prefix=/api/contacts, procedure=tags/list
        // We use a heuristic: the prefix is /api/{routeId} (first two segments after root)
        const prefix = '/' + pathSegments.slice(0, 2).join('/')

        const { matched, response } = await rpcHandler.handle(c.req.raw, {
          prefix,
          context: { headers: c.req.raw.headers },
        })

        if (matched && response) return response
        return c.notFound()
      } catch (err) {
        console.error('[fromOrpc] RPCHandler error:', err)
        return c.json({ error: 'Internal server error' }, 500)
      }
    }

    return c.json(
      { error: 'Router does not implement a compatible handler interface. Install @orpc/server.' },
      500
    )
  })

  return app
}
