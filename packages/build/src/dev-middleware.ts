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
 * Only use in development.
 *
 * Uses Vite's native fetch handler (available in Vite 6+) or falls back
 * to transformRequest for module serving.
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
    server: {
      middlewareMode: true,
      hmr: {
        // Use websocket on a separate path to avoid conflicts with Hono
        path: '/__vite_hmr',
      },
    },
    appType: 'custom',
    ...viteOptions,
  })

  const indexHtmlPath = path.join(root, 'index.html')

  return async (c, next) => {
    const url = new URL(c.req.url)
    const pathname = url.pathname

    // Skip API routes and health endpoints — let Hono handle them
    if (pathname.startsWith('/api') || pathname === '/healthz' || pathname === '/readyz') {
      return next()
    }

    // Handle Vite HMR websocket — pass through (Bun.serve handles upgrade separately)
    // For regular HTTP requests, delegate to Vite

    try {
      // Try to serve via Vite's internal middleware using a fetch-based approach
      const viteResponse = await handleViteRequest(vite, c.req.raw, pathname, root, fs, path, indexHtmlPath)
      if (viteResponse) {
        return viteResponse
      }
    } catch (e) {
      // Vite couldn't handle it — log and fall through
      console.error('[dev-middleware] Vite error:', e)
    }

    // Vite didn't handle it — let Hono try
    return next()
  }
}

// ---------------------------------------------------------------------------
// Vite request handling
// ---------------------------------------------------------------------------

async function handleViteRequest(
  vite: ViteDevServer,
  request: Request,
  pathname: string,
  root: string,
  fs: typeof import('fs'),
  path: typeof import('path'),
  indexHtmlPath: string,
): Promise<Response | null> {

  // 1. Vite special paths (client, HMR)
  if (pathname.startsWith('/@') || pathname.startsWith('/__vite')) {
    return transformAndServe(vite, pathname)
  }

  // 2. Node modules (.vite deps, optimized deps)
  if (pathname.startsWith('/node_modules/') || pathname.includes('.vite')) {
    return transformAndServe(vite, pathname)
  }

  // 3. Source files (.ts, .tsx, .js, .jsx, .css, .json, etc.)
  const ext = path.extname(pathname)
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css', '.json', '.svg', '.png', '.jpg', '.gif', '.woff', '.woff2', '.ttf', '.eot'].includes(ext)) {
    // Check if the file exists in the project
    const filePath = path.join(root, pathname)
    if (fs.existsSync(filePath)) {
      return transformAndServe(vite, pathname)
    }
    // Also try as a module specifier
    return transformAndServe(vite, pathname)
  }

  // 4. SPA fallback — serve transformed index.html for page requests
  if (!ext || ext === '.html') {
    try {
      if (fs.existsSync(indexHtmlPath)) {
        const rawHtml = fs.readFileSync(indexHtmlPath, 'utf-8')
        const transformedHtml = await vite.transformIndexHtml(pathname, rawHtml)
        return new Response(transformedHtml, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      }
    } catch {
      // index.html transform failed
    }
  }

  return null
}

async function transformAndServe(
  vite: ViteDevServer,
  pathname: string,
): Promise<Response | null> {
  try {
    const result = await vite.transformRequest(pathname)
    if (!result) return null

    // Determine content type
    let contentType = 'application/javascript'
    if (pathname.endsWith('.css')) {
      contentType = 'text/css'
    } else if (pathname.endsWith('.json')) {
      contentType = 'application/json'
    } else if (pathname.endsWith('.svg')) {
      contentType = 'image/svg+xml'
    }

    return new Response(result.code, {
      status: 200,
      headers: {
        'content-type': contentType,
        ...(result.map ? { 'x-sourcemap': 'true' } : {}),
      },
    })
  } catch {
    return null
  }
}
