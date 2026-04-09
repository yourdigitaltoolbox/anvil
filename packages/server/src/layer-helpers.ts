/**
 * Layer authoring helpers — typed factory for creating LayerConfig objects.
 *
 * Two ways to create layers:
 *
 * 1. **Simple layers (no dependencies):**
 * ```ts
 * import { getLayerTag, createLayerConfig } from '@ydtb/anvil-server'
 *
 * const tag = getLayerTag<DatabaseLayer>('database')
 * const layer = Layer.scoped(tag, Effect.acquireRelease(...))
 * return createLayerConfig('database', layer)
 * ```
 *
 * 2. **Layers with dependencies:**
 * ```ts
 * import { getLayerTag, createLayerConfig } from '@ydtb/anvil-server'
 *
 * const authTag = getLayerTag<AuthLayer>('auth')
 * const dbTag = getLayerTag<DatabaseLayer>('database')
 *
 * const layer = Layer.scoped(authTag,
 *   Effect.gen(function* () {
 *     const { db } = yield* dbTag  // declares dependency on database
 *     return createAuthService(db)
 *   })
 * )
 * return createLayerConfig('auth', layer)
 * ```
 *
 * The lifecycle manager uses Effect's dependency resolution to boot
 * layers in the correct order automatically.
 */

import type { Context, Effect, Layer } from 'effect'
import type { LayerConfig, LayerMap, HealthStatus } from '@ydtb/anvil'
import { getLayerTag } from './layer-tags.ts'

/**
 * Create a typed LayerConfig with the correct internal structure.
 *
 * The tag is automatically derived from the layer key via getLayerTag().
 * The layer may have dependencies on other layers — these are resolved
 * automatically by the lifecycle manager via Effect's dependency graph.
 *
 * @param id - The layer key (must match a key in LayerMap)
 * @param layer - The Effect Layer that provides the service (may depend on other layers)
 * @param options - Optional health check
 */
export function createLayerConfig<K extends keyof LayerMap>(
  id: K,
  layer: Layer.Layer<LayerMap[K], never, any>,
  options?: {
    /** Health check Effect. May require the layer's own service (runs inside ManagedRuntime). */
    healthCheck?: Effect.Effect<HealthStatus, never, any>
  },
): LayerConfig<K> {
  const tag = getLayerTag<LayerMap[K]>(id as string)
  return {
    id,
    _effectLayer: { tag, layer },
    _healthCheck: options?.healthCheck,
  }
}

/**
 * @deprecated Use `createLayerConfig(id, layer, options)` with `getLayerTag()` instead.
 * This overload accepts an explicit tag for backwards compatibility.
 */
export function createLayerConfigWithTag<K extends keyof LayerMap>(
  id: K,
  tag: Context.Tag<LayerMap[K], LayerMap[K]>,
  layer: Layer.Layer<LayerMap[K], never, any>,
  options?: {
    healthCheck?: Effect.Effect<HealthStatus, never, any>
  },
): LayerConfig<K> {
  return {
    id,
    _effectLayer: { tag, layer },
    _healthCheck: options?.healthCheck,
  }
}
