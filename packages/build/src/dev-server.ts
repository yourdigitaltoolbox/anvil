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

// Dynamic import to avoid breaking Node.js/Vite environments
// that load this module's barrel export
type Subprocess = { kill: () => void }
async function bunSpawn(opts: { cmd: string[]; env: Record<string, string | undefined>; stdout: 'inherit'; stderr: 'inherit' }): Promise<Subprocess> {
  const { spawn } = await import('bun')
  return spawn(opts)
}

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

  async function startServer(): Promise<Subprocess> {
    console.log(`\n  [anvil-dev] Starting server: ${serverEntry} (port ${serverPort})`)

    return bunSpawn({
      cmd: ['bun', '--watch', serverEntry],
      env: {
        ...process.env,
        PORT: String(serverPort),
        NODE_ENV: 'development',
      },
      stdout: 'inherit',
      stderr: 'inherit',
    })
  }

  // -----------------------------------------------------------------------
  // Vite client dev server
  // -----------------------------------------------------------------------

  async function startVite(): Promise<Subprocess> {
    console.log(`\n  [anvil-dev] Starting Vite client (port ${clientPort}, proxying /api/* → localhost:${serverPort})`)

    return bunSpawn({
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
  serverProc = await startServer()

  // Give server a moment to boot before starting Vite
  if (clientEntry) {
    await new Promise((r) => setTimeout(r, 1000))
    viteProc = await startVite()
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
