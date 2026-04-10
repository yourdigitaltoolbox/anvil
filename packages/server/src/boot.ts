/**
 * Shared boot sequence — used by both createServer and createWorker.
 *
 * Handles the common steps:
 * 1. Boot layers (Effect ManagedRuntime)
 * 2. Wire logging/cache resolvers
 * 3. Create hook system
 * 4. Process module surfaces via pluggable processor (toolkit provides this)
 *
 * Returns everything both entry points need to continue with their
 * specific work (HTTP routing for server, job processing for worker).
 */

import { HookSystem } from '@ydtb/anvil-hooks'
import type { AppConfig, Extension } from '@ydtb/anvil'
import { getLayer } from './accessors.ts'
import { provideHookSystem, provideContributions } from './accessors.ts'
import { provideLoggingLayerResolver } from './request-context.ts'
import { getLogger } from './request-context.ts'
import { provideCacheResolver } from './cache-helpers.ts'
import { bootLifecycle } from './lifecycle.ts'
import type { LifecycleManager } from './lifecycle.ts'
import { runExtensionBoot, runExtensionShutdown, clearExtensionLifecycle } from './extension-lifecycle.ts'


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of processing module surfaces — generic, toolkit defines the shape */
export interface ProcessedResult {
  /** Map of module/extension ID → router (Hono sub-app) */
  routers: Record<string, unknown>
  /** Extension contributions collected from modules */
  contributions: Record<string, unknown[]>
  /** Collected schemas (for database migrations) */
  schemas: Record<string, unknown>
}

export interface BootResult {
  /** Lifecycle manager for health checks and shutdown */
  lifecycle: LifecycleManager
  /** The hook system instance */
  hooks: HookSystem
  /** Processed surfaces — routers, contributions, schemas */
  processed: ProcessedResult
  /** Clean up all accessors and shut down layers */
  shutdown: () => Promise<void>
}

export interface BootConfig {
  /** The app composition config from defineApp() */
  config: AppConfig
  /** Modules to process — shape depends on toolkit (tools, plugins, etc.) */
  modules?: unknown[]
  /** Label for logging (e.g., 'server', 'worker') */
  label: string
  /**
   * Surface processor — toolkit provides this to process its module surfaces.
   * If not provided, falls back to the built-in processSurfaces (during transition).
   */
  processSurfaces?: (hooks: HookSystem, modules: unknown[], extensions: Extension[]) => ProcessedResult
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

/**
 * Run the shared boot sequence. Used internally by createServer and createWorker.
 */
export async function boot(bootConfig: BootConfig): Promise<BootResult> {
  const { config, modules = [], label, processSurfaces } = bootConfig
  const logger = getLogger()

  // 1. Boot layers
  logger.info({}, `Starting Anvil ${label}`)
  const lifecycle = await bootLifecycle(config.layers)

  // 2. Wire logging layer into getLogger() if available
  provideLoggingLayerResolver(() => {
    try {
      const layer = (getLayer as (key: string) => unknown)('logging')
      if (layer && typeof (layer as Record<string, unknown>).logger === 'object') {
        return layer as { logger: import('@ydtb/anvil').Logger }
      }
      return null
    } catch {
      return null
    }
  })

  // 2b. Wire cache resolver for cache helpers
  provideCacheResolver((key: string) => (getLayer as (key: string) => unknown)(key))

  // 3. Create hook system
  const hooks = new HookSystem()
  provideHookSystem(hooks)

  // 4. Process module surfaces
  const extensions = config.extensions ?? []
  let processed: ProcessedResult
  if (processSurfaces) {
    processed = processSurfaces(hooks, modules, extensions)
  } else {
    // No surface processor — toolkit not providing one. Empty result.
    processed = { routers: {}, contributions: {}, schemas: {} }
  }

  // 5. Make extension contributions available via getContributions()
  provideContributions(processed.contributions)
  for (const [extId, items] of Object.entries(processed.contributions)) {
    if (items.length > 0) {
      logger.info({ extensionId: extId, count: items.length }, 'Collected extension contributions')
    }
  }

  // 6. Run extension boot hooks (post-collection lifecycle)
  await runExtensionBoot(processed.contributions)

  // Shutdown function
  async function shutdown(): Promise<void> {
    const shutdownLogger = getLogger()
    shutdownLogger.info({}, `Shutting down Anvil ${label}`)

    // Run extension shutdown hooks before tearing down layers
    await runExtensionShutdown()

    provideHookSystem(null)
    provideContributions(null)
    provideLoggingLayerResolver(null)
    provideCacheResolver(null)
    clearExtensionLifecycle()

    await lifecycle.shutdown()

    shutdownLogger.info({}, `Anvil ${label} shut down`)
  }

  return { lifecycle, hooks, processed, shutdown }
}
