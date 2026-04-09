/**
 * Framework accessors — getLayer(), getHooks()
 *
 * Module-level singletons set during createServer() boot.
 * Tools call these to access infrastructure and the hook system.
 *
 * v0.1: Module-level singleton.
 * v0.2 upgrade path: Check AsyncLocalStorage first, fall back to module-level.
 * The API won't change — only internal resolution.
 *
 * ```ts
 * import { getLayer, getHooks } from '@ydtb/anvil-server'
 *
 * const { db } = getLayer('database')
 * const hooks = getHooks()
 * ```
 */

import type { LayerMap } from '@ydtb/anvil'
import type { HookSystem } from '@ydtb/anvil-hooks'

// ---------------------------------------------------------------------------
// Layer Runtime
// ---------------------------------------------------------------------------

/**
 * Internal layer resolution function.
 * Set by the lifecycle manager during boot. Returns the concrete layer
 * implementation for a given key.
 */
let _layerResolver: (<K extends keyof LayerMap>(key: K) => LayerMap[K]) | null = null

/**
 * Provide the layer resolver. Called internally by createServer() after
 * the ManagedRuntime is created and all resources are acquired.
 *
 * @internal — not part of the public API for tool authors
 */
export function provideLayerResolver(
  resolver: (<K extends keyof LayerMap>(key: K) => LayerMap[K]) | null
): void {
  _layerResolver = resolver
}

/**
 * Access a layer by key. Returns the concrete implementation configured
 * in compose.config.ts.
 *
 * Synchronous — resources are guaranteed to be acquired during boot.
 * Throws if called before createServer() boots layers.
 *
 * @example
 * ```ts
 * const { db } = getLayer('database')
 * const { logger } = getLayer('logging')
 * ```
 */
export function getLayer<K extends keyof LayerMap>(key: K): LayerMap[K] {
  if (!_layerResolver) {
    throw new Error(
      `[anvil-server] Layers not available — createServer() has not booted yet. ` +
      `getLayer('${String(key)}') can only be called after the server has started.`
    )
  }
  return _layerResolver(key)
}

// ---------------------------------------------------------------------------
// Hook System
// ---------------------------------------------------------------------------

let _hookSystem: HookSystem | null = null

/**
 * Provide the HookSystem instance. Called internally by createServer() during boot.
 *
 * @internal — not part of the public API for tool authors
 */
export function provideHookSystem(hooks: HookSystem | null): void {
  _hookSystem = hooks
}

/**
 * Access the hook system. Returns the HookSystem instance created during boot.
 *
 * Throws if called before createServer() boots.
 *
 * @example
 * ```ts
 * const hooks = getHooks()
 * await hooks.doAction('contacts:get', { id: 'ct_123' })
 * ```
 */
export function getHooks(): HookSystem {
  if (!_hookSystem) {
    throw new Error(
      `[anvil-server] Hook system not available — createServer() has not booted yet. ` +
      `getHooks() can only be called after the server has started.`
    )
  }
  return _hookSystem
}
