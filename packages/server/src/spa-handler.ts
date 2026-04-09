/**
 * SPA handler — route matching, loader execution, and HTML serving.
 *
 * Given a flat list of all registered routes, matches incoming URLs,
 * runs loaders for routes that have them, and hands everything to the
 * app's renderShell function. The framework never generates HTML.
 *
 * Routes carry their scope and tool context — the app can use this
 * for branding, layout decisions, or data injection.
 *
 * @example
 * ```ts
 * import { createSpaHandler } from '@ydtb/anvil-server'
 *
 * const handler = createSpaHandler({
 *   routes: allRoutes,
 *   renderShell: async (match) => {
 *     return `<!DOCTYPE html>
 *       <html><body>
 *         <div id="app"></div>
 *         ${match.loaderData ? `<script>window.__DATA__=${JSON.stringify(match.loaderData)}</script>` : ''}
 *         <script type="module" src="/assets/app.js"></script>
 *       </body></html>`
 *   },
 * })
 *
 * app.get('*', handler)
 * ```
 */

import type { Context as HonoContext } from 'hono'
import { getLogger } from './request-context.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal route definition — what the SPA handler needs from a route.
 * Toolkit-specific route types (RouteEntry) are narrower versions of this.
 */
export interface RouteDefinition {
  /** Route path pattern */
  path: string
  /** Component (opaque to the server — used by the client) */
  component?: unknown
  /** Server-side loader for pre-fetching data */
  loader?: (context: {
    params: Record<string, string>
    scopeChain?: Array<{ scope: string; scopeId: string }>
  }) => Promise<unknown>
}

export interface RegisteredRoute {
  /** Full URL pattern (e.g., '/s/dashboard', '/c/:scopeId/contacts/:id') */
  pattern: string
  /** The module/tool that owns this route */
  toolId: string
  /** The scope type this route belongs to (e.g., 'company') — null for non-scoped routes */
  scopeType: string | null
  /** The original route definition */
  route: RouteDefinition
}

export interface RouteMatch {
  /** The matched route (or null if no route matched) */
  matched: RegisteredRoute | null
  /** URL parameters extracted from the path (e.g., { scopeId: 'co_123', id: 'ct_456' }) */
  params: Record<string, string>
  /** Data returned by the route's loader — undefined if no loader */
  loaderData: unknown | undefined
  /** The raw request path */
  path: string
}

export interface SpaHandlerConfig {
  /** All registered routes — flat list, each with its full URL pattern */
  routes: RegisteredRoute[]
  /**
   * The app's render function. Receives the route match context and returns
   * an HTML string or Response. The framework never generates HTML.
   */
  renderShell: (match: RouteMatch) => Promise<string | Response>
  /**
   * Path prefixes to skip (default: ['/assets', '/favicon', '/_']).
   * Requests matching these prefixes won't go through route matching.
   */
  skipPrefixes?: string[]
  /**
   * API path prefix to skip (default: '/api').
   */
  apiPrefix?: string
}

// ---------------------------------------------------------------------------
// Route matching
// ---------------------------------------------------------------------------

/**
 * Match a URL path against a route pattern.
 *
 * Supports:
 * - Static segments: '/s/dashboard'
 * - Dynamic segments: '/c/:scopeId/contacts/:id'
 *
 * Returns extracted params on match, null on no match.
 */
function matchPattern(
  path: string,
  pattern: string,
): Record<string, string> | null {
  const pathParts = path.split('/').filter(Boolean)
  const patternParts = pattern.split('/').filter(Boolean)

  if (pathParts.length !== patternParts.length) return null

  const params: Record<string, string> = {}

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i]
    const pathPart = pathParts[i]

    if (patternPart.startsWith(':') || patternPart.startsWith('$')) {
      // Dynamic segment — capture the value
      const paramName = patternPart.startsWith(':')
        ? patternPart.slice(1)
        : patternPart.slice(1)
      params[paramName] = pathPart
    } else if (patternPart !== pathPart) {
      return null
    }
  }

  return params
}

// ---------------------------------------------------------------------------
// SPA Handler
// ---------------------------------------------------------------------------

/**
 * Create a Hono handler that serves the SPA with route matching and loader support.
 *
 * Mount as a catch-all after all API routes:
 * ```ts
 * app.get('*', createSpaHandler({ ... }))
 * ```
 */
export function createSpaHandler(config: SpaHandlerConfig) {
  const {
    routes,
    renderShell,
    skipPrefixes = ['/assets', '/favicon', '/_'],
    apiPrefix = '/api',
  } = config

  return async (c: HonoContext) => {
    const path = new URL(c.req.url).pathname
    const logger = getLogger()

    // Skip static assets and API routes
    if (skipPrefixes.some((p) => path.startsWith(p))) return
    if (path.startsWith(apiPrefix)) return

    // 1. Match URL against all registered routes
    let matched: RegisteredRoute | null = null
    let params: Record<string, string> = {}

    for (const route of routes) {
      const result = matchPattern(path, route.pattern)
      if (result) {
        matched = route
        params = result
        break
      }
    }

    // 2. Build the match context
    const match: RouteMatch = {
      matched,
      params,
      loaderData: undefined,
      path,
    }

    // 3. Run loader if the matched route has one
    if (matched?.route.loader) {
      try {
        logger.info(
          { path, toolId: matched.toolId, pattern: matched.pattern },
          'Running route loader'
        )
        match.loaderData = await matched.route.loader({
          params,
          scopeChain: matched.scopeType
            ? [{ scope: matched.scopeType, scopeId: params.scopeId ?? '' }]
            : undefined,
        })
      } catch (error) {
        logger.error(
          {
            path,
            toolId: matched.toolId,
            err: error instanceof Error ? error.message : String(error),
          },
          'Route loader error'
        )
        match.loaderData = undefined
      }
    }

    // 4. Call the app's render function
    const result = await renderShell(match)

    if (result instanceof Response) {
      return result
    }

    return c.html(result)
  }
}
