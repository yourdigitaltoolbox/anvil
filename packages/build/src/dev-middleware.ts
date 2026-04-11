/**
 * Dev middleware — embeds Vite inside the Hono server for single-process development.
 *
 * One server, one port. Vite runs on an internal Node.js http server,
 * and the Hono middleware proxies non-API requests to it. WebSocket
 * upgrades (for Vite HMR) are proxied via Bun.serve's WebSocket API.
 *
 * @example
 * ```ts
 * import { createDevMiddleware } from '@ydtb/anvil-build'
 *
 * const dev = await createDevMiddleware({ root: process.cwd() })
 *
 * const server = createToolServer({
 *   config,
 *   tools,
 *   middleware: [dev],
 * })
 *
 * await server.start()
 *
 * // Wire up both HTTP and WebSocket handling:
 * Bun.serve({
 *   port: 3000,
 *   fetch(req, srv) {
 *     if (dev.handleUpgrade(req, srv)) return
 *     return server.app.fetch(req)
 *   },
 *   websocket: dev.websocket,
 * })
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
 * Extended middleware handler with WebSocket support for Vite HMR.
 *
 * Still a callable MiddlewareHandler (backward compatible), but also
 * exposes `handleUpgrade`, `websocket`, and `close` for full HMR support.
 */
export interface DevMiddleware extends MiddlewareHandler {
  /**
   * Check if an HTTP request is a Vite HMR WebSocket upgrade and handle it.
   * Call from your Bun.serve `fetch` handler before `app.fetch`.
   * Returns `true` if the request was upgraded (no further handling needed).
   *
   * Only upgrades WebSocket requests for non-API paths (`/api`, `/healthz`, `/readyz`
   * are skipped). Non-WebSocket requests return `false` immediately.
   */
  handleUpgrade: (
    req: Request,
    server: { upgrade: (req: Request, opts?: { data?: unknown }) => boolean },
  ) => boolean
  /**
   * WebSocket handlers for Bun.serve — relay messages between browser and
   * Vite's internal HMR server.
   *
   * Pass directly to `Bun.serve({ websocket: dev.websocket })`.
   *
   * These handlers check `ws.data.type === 'vite-hmr'` before acting, so
   * they can coexist with app-owned WebSocket connections — just merge
   * the handlers if your app has its own WebSocket needs.
   */
  websocket: {
    open: (ws: unknown) => void
    message: (ws: unknown, msg: string | ArrayBuffer) => void
    close: (ws: unknown) => void
  }
  /** Shut down the internal Vite server and close connections. */
  close: () => Promise<void>
}

/**
 * Create Hono middleware that embeds Vite for development.
 *
 * Internally creates a Node.js http server with Vite's connect middleware
 * and Vite's HMR WebSocket server attached. Non-API HTTP requests from
 * Hono are proxied to this internal server via fetch. WebSocket upgrades
 * are proxied via `handleUpgrade` + `websocket` handlers for Bun.serve.
 *
 * The internal server listens on a random port on 127.0.0.1 — it's not
 * exposed externally.
 */
export async function createDevMiddleware(
  config?: DevMiddlewareConfig,
): Promise<DevMiddleware> {
  const {
    root = process.cwd(),
    configFile,
    viteOptions = {},
  } = config ?? {}

  const { createServer: createViteServer } = await import('vite')
  const fs = await import('fs')
  const path = await import('path')

  // Create internal Node.js server first — Vite attaches its HMR WebSocket
  // to this server's 'upgrade' event, so it must exist before createViteServer.
  const internalServer = http.createServer()

  const vite = await createViteServer({
    root,
    configFile,
    server: {
      middlewareMode: true,
      hmr: { server: internalServer },
    },
    appType: 'custom',
    ...viteOptions,
  })

  // Attach HTTP request handler to the internal server
  const indexHtmlPath = path.join(root, 'index.html')

  internalServer.on('request', (req, res) => {
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

  // ---------------------------------------------------------------------------
  // HTTP proxy middleware (Hono)
  // ---------------------------------------------------------------------------

  const middleware: MiddlewareHandler = async (c, next) => {
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

  // ---------------------------------------------------------------------------
  // WebSocket upgrade handler (for Bun.serve)
  // ---------------------------------------------------------------------------

  const handleUpgrade = (
    req: Request,
    server: { upgrade: (req: Request, opts?: { data?: unknown }) => boolean },
  ): boolean => {
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return false

    const url = new URL(req.url)
    if (url.pathname.startsWith('/api')) return false

    return server.upgrade(req, {
      data: { type: 'vite-hmr', viteWs: null, buffer: [] as (string | ArrayBuffer)[] },
    })
  }

  // ---------------------------------------------------------------------------
  // WebSocket handlers (for Bun.serve) — proxy to internal Vite HMR
  // ---------------------------------------------------------------------------

  const websocket = {
    open(ws: any) {
      if (ws.data?.type !== 'vite-hmr') return

      const viteWs = new WebSocket(`ws://127.0.0.1:${internalPort}/`)
      const buffer = ws.data.buffer as (string | ArrayBuffer)[]

      viteWs.onopen = () => {
        for (const msg of buffer) viteWs.send(msg)
        buffer.length = 0
      }

      viteWs.onmessage = (event: MessageEvent) => {
        try {
          ws.send(typeof event.data === 'string' ? event.data : new Uint8Array(event.data))
        } catch {
          // Client already closed
        }
      }

      viteWs.onclose = () => {
        try { ws.close() } catch { /* already closed */ }
      }

      viteWs.onerror = () => {
        try { ws.close() } catch { /* already closed */ }
      }

      ws.data.viteWs = viteWs
    },

    message(ws: any, msg: string | ArrayBuffer) {
      if (ws.data?.type !== 'vite-hmr') return

      const { viteWs, buffer } = ws.data
      if (viteWs?.readyState === WebSocket.OPEN) {
        viteWs.send(msg)
      } else if (buffer) {
        buffer.push(msg)
      }
    },

    close(ws: any) {
      if (ws.data?.type !== 'vite-hmr') return
      try { ws.data.viteWs?.close() } catch { /* already closed */ }
    },
  }

  // ---------------------------------------------------------------------------
  // Clean shutdown
  // ---------------------------------------------------------------------------

  const close = async () => {
    await vite.close()
    await new Promise<void>((resolve) => internalServer.close(() => resolve()))
  }

  return Object.assign(middleware, { handleUpgrade, websocket, close })
}
