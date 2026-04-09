/**
 * In-memory job queue layer — for development and testing.
 *
 * Same JobLayer contract as BullMQ, backed by an in-memory array.
 * Handlers are called synchronously for test predictability.
 * No Redis dependency.
 *
 * @example
 * ```ts
 * import { memoryJobs } from '@ydtb/anvil-layer-bullmq/memory'
 *
 * defineApp({
 *   layers: {
 *     jobs: memoryJobs(),
 *   },
 * })
 * ```
 */

import { Context, Effect, Layer } from 'effect'
import type { LayerConfig } from '@ydtb/anvil'
import { createLayerConfig } from '@ydtb/anvil-server'
import type { JobLayer } from './index.ts'
import { JobTag } from './index.ts'

// ---------------------------------------------------------------------------
// In-memory job store
// ---------------------------------------------------------------------------

interface StoredJob {
  id: string
  name: string
  data: unknown
  status: 'waiting' | 'completed' | 'failed'
}

function createMemoryJobStore() {
  const jobs: StoredJob[] = []
  const handlers = new Map<string, (data: unknown) => Promise<void>>()
  let nextId = 1

  const service: JobLayer = {
    enqueue: async (jobName, data, _options) => {
      const id = String(nextId++)
      const job: StoredJob = { id, name: jobName, data, status: 'waiting' }
      jobs.push(job)

      // If a handler is registered, execute it synchronously for test predictability
      const handler = handlers.get(jobName)
      if (handler) {
        try {
          await handler(data)
          job.status = 'completed'
        } catch {
          job.status = 'failed'
        }
      }

      return id
    },

    registerHandler: (jobName, handler) => {
      handlers.set(jobName, handler)
    },

    getJob: async (jobId) => {
      const job = jobs.find((j) => j.id === jobId)
      if (!job) return null
      return {
        id: job.id,
        name: job.name,
        data: job.data,
        status: job.status,
      }
    },
  }

  return service
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an in-memory job queue layer.
 *
 * Jobs are stored in an array. When a handler is registered and a matching
 * job is enqueued, the handler is called immediately (synchronously) for
 * test predictability.
 *
 * Data is lost when the process exits — use for dev/test only.
 */
export function memoryJobs(): LayerConfig<'jobs'> {
  const service = createMemoryJobStore()

  return createLayerConfig(
    'jobs',
    JobTag,
    Layer.succeed(JobTag, service),
    {
      healthCheck: Effect.succeed({ status: 'ok' as const, latencyMs: 0 }),
    },
  )
}
