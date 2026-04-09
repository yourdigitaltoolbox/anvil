/**
 * Dev server — runs Vite for the client and a server process with file watching.
 *
 * Single command starts both:
 * ```ts
 * import { createDevServer } from '@ydtb/anvil-build'
 *
 * createDevServer({
 *   serverEntry: './server/index.ts',
 *   clientEntry: './client/main.tsx',
 *   serverPort: 3001,
 *   clientPort: 3000,
 * })
 * ```
 *
 * - Client: Vite dev server with HMR, proxies /api/* to the server
 * - Server: Bun subprocess with --watch for auto-restart on file changes
 */

import { spawn, type Subprocess } from 'bun'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DevServerConfig {
  /** Path to the server entry file (e.g., './server/index.ts') */
  serverEntry: string
  /** Port for the server process (default: 3001) */
  serverPort?: number
  /** Path to the client entry file — if provided, starts Vite (e.g., './client/main.tsx') */
  clientEntry?: string
  /** Port for the Vite dev server (default: 3000) */
  clientPort?: number
  /** Additional paths to watch for server restart (default: ['./server', './extensions', './tools', './middleware', './schema', './plugins']) */
  watchPaths?: string[]
  /** Vite config path (default: './vite.config.ts') */
  viteConfig?: string
}

// ---------------------------------------------------------------------------
// Dev Server
// ---------------------------------------------------------------------------

/**
 * Start the Anvil dev server.
 *
 * Runs the server process with Bun's --watch flag for auto-restart,
 * and optionally starts Vite for the client with HMR.
 */
export async function createDevServer(config: DevServerConfig): Promise<void> {
  const {
    serverEntry,
    serverPort = 3001,
    clientEntry,
    clientPort = 3000,
    viteConfig = './vite.config.ts',
  } = config

  let serverProc: Subprocess | null = null
  let viteProc: Subprocess | null = null

  // -----------------------------------------------------------------------
  // Server process (Bun --watch)
  // -----------------------------------------------------------------------

  function startServer(): Subprocess {
    console.log(`\n  [anvil-dev] Starting server: ${serverEntry} (port ${serverPort})`)

    const proc = spawn({
      cmd: ['bun', '--watch', serverEntry],
      env: {
        ...process.env,
        PORT: String(serverPort),
        NODE_ENV: 'development',
      },
      stdout: 'inherit',
      stderr: 'inherit',
    })

    return proc
  }

  // -----------------------------------------------------------------------
  // Vite client dev server
  // -----------------------------------------------------------------------

  function startVite(): Subprocess {
    console.log(`\n  [anvil-dev] Starting Vite client (port ${clientPort}, proxying /api/* → localhost:${serverPort})`)

    const proc = spawn({
      cmd: [
        'bunx', 'vite',
        '--port', String(clientPort),
        '--config', viteConfig,
      ],
      env: {
        ...process.env,
        VITE_API_URL: `http://localhost:${serverPort}`,
        NODE_ENV: 'development',
      },
      stdout: 'inherit',
      stderr: 'inherit',
    })

    return proc
  }

  // -----------------------------------------------------------------------
  // Shutdown
  // -----------------------------------------------------------------------

  function shutdown() {
    console.log('\n  [anvil-dev] Shutting down...')
    if (serverProc) serverProc.kill()
    if (viteProc) viteProc.kill()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  // -----------------------------------------------------------------------
  // Start
  // -----------------------------------------------------------------------

  // Start server first (client proxies to it)
  serverProc = startServer()

  // Give server a moment to boot before starting Vite
  if (clientEntry) {
    await new Promise((r) => setTimeout(r, 1000))
    viteProc = startVite()
  }

  console.log(`
  [anvil-dev] Development servers running:
    Server: http://localhost:${serverPort}
    ${clientEntry ? `Client: http://localhost:${clientPort}` : 'Client: not configured'}

  Press Ctrl+C to stop.
`)

  // Keep the process alive
  await new Promise(() => {})
}
