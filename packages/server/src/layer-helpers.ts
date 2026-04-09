/**
 * Layer authoring helpers — typed factory for creating LayerConfig objects.
 *
 * Layer packages use `createLayerConfig()` instead of manually constructing
 * the `{ tag, layer }` bundle. This enforces the correct shape and provides
 * type safety without exposing Effect internals to the core types package.
 *
 * @example
 * ```ts
 * import { Context, Effect, Layer } from 'effect'
 * import { createLayerConfig } from '@ydtb/anvil-server'
 *
 * const DatabaseTag = Context.GenericTag<DatabaseLayer>('Database')
 *
 * export function postgres(config: { url: string }): LayerConfig<'database'> {
 *   const effectLayer = Layer.scoped(DatabaseTag,
 *     Effect.gen(function* () {
 *       const conn = yield* Effect.acquireRelease(...)
 *       return { db: drizzle(conn) }
 *     })
 *   )
 *
 *   return createLayerConfig('database', DatabaseTag, effectLayer, {
 *     healthCheck: Effect.gen(function* () {
 *       const { db } = yield* DatabaseTag
 *       yield* Effect.tryPromise(() => db.execute(sql`SELECT 1`))
 *       return { status: 'ok', latencyMs: 0 }
 *     }),
 *   })
 * }
 * ```
 */

import type { Context, Effect, Layer } from 'effect'
import type { LayerConfig, LayerMap, HealthStatus } from '@ydtb/anvil'

/**
 * Create a typed LayerConfig with the correct internal structure.
 *
 * This is the recommended way to build LayerConfig objects in layer packages.
 * It enforces the `{ tag, layer }` bundle shape that the lifecycle manager
 * expects, without requiring layer authors to know about the internal contract.
 *
 * @param id - The layer key (must match a key in LayerMap)
 * @param tag - The Effect Context.Tag for this service
 * @param layer - The Effect Layer that provides the service
 * @param options - Optional health check and other config
 */
export function createLayerConfig<K extends keyof LayerMap>(
  id: K,
  tag: Context.Tag<LayerMap[K], LayerMap[K]>,
  layer: Layer.Layer<LayerMap[K], never, never>,
  options?: {
    /** Health check Effect. May require the layer's own service (runs inside ManagedRuntime). */
    healthCheck?: Effect.Effect<HealthStatus, never, any>
  },
): LayerConfig<K> {
  return {
    id,
    _effectLayer: { tag, layer },
    _healthCheck: options?.healthCheck,
  }
}
