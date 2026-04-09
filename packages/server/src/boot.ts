/**
 * Shared boot sequence — used by both createServer and createWorker.
 *
 * Handles the common steps:
 * 1. Boot layers (Effect ManagedRuntime)
 * 2. Wire logging layer into getLogger()
 * 3. Create hook system
 * 4. Process tool/extension surfaces (hooks, jobs, contributions)
 *
 * Returns everything both entry points need to continue with their
 * specific work (HTTP routing for server, job processing for worker).
 */

import { HookSystem } from '@ydtb/anvil-hooks'
import type { AppConfig } from '@ydtb/anvil'
import { getLayer } from './accessors.ts'
import { provideHookSystem, provideContributions } from './accessors.ts'
import { provideLoggingLayerResolver } from './request-context.ts'
import { getLogger } from './request-context.ts'
import { bootLifecycle } from './lifecycle.ts'
import type { LifecycleManager } from './lifecycle.ts'
import { processSurfaces } from './surfaces.ts'
import type { ToolEntry, ProcessedSurfaces } from './surfaces.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BootResult {
  /** Lifecycle manager for health checks and shutdown */
  lifecycle: LifecycleManager
  /** The hook system instance */
  hooks: HookSystem
  /** Processed surfaces — routers, contributions, schemas */
  processed: ProcessedSurfaces
  /** Clean up all accessors and shut down layers */
  shutdown: () => Promise<void>
}

export interface BootConfig {
  /** The app composition config from defineApp() */
  config: AppConfig
  /** Tool entries */
  tools: ToolEntry[]
  /** Label for logging (e.g., 'server', 'worker') */
  label: string
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

/**
 * Run the shared boot sequence. Used internally by createServer and createWorker.
 */
export async function boot(bootConfig: BootConfig): Promise<BootResult> {
  const { config, tools, label } = bootConfig
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

  // 3. Create hook system
  const hooks = new HookSystem()
  provideHookSystem(hooks)

  // 4. Process tool and extension surfaces
  const extensions = config.extensions ?? []
  const processed = processSurfaces(hooks, tools, extensions)

  // 5. Make extension contributions available via getContributions()
  provideContributions(processed.contributions)
  for (const [extId, items] of Object.entries(processed.contributions)) {
    if (items.length > 0) {
      logger.info({ extensionId: extId, count: items.length }, 'Collected extension contributions')
    }
  }

  // Shutdown function
  async function shutdown(): Promise<void> {
    const shutdownLogger = getLogger()
    shutdownLogger.info({}, `Shutting down Anvil ${label}`)

    provideHookSystem(null)
    provideContributions(null)
    provideLoggingLayerResolver(null)

    await lifecycle.shutdown()

    shutdownLogger.info({}, `Anvil ${label} shut down`)
  }

  return { lifecycle, hooks, processed, shutdown }
}
