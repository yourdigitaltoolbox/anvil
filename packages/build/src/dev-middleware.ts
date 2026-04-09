/**
 * Dev middleware — embeds Vite inside the Hono server for single-process development.
 *
 * One server, one port. Vite runs on an internal Node.js http server,
 * and the Hono middleware proxies non-API requests to it.
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
import http from 'node:http'

export interface DevMiddlewareConfig {
  /** Project root directory (default: process.cwd()) */
  root?: string
  /** Vite config path (default: auto-detected by Vite) */
  configFile?: string
  /** Additional Vite server config overrides */
  viteOptions?: Record<string, unknown>
}

/**
 * Create Hono middleware that embeds Vite for development.
 *
 * Internally creates a Node.js http server with Vite's connect middleware
 * (which requires real Node req/res objects). Non-API requests from Hono
 * are proxied to this internal server via fetch. The internal server
 * listens on a random port — it's not exposed externally.
 */
export async function createDevMiddleware(
  config?: DevMiddlewareConfig,
): Promise<MiddlewareHandler> {
  const {
    root = process.cwd(),
    configFile,
    viteOptions = {},
  } = config ?? {}

  const { createServer: createViteServer } = await import('vite')
  const fs = await import('fs')
  const path = await import('path')

  const vite = await createViteServer({
    root,
    configFile,
    server: { middlewareMode: true },
    appType: 'custom',
    ...viteOptions,
  })

  // Create an internal Node.js http server with Vite's connect middleware.
  // This gives Vite the real Node IncomingMessage/ServerResponse it needs.
  const indexHtmlPath = path.join(root, 'index.html')

  const internalServer = http.createServer((req, res) => {
    vite.middlewares(req, res, async () => {
      // Vite didn't handle it — serve transformed index.html as SPA fallback
      const url = req.url ?? '/'
      const ext = path.extname(url.split('?')[0])

      if (!ext || ext === '.html') {
        try {
          if (fs.existsSync(indexHtmlPath)) {
            const rawHtml = fs.readFileSync(indexHtmlPath, 'utf-8')
            const html = await vite.transformIndexHtml(url, rawHtml)
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
            res.end(html)
            return
          }
        } catch (e) {
          console.error('[dev-middleware] Index HTML error:', e)
        }
      }

      res.writeHead(404)
      res.end('Not found')
    })
  })

  // Listen on a random port (internal only — not exposed externally)
  const internalPort = await new Promise<number>((resolve) => {
    internalServer.listen(0, '127.0.0.1', () => {
      const addr = internalServer.address()
      resolve(typeof addr === 'object' && addr ? addr.port : 0)
    })
  })

  console.log(`[dev-middleware] Vite internal server on port ${internalPort}`)

  return async (c, next) => {
    const url = new URL(c.req.url)
    const pathname = url.pathname

    // Skip API routes and health endpoints — let Hono handle them
    if (pathname.startsWith('/api') || pathname === '/healthz' || pathname === '/readyz') {
      return next()
    }

    // Proxy to the internal Vite server
    try {
      const proxyUrl = `http://127.0.0.1:${internalPort}${pathname}${url.search}`
      const proxyRes = await fetch(proxyUrl, {
        method: c.req.method,
        headers: c.req.raw.headers,
      })

      // Forward the response
      return new Response(proxyRes.body, {
        status: proxyRes.status,
        headers: proxyRes.headers,
      })
    } catch (e) {
      console.error('[dev-middleware] Proxy error:', e)
      return next()
    }
  }
}
