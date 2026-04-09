/**
 * Framework accessors — getLayer(), getHooks(), getContributions()
 *
 * v0.2: Check AsyncLocalStorage first, fall back to module-level.
 * This enables test isolation (two servers in one process) and
 * per-request scoped resolution.
 *
 * The API hasn't changed — tools still call getLayer('database').
 * Only the internal resolution strategy changed.
 *
 * ```ts
 * import { getLayer, getHooks } from '@ydtb/anvil-server'
 *
 * const { db } = getLayer('database')
 * const hooks = getHooks()
 * ```
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import type { LayerMap } from '@ydtb/anvil'
import type { HookSystem } from '@ydtb/anvil-hooks'

// ---------------------------------------------------------------------------
// Scoped context — AsyncLocalStorage for test isolation
// ---------------------------------------------------------------------------

interface ScopedContext {
  layerResolver: (<K extends keyof LayerMap>(key: K) => LayerMap[K]) | null
  hookSystem: HookSystem | null
  contributions: Record<string, unknown[]>
}

const scopedContext = new AsyncLocalStorage<ScopedContext>()

/**
 * Run a function with scoped accessors. Used for test isolation —
 * each test can have its own layer resolver, hook system, and contributions
 * without affecting other tests running in the same process.
 *
 * @example
 * ```ts
 * import { withLayers } from '@ydtb/anvil-server'
 *
 * it('creates a contact', async () => {
 *   await withLayers(testServer, async () => {
 *     // getLayer('database') returns this test's DB
 *     const result = await createContact({ name: 'John' })
 *     expect(result.name).toBe('John')
 *   })
 * })
 * ```
 */
export function withLayers(
  context: {
    layerResolver?: (<K extends keyof LayerMap>(key: K) => LayerMap[K]) | null
    hookSystem?: HookSystem | null
    contributions?: Record<string, unknown[]>
  },
  fn: () => Promise<void> | void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    scopedContext.run(
      {
        layerResolver: context.layerResolver ?? null,
        hookSystem: context.hookSystem ?? null,
        contributions: context.contributions ?? {},
      },
      async () => {
        try {
          await fn()
          resolve()
        } catch (e) {
          reject(e)
        }
      },
    )
  })
}

// ---------------------------------------------------------------------------
// Module-level fallback (production path — zero overhead)
// ---------------------------------------------------------------------------

let _layerResolver: (<K extends keyof LayerMap>(key: K) => LayerMap[K]) | null = null
let _hookSystem: HookSystem | null = null
let _contributions: Record<string, unknown[]> = {}

// ---------------------------------------------------------------------------
// Layer Runtime
// ---------------------------------------------------------------------------

/**
 * Provide the layer resolver at module level.
 * Called internally by createServer() after boot.
 * @internal
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
 * Resolution order:
 * 1. AsyncLocalStorage scoped context (for test isolation)
 * 2. Module-level resolver (production path)
 *
 * Synchronous — resources are guaranteed to be acquired during boot.
 * Throws if called before createServer() boots layers.
 */
export function getLayer<K extends keyof LayerMap>(key: K): LayerMap[K] {
  // Check scoped context first (test isolation)
  const scoped = scopedContext.getStore()
  if (scoped?.layerResolver) {
    return scoped.layerResolver(key)
  }

  // Fall back to module-level
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

/**
 * Provide the HookSystem instance at module level.
 * @internal
 */
export function provideHookSystem(hooks: HookSystem | null): void {
  _hookSystem = hooks
}

/**
 * Access the hook system.
 *
 * Resolution order:
 * 1. AsyncLocalStorage scoped context
 * 2. Module-level singleton
 */
export function getHooks(): HookSystem {
  const scoped = scopedContext.getStore()
  if (scoped?.hookSystem) {
    return scoped.hookSystem
  }

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

/**
 * Provide collected extension contributions at module level.
 * @internal
 */
export function provideContributions(contributions: Record<string, unknown[]> | null): void {
  _contributions = contributions ?? {}
}

/**
 * Access collected contributions for an extension.
 *
 * Resolution order:
 * 1. AsyncLocalStorage scoped context
 * 2. Module-level store
 */
export function getContributions<T = unknown>(extensionId: string): Array<T & { toolId: string }> {
  const scoped = scopedContext.getStore()
  if (scoped) {
    return (scoped.contributions[extensionId] ?? []) as Array<T & { toolId: string }>
  }
  return (_contributions[extensionId] ?? []) as Array<T & { toolId: string }>
}
