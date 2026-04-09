/**
 * In-memory storage layer — for development and testing.
 *
 * Same StorageLayer contract as S3, backed by an in-memory Map.
 * No AWS dependency, no network calls.
 *
 * @example
 * ```ts
 * import { memoryStorage } from '@ydtb/anvil-layer-s3/memory'
 *
 * defineApp({
 *   layers: {
 *     storage: memoryStorage(),
 *   },
 * })
 * ```
 */

import { Effect, Layer } from 'effect'
import type { LayerConfig } from '@ydtb/anvil'
import { createLayerConfig, getLayerTag } from '@ydtb/anvil-server'
import type { StorageLayer } from './index.ts'

const StorageTag = getLayerTag<StorageLayer>('storage')

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

function createMemoryStorage() {
  const store = new Map<string, Buffer>()

  const service: StorageLayer = {
    put: async (key, data) => {
      let buf: Buffer
      if (typeof data === 'string') {
        buf = Buffer.from(data)
      } else if (data instanceof Buffer) {
        buf = data
      } else if (data instanceof ReadableStream) {
        // Read the stream into a buffer
        const reader = data.getReader()
        const chunks: Uint8Array[] = []
        let done = false
        while (!done) {
          const result = await reader.read()
          done = result.done
          if (result.value) chunks.push(result.value)
        }
        buf = Buffer.concat(chunks)
      } else {
        buf = Buffer.from(data as any)
      }

      store.set(key, buf)
      return key
    },

    get: async (key) => {
      return store.get(key) ?? null
    },

    del: async (key) => {
      store.delete(key)
    },

    getUrl: (key) => `memory://${key}`,

    exists: async (key) => {
      return store.has(key)
    },
  }

  return service
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface MemoryStorageConfig {
  /** Initial data to populate the store with (for testing) */
  seed?: Record<string, string | Buffer>
}

/**
 * Create an in-memory storage layer.
 *
 * Objects are stored in a Map<string, Buffer>. `getUrl()` returns
 * `memory://{key}`. Data is lost when the process exits.
 *
 * Use for dev/test only.
 */
export function memoryStorage(config?: MemoryStorageConfig): LayerConfig<'storage'> {
  const service = createMemoryStorage()

  // Seed initial data
  if (config?.seed) {
    for (const [key, value] of Object.entries(config.seed)) {
      const buf = typeof value === 'string' ? Buffer.from(value) : value
      service.put(key, buf)
    }
  }

  return createLayerConfig(
    'storage',
    Layer.succeed(StorageTag, service),
    {
      healthCheck: Effect.succeed({ status: 'ok' as const, latencyMs: 0 }),
    },
  )
}
