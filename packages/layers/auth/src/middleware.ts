/**
 * Auth middleware — validates sessions and populates RequestContext.
 *
 * Add to createServer's middleware array to automatically authenticate
 * requests and set userId on the request context.
 *
 * @example
 * ```ts
 * import { authMiddleware } from '@ydtb/anvil-layer-auth/middleware'
 *
 * createServer({
 *   middleware: [authMiddleware()],
 * })
 * ```
 *
 * After this middleware runs:
 * ```ts
 * const ctx = getRequestContext()
 * ctx.userId  // set if authenticated, undefined if not
 * ```
 */

import type { MiddlewareHandler } from 'hono'
import { getLayer, getRequestContext } from '@ydtb/anvil-server'

export interface AuthMiddlewareConfig {
  /**
   * Paths to skip authentication for (e.g., public routes).
   * Supports simple prefix matching.
   */
  skipPaths?: string[]
  /**
   * If true, return 401 for unauthenticated requests.
   * If false (default), continue with userId undefined.
   */
  requireAuth?: boolean
}

/**
 * Create auth middleware that validates sessions from the auth layer.
 *
 * Reads the session from the request, and if valid, sets `userId` on
 * the request context and rebinds the logger with the userId.
 */
export function authMiddleware(config?: AuthMiddlewareConfig): MiddlewareHandler {
  const { skipPaths = [], requireAuth = false } = config ?? {}

  return async (c, next) => {
    // Skip configured paths
    const path = new URL(c.req.url).pathname
    if (skipPaths.some((p) => path.startsWith(p))) {
      return next()
    }

    const ctx = getRequestContext()
    if (!ctx) return next()

    try {
      const auth = getLayer('auth')
      const session = await auth.getSession(c.req.raw)

      if (session) {
        ctx.userId = session.userId
        ctx.logger = ctx.logger.child({ userId: session.userId })
      } else if (requireAuth) {
        return c.json({ error: 'Unauthorized' }, 401)
      }
    } catch {
      // Auth layer not available or session check failed — continue unauthenticated
      if (requireAuth) {
        return c.json({ error: 'Unauthorized' }, 401)
      }
    }

    return next()
  }
}

/**
 * Create a Hono route handler that mounts better-auth's built-in routes.
 *
 * Mount this at /api/auth/* to handle sign-in, sign-up, callbacks,
 * session management, etc.
 *
 * @example
 * ```ts
 * import { Hono } from 'hono'
 * import { authRoutes } from '@ydtb/anvil-layer-auth/middleware'
 *
 * const authApp = new Hono()
 * authApp.all('/*', authRoutes())
 *
 * createServer({
 *   routes: { auth: authApp },
 * })
 * ```
 */
export function authRoutes(): MiddlewareHandler {
  return async (c) => {
    const auth = getLayer('auth')
    return auth.handler(c.req.raw)
  }
}
