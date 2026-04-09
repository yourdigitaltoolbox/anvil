/**
 * Example layer: in-memory key-value store.
 *
 * Demonstrates the full layer authoring pattern:
 * 1. Define the contract interface
 * 2. Augment LayerMap via declaration merging
 * 3. Export a factory function returning LayerConfig
 * 4. Provide a health check
 *
 * In a real app, this would be @ydtb/anvil-layer-postgres or similar.
 */

import { Context, Effect, Layer } from 'effect'
import type { LayerConfig, HealthStatus } from '../../packages/anvil/src/index.ts'

// ---------------------------------------------------------------------------
// 1. Define the contract
// ---------------------------------------------------------------------------

export interface StoreLayer {
  readonly get: (key: string) => string | undefined
  readonly set: (key: string, value: string) => void
  readonly keys: () => string[]
}

// ---------------------------------------------------------------------------
// 2. Augment LayerMap — makes `store` a required key in defineApp
// ---------------------------------------------------------------------------

declare module '@ydtb/anvil' {
  interface LayerMap {
    store: StoreLayer
  }
}

// ---------------------------------------------------------------------------
// 3. Effect internals (layer authors see this, tool authors don't)
// ---------------------------------------------------------------------------

const StoreTag = Context.GenericTag<StoreLayer>('Store')

// ---------------------------------------------------------------------------
// 4. Factory function — what the app calls in compose.config.ts
// ---------------------------------------------------------------------------

export function memoryStore(): LayerConfig<'store'> {
  const data = new Map<string, string>()

  const service: StoreLayer = {
    get: (key) => data.get(key),
    set: (key, value) => data.set(key, value),
    keys: () => [...data.keys()],
  }

  return {
    id: 'store',
    _effectLayer: {
      tag: StoreTag,
      layer: Layer.succeed(StoreTag, service),
    },
    _healthCheck: Effect.succeed({
      status: 'ok' as const,
      latencyMs: 0,
    } satisfies HealthStatus),
  }
}
