/**
 * fromOrpc — wraps an oRPC router in a Hono sub-app for mounting.
 *
 * This is a convenience helper, not a framework requirement. Tools that
 * use oRPC call this to produce a Hono-compatible router. Tools that
 * don't use oRPC export a Hono sub-app directly.
 *
 * @example
 * ```ts
 * import { defineServer } from '@ydtb/anvil'
 * import { fromOrpc } from '@ydtb/anvil-server'
 * import { contactsRouter } from './api/router'
 *
 * export default defineServer({
 *   router: fromOrpc(contactsRouter),
 * })
 * ```
 *
 * Without oRPC (plain Hono):
 * ```ts
 * import { Hono } from 'hono'
 *
 * const app = new Hono()
 * app.get('/webhook', (c) => c.json({ ok: true }))
 *
 * export default defineServer({ router: app })
 * ```
 */

import { Hono } from 'hono'

/**
 * Wrap an oRPC router in a Hono sub-app.
 *
 * Accepts an oRPC handler factory or a pre-built handler function.
 * The framework mounts the returned Hono app at `/api/{toolId}/*`.
 *
 * Note: This function depends on `@orpc/server` being installed in the
 * consuming app. It does NOT add an oRPC dependency to the framework.
 * The router is treated as an opaque object — the actual oRPC→fetch
 * adapter is invoked at request time.
 */
export function fromOrpc(router: unknown): Hono {
  const app = new Hono()

  // oRPC routers implement a fetch-compatible handler via @orpc/server/fetch
  // or expose a .handler() method. We accept the router object and create
  // a catch-all that delegates to oRPC's fetch handler.
  //
  // The consuming app must have @orpc/server installed. We dynamically
  // check for the handler capability rather than importing oRPC directly.
  app.all('/*', async (c) => {
    // Try common oRPC handler patterns
    const r = router as Record<string, unknown>

    // Pattern 1: router has a .handle() method (oRPC v1+)
    if (typeof r.handle === 'function') {
      return r.handle(c.req.raw) as Response
    }

    // Pattern 2: router is a fetch handler function
    if (typeof router === 'function') {
      return (router as (req: Request) => Response | Promise<Response>)(c.req.raw)
    }

    return c.json(
      { error: 'Router does not implement a compatible handler interface' },
      500
    )
  })

  return app
}
