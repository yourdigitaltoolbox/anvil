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

// ---------------------------------------------------------------------------
// Extension Contributions
// ---------------------------------------------------------------------------

let _contributions: Record<string, unknown[]> = {}

/**
 * Provide collected extension contributions. Called internally by
 * createServer() after processing surfaces.
 *
 * @internal
 */
export function provideContributions(contributions: Record<string, unknown[]> | null): void {
  _contributions = contributions ?? {}
}

/**
 * Access collected contributions for an extension.
 *
 * Extensions call this in their route handlers or hooks to retrieve
 * the data that tools contributed to them via server surfaces.
 *
 * @param extensionId - The extension's id (e.g. 'widgets', 'search')
 * @returns Array of contribution objects from all tools, typed via generic
 *
 * @example
 * ```ts
 * import { getContributions } from '@ydtb/anvil-server'
 * import type { WidgetEntry } from './types'
 *
 * // In an extension's route handler:
 * const widgets = getContributions<{ items: WidgetEntry[] }>('widgets')
 * // Returns: [{ toolId: 'greeter', items: [...] }, { toolId: 'billing', items: [...] }]
 * ```
 */
export function getContributions<T = unknown>(extensionId: string): Array<T & { toolId: string }> {
  return (_contributions[extensionId] ?? []) as Array<T & { toolId: string }>
}
