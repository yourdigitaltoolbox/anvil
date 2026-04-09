/**
 * Lifecycle manager — Effect-powered resource composition, health checks, shutdown.
 *
 * Takes layer configs from defineApp, composes them via Effect's Layer system,
 * creates a ManagedRuntime that acquires resources in dependency order, and
 * provides a shutdown function that tears everything down in reverse.
 *
 * ## How layer resolution works
 *
 * Each LayerConfig's `_effectLayer` is expected to be an object with:
 * - `tag` — the Effect Context.Tag used to resolve the service
 * - `layer` — the Effect Layer that provides the service
 *
 * The lifecycle manager merges all layers, creates a ManagedRuntime,
 * then resolves each service via its tag. The resolved values are cached
 * in a Map for synchronous access via getLayer().
 *
 * This is the only module in the framework that touches Effect directly.
 */

import { Effect, Layer, ManagedRuntime } from 'effect'
import type { Context } from 'effect'
import type { LayerMap, LayerConfig, HealthStatus, RequiredLayers } from '@ydtb/anvil'
import { provideLayerResolver } from './accessors.ts'
import { getLogger } from './request-context.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LifecycleManager {
  /** Check health of all layers with registered health checks */
  checkHealth: () => Promise<Record<string, HealthStatus>>
  /** Gracefully shut down all resources in reverse order */
  shutdown: () => Promise<void>
}

/**
 * Internal shape of _effectLayer. Layer packages return this structure
 * inside the `_effectLayer` field of LayerConfig.
 *
 * @internal
 */
export interface EffectLayerBundle {
  /** The Effect Context.Tag for resolving the service from the runtime */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tag: Context.Tag<any, any>
  /** The Effect Layer that provides the service (with lifecycle) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layer: Layer.Layer<any, never, any>
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

/**
 * Boot the lifecycle manager. Composes all layers, creates the ManagedRuntime,
 * acquires resources, and wires up the getLayer() accessor.
 *
 * @returns A lifecycle manager with health check and shutdown capabilities.
 */
export async function bootLifecycle(layers: RequiredLayers): Promise<LifecycleManager> {
  const logger = getLogger()
  const entries = Object.entries(layers) as Array<[string, LayerConfig]>

  if (entries.length === 0) {
    logger.info({}, 'No layers configured — skipping lifecycle boot')
    provideLayerResolver((() => {
      throw new Error('[anvil-server] No layers configured')
    }) as never)
    return {
      checkHealth: async () => ({}),
      shutdown: async () => {},
    }
  }

  // Extract Effect bundles from configs
  const bundles = entries.map(([key, config]) => ({
    key,
    bundle: config._effectLayer as EffectLayerBundle,
    healthCheck: config._healthCheck as Effect.Effect<HealthStatus, never, never> | undefined,
  }))

  // Compose all layers with dependency resolution.
  // Layer.provideMerge resolves inter-layer dependencies:
  // if auth depends on database, Effect figures out the boot order.
  const composedLayer = bundles.reduce<Layer.Layer<any, never, any>>(
    (acc, { bundle }) => Layer.provideMerge(acc, bundle.layer),
    Layer.empty as unknown as Layer.Layer<any, never, any>,
  )

  // Create the ManagedRuntime — this acquires all resources
  logger.info({ layers: entries.map(([key]) => key) }, 'Booting layers')

  const runtime = ManagedRuntime.make(composedLayer as Layer.Layer<any, never, never>)

  // Resolve each service from the runtime using its tag
  const resolvedLayers = new Map<string, unknown>()

  for (const { key, bundle } of bundles) {
    try {
      const value = await runtime.runPromise(
        bundle.tag as unknown as Effect.Effect<unknown, never, never>
      )
      resolvedLayers.set(key, value)
    } catch (error) {
      logger.error(
        { key, error: error instanceof Error ? error.message : String(error) },
        'Failed to resolve layer'
      )
      throw new Error(
        `[anvil-server] Failed to resolve layer '${key}'. ` +
        `Ensure the layer's _effectLayer has a valid { tag, layer } bundle.`
      )
    }
  }

  // Wire up the getLayer() accessor
  provideLayerResolver(<K extends keyof LayerMap>(key: K): LayerMap[K] => {
    const value = resolvedLayers.get(key as string)
    if (value === undefined) {
      throw new Error(
        `[anvil-server] Layer '${String(key)}' not resolved. ` +
        `Ensure the layer is configured in compose.config.ts.`
      )
    }
    return value as LayerMap[K]
  })

  logger.info({ layers: entries.map(([key]) => key) }, 'All layers booted')

  // Collect health checks
  const healthChecks: Array<{ key: string; check: Effect.Effect<HealthStatus, never, never> }> = []
  for (const { key, healthCheck } of bundles) {
    if (healthCheck) {
      healthChecks.push({ key, check: healthCheck })
    }
  }

  return {
    checkHealth: async () => {
      const results: Record<string, HealthStatus> = {}

      await Promise.all(
        healthChecks.map(async ({ key, check }) => {
          try {
            const result = await runtime.runPromise(
              Effect.timeout(check, '500 millis')
            )
            results[key] = result
          } catch (error) {
            results[key] = {
              status: 'error',
              message: error instanceof Error ? error.message : 'Health check failed',
            }
          }
        })
      )

      return results
    },

    shutdown: async () => {
      logger.info({}, 'Shutting down layers')
      provideLayerResolver(null)
      await runtime.dispose()
      logger.info({}, 'All layers shut down')
    },
  }
}
