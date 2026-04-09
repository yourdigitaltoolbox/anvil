/**
 * Vite config helper — creates a Vite config with Anvil plugin and API proxy.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { createViteConfig } from '@ydtb/anvil-build'
 * import config from './compose.config'
 *
 * export default createViteConfig({
 *   appConfig: config,
 *   serverPort: 3001,
 * })
 * ```
 */

import type { AppConfig } from '@ydtb/anvil'
import { anvilPlugin } from './plugin.ts'

export interface ViteConfigOptions {
  /** The app composition config from defineApp() */
  appConfig: AppConfig
  /** Port the server runs on — Vite proxies /api/* here (default: 3001) */
  serverPort?: number
  /** Additional Vite plugins */
  plugins?: unknown[]
  /** Additional Vite config overrides */
  overrides?: Record<string, unknown>
}

/**
 * Create a Vite config pre-configured for Anvil.
 *
 * Includes:
 * - Anvil virtual module plugin (tool discovery, schema, scope tree)
 * - Proxy for /api/*, /healthz, /readyz to the server process
 * - React-ready defaults
 */
export function createViteConfig(options: ViteConfigOptions) {
  const {
    appConfig,
    serverPort = 3001,
    plugins = [],
    overrides = {},
  } = options

  const serverUrl = `http://localhost:${serverPort}`

  return {
    plugins: [
      anvilPlugin(appConfig),
      ...plugins,
    ],
    server: {
      proxy: {
        '/api': {
          target: serverUrl,
          changeOrigin: true,
        },
        '/healthz': {
          target: serverUrl,
          changeOrigin: true,
        },
        '/readyz': {
          target: serverUrl,
          changeOrigin: true,
        },
      },
    },
    ...overrides,
  }
}
