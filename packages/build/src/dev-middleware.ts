/**
 * Dev middleware — embeds Vite inside the Hono server for single-process development.
 *
 * One server, one port. Vite runs in middleware mode — HMR, React Fast Refresh,
 * and asset serving all happen through the same Hono app that serves API routes.
 *
 * @example
 * ```ts
 * import { createDevMiddleware } from '@ydtb/anvil-build'
 *
 * const server = createToolServer({
 *   config,
 *   tools,
 *   middleware: [
 *     await createDevMiddleware({ root: process.cwd() }),
 *     authMiddleware(),
 *   ],
 * })
 *
 * await server.start()
 * Bun.serve({ port: 3000, fetch: server.app.fetch })
 * ```
 */

import type { MiddlewareHandler } from 'hono'

export interface DevMiddlewareConfig {
  /** Project root directory (default: process.cwd()) */
  root?: string
  /** Vite config path (default: auto-detected by Vite) */
  configFile?: string
  /** Additional Vite server config overrides */
  viteOptions?: Record<string, unknown>
}

/**
 * Create Hono middleware that embeds Vite in middleware mode.
 *
 * Must be awaited — Vite server creation is async.
 * Only use in development. In production, serve static assets via CDN or
 * Hono's static file middleware.
 *
 * Handles:
 * - HMR websocket upgrades
 * - React Fast Refresh
 * - Module transformation and serving
 * - index.html transformation
 * - Static asset serving from /public
 *
 * Passes through to Hono for:
 * - /api/* routes
 * - /healthz, /readyz
 * - Any route Vite doesn't handle
 */
export async function createDevMiddleware(
  config?: DevMiddlewareConfig,
): Promise<MiddlewareHandler> {
  const {
    root = process.cwd(),
    configFile,
    viteOptions = {},
  } = config ?? {}

  // Dynamic import — Vite is a dev dependency, not needed in production
  const { createServer: createViteServer } = await import('vite')

  const vite = await createViteServer({
    root,
    configFile,
    server: { middlewareMode: true },
    appType: 'spa',
    ...viteOptions,
  })

  return async (c, next) => {
    const url = new URL(c.req.url)
    const path = url.pathname

    // Skip API routes and health endpoints — let Hono handle them
    if (path.startsWith('/api') || path === '/healthz' || path === '/readyz') {
      return next()
    }

    // Try Vite first
    return new Promise<Response | void>((resolve) => {
      // Create a Node-compatible req/res pair for Vite's connect middleware
      const req = createNodeRequest(c.req.raw, path, url.search)
      const res = createNodeResponse((statusCode, headers, body) => {
        resolve(new Response(body, {
          status: statusCode,
          headers: headers as Record<string, string>,
        }))
      })

      // Run through Vite's middleware stack
      vite.middlewares(req as any, res as any, () => {
        // Vite didn't handle it — check if it's a page request
        // that should get the transformed index.html
        if (!path.includes('.') || path === '/') {
          // SPA fallback — serve transformed index.html
          vite.transformIndexHtml(path, getIndexHtml(root)).then((html) => {
            resolve(new Response(html, {
              status: 200,
              headers: { 'content-type': 'text/html' },
            }))
          }).catch(() => {
            // No index.html — let Hono handle it
            resolve(next() as any)
          })
        } else {
          // Static file Vite didn't handle — pass to Hono
          resolve(next() as any)
        }
      })
    })
  }
}

// ---------------------------------------------------------------------------
// Helpers — minimal Node.js compat for Vite's connect middleware
// ---------------------------------------------------------------------------

function createNodeRequest(request: Request, path: string, search: string) {
  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    headers[key] = value
  })

  return {
    url: path + search,
    method: request.method,
    headers,
    on: () => {},
    pipe: () => {},
    // Vite's connect middleware checks these
    originalUrl: path + search,
    socket: { remoteAddress: '127.0.0.1' },
  }
}

function createNodeResponse(
  onFinish: (status: number, headers: Record<string, string>, body: string) => void,
) {
  let statusCode = 200
  const headers: Record<string, string> = {}
  let body = ''

  return {
    statusCode,
    setHeader(key: string, value: string) {
      headers[key] = value
    },
    getHeader(key: string) {
      return headers[key]
    },
    writeHead(status: number, hdrs?: Record<string, string>) {
      statusCode = status
      if (hdrs) Object.assign(headers, hdrs)
    },
    write(chunk: string | Buffer) {
      body += typeof chunk === 'string' ? chunk : chunk.toString()
    },
    end(chunk?: string | Buffer) {
      if (chunk) body += typeof chunk === 'string' ? chunk : chunk.toString()
      onFinish(statusCode, headers, body)
    },
    on: () => {},
  }
}

function getIndexHtml(root: string): string {
  try {
    const fs = require('fs')
    const path = require('path')
    return fs.readFileSync(path.join(root, 'index.html'), 'utf-8')
  } catch {
    return '<!DOCTYPE html><html><body><div id="app"></div><script type="module" src="/client/main.tsx"></script></body></html>'
  }
}
