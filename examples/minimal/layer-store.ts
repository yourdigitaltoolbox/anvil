/**
 * Example layer: in-memory key-value store.
 *
 * Demonstrates the full layer authoring pattern:
 * 1. Define the contract interface
 * 2. Augment LayerMap via declaration merging
 * 3. Create an Effect tag and layer
 * 4. Export a factory using createLayerConfig()
 *
 * In a real app, this would be @ydtb/anvil-layer-postgres or similar.
 */

import { Context, Effect, Layer } from 'effect'
import type { LayerConfig } from '../../packages/anvil/src/index.ts'
import { createLayerConfig } from '../../packages/server/src/index.ts'

// ---------------------------------------------------------------------------
// 1. Define the contract
// ---------------------------------------------------------------------------

export interface StoreLayer {
  readonly get: (key: string) => string | undefined
  readonly set: (key: string, value: string) => void
  readonly keys: () => string[]
}

// ---------------------------------------------------------------------------
// 2. Augment LayerMap
// ---------------------------------------------------------------------------

declare module '../../packages/anvil/src/index.ts' {
  interface LayerMap {
    store: StoreLayer
  }
}

// ---------------------------------------------------------------------------
// 3. Effect internals
// ---------------------------------------------------------------------------

const StoreTag = Context.GenericTag<StoreLayer>('Store')

// ---------------------------------------------------------------------------
// 4. Factory using createLayerConfig — enforces correct shape
// ---------------------------------------------------------------------------

export function memoryStore(): LayerConfig<'store'> {
  const data = new Map<string, string>()

  const service: StoreLayer = {
    get: (key) => data.get(key),
    set: (key, value) => data.set(key, value),
    keys: () => [...data.keys()],
  }

  return createLayerConfig('store', StoreTag, Layer.succeed(StoreTag, service), {
    healthCheck: Effect.succeed({ status: 'ok' as const, latencyMs: 0 }),
  })
}
