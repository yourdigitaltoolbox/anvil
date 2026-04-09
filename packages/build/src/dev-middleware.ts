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
import type { ViteDevServer } from 'vite'
import { Readable, Writable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'

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
 * Pipes requests through Vite's connect middleware stack using
 * Node.js IncomingMessage/ServerResponse streams for full compatibility.
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

  const vite = await createViteServer({
    root,
    configFile,
    server: { middlewareMode: true },
    appType: 'custom',
    ...viteOptions,
  })

  return async (c, next) => {
    const url = new URL(c.req.url)
    const pathname = url.pathname

    // Skip API routes and health endpoints — let Hono handle them
    if (pathname.startsWith('/api') || pathname === '/healthz' || pathname === '/readyz') {
      return next()
    }

    // Pipe through Vite's connect middleware
    const result = await runViteMiddleware(vite, c.req.raw, pathname + url.search)

    if (result) {
      return result
    }

    // Vite didn't handle it — serve transformed index.html as SPA fallback
    if (!pathname.includes('.') || pathname === '/') {
      try {
        const fs = await import('fs')
        const path = await import('path')
        const indexPath = path.join(root, 'index.html')
        if (fs.existsSync(indexPath)) {
          const rawHtml = fs.readFileSync(indexPath, 'utf-8')
          const html = await vite.transformIndexHtml(pathname, rawHtml)
          return new Response(html, {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          })
        }
      } catch (e) {
        console.error('[dev-middleware] Index HTML error:', e)
      }
    }

    return next()
  }
}

/**
 * Run a request through Vite's connect middleware stack.
 *
 * Creates Node.js IncomingMessage/ServerResponse wrappers from the
 * Web Standard Request, pipes through Vite, and returns a Web Response.
 */
function runViteMiddleware(
  vite: ViteDevServer,
  request: Request,
  url: string,
): Promise<Response | null> {
  return new Promise((resolve) => {
    // Build a Node IncomingMessage-like object
    const body = request.body ? Readable.fromWeb(request.body as any) : Readable.from([])
    const req = Object.assign(body, {
      url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      // Properties Vite's middleware checks
      originalUrl: url,
      socket: { remoteAddress: '127.0.0.1', encrypted: false },
    }) as unknown as IncomingMessage

    // Build a ServerResponse-like writable
    const chunks: Buffer[] = []
    let statusCode = 200
    const responseHeaders: Record<string, string | string[]> = {}
    let headersSent = false

    const res = Object.assign(new Writable({
      write(chunk: Buffer, _encoding: string, callback: () => void) {
        chunks.push(chunk)
        callback()
      },
    }), {
      statusCode,
      get headersSent() { return headersSent },
      setHeader(key: string, value: string | string[]) {
        responseHeaders[key.toLowerCase()] = value
      },
      getHeader(key: string) {
        return responseHeaders[key.toLowerCase()]
      },
      removeHeader(key: string) {
        delete responseHeaders[key.toLowerCase()]
      },
      writeHead(status: number, headers?: Record<string, string | string[]>) {
        statusCode = status
        headersSent = true
        if (headers) {
          for (const [k, v] of Object.entries(headers)) {
            responseHeaders[k.toLowerCase()] = v
          }
        }
        return res
      },
      end(chunk?: Buffer | string) {
        if (chunk) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
        }
        headersSent = true

        // Build response
        const body = Buffer.concat(chunks)
        const flatHeaders: Record<string, string> = {}
        for (const [k, v] of Object.entries(responseHeaders)) {
          flatHeaders[k] = Array.isArray(v) ? v.join(', ') : String(v)
        }

        resolve(new Response(body, {
          status: statusCode,
          headers: flatHeaders,
        }))
      },
    }) as unknown as ServerResponse

    // Run through Vite's connect middleware stack
    vite.middlewares(req, res, () => {
      // Vite didn't handle it — return null to let Hono take over
      resolve(null)
    })
  })
}
