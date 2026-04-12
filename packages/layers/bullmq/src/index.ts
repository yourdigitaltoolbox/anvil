/**
 * @ydtb/anvil-layer-bullmq — Background job queue layer for Anvil.
 *
 * Provides a BullMQ-based implementation of the job queue layer.
 * Uses Redis-backed queues for reliable, distributed job processing
 * with support for delays, priorities, and retries.
 *
 * @example
 * ```ts
 * // compose.config.ts
 * import { bullmq } from '@ydtb/anvil-layer-bullmq'
 *
 * export default defineApp({
 *   layers: {
 *     jobs: bullmq({ redis: env.REDIS_URL }),
 *   },
 * })
 * ```
 *
 * Then in tool code:
 * ```ts
 * import { getLayer } from '@ydtb/anvil-server'
 *
 * const jobs = getLayer('jobs')
 * await jobs.enqueue('send-welcome-email', { userId: 'usr_123' })
 * ```
 */

import { Queue, Worker } from 'bullmq'
import type { Job } from 'bullmq'
import { Effect, Layer } from 'effect'
import type { LayerConfig, HealthStatus } from '@ydtb/anvil'
import { createLayerConfig, getLayerTag } from '@ydtb/anvil-server'

// ---------------------------------------------------------------------------
// Layer contract
// ---------------------------------------------------------------------------

export interface JobLayer {
  /** Enqueue a job by name. Returns the job ID. */
  readonly enqueue: (
    jobName: string,
    data: unknown,
    options?: { delay?: number; priority?: number },
  ) => Promise<string>
  /** Register a handler for a specific job name. */
  readonly registerHandler: (
    jobName: string,
    handler: (data: unknown) => Promise<void>,
  ) => void
  /**
   * Register a cron job. Runs the handler on the given schedule.
   * Schedule format: standard 5-field POSIX cron (e.g., '0 * * * *' for hourly).
   */
  readonly registerCron: (
    jobName: string,
    schedule: string,
    handler: (data: unknown) => Promise<void>,
  ) => Promise<void>
  /** Get a job by ID. Returns null if not found. */
  readonly getJob: (
    jobId: string,
  ) => Promise<{ id: string; name: string; data: unknown; status: string } | null>
}

// ---------------------------------------------------------------------------
// Augment LayerMap
// ---------------------------------------------------------------------------

declare module '@ydtb/anvil' {
  interface LayerMap {
    jobs: JobLayer
  }
}

// ---------------------------------------------------------------------------
// Effect tag
// ---------------------------------------------------------------------------

const JobTag = getLayerTag<JobLayer>('jobs')

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface BullMQConfig {
  /** Redis connection URL (e.g., 'redis://localhost:6379') */
  redis: string
  /** Queue name prefix (default: 'anvil') */
  prefix?: string
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a BullMQ job queue layer with lifecycle management.
 *
 * A Queue and Worker are created on boot. The Worker dispatches jobs to
 * registered handlers. Both are closed gracefully on shutdown.
 *
 * @example
 * ```ts
 * import { bullmq } from '@ydtb/anvil-layer-bullmq'
 *
 * defineApp({
 *   layers: {
 *     jobs: bullmq({ redis: 'redis://localhost:6379' }),
 *   },
 * })
 * ```
 */
export function bullmq(config: BullMQConfig): LayerConfig<'jobs'> {
  const { redis, prefix = 'anvil' } = config

  const effectLayer = Layer.scoped(
    JobTag,
    Effect.acquireRelease(
      // Acquire: create Queue + Worker + handler registry
      Effect.sync(() => {
        const handlers = new Map<string, (data: unknown) => Promise<void>>()

        const queue = new Queue(prefix, {
          connection: { url: redis },
        })

        const worker = new Worker(
          prefix,
          async (job: Job) => {
            const handler = handlers.get(job.name)
            if (handler) {
              await handler(job.data)
            }
          },
          { connection: { url: redis } },
        )

        const service: JobLayer = {
          enqueue: async (jobName, data, options) => {
            const job = await queue.add(jobName, data, {
              delay: options?.delay,
              priority: options?.priority,
            })
            return job.id!
          },
          registerHandler: (jobName, handler) => {
            handlers.set(jobName, handler)
          },
          registerCron: async (jobName, schedule, handler) => {
            handlers.set(jobName, handler)
            await queue.upsertJobScheduler(
              jobName,
              { pattern: schedule },
              { name: jobName, data: {} },
            )
          },
          getJob: async (jobId) => {
            const job = await queue.getJob(jobId)
            if (!job) return null
            const state = await job.getState()
            return {
              id: job.id!,
              name: job.name,
              data: job.data,
              status: state,
            }
          },
        }

        return { service, queue, worker }
      }),
      // Release: close worker and queue
      ({ queue, worker }) =>
        Effect.promise(async () => {
          await worker.close()
          await queue.close()
        }),
    ).pipe(Effect.map(({ service }) => service)),
  )

  // Health check: try to get queue info
  const healthCheck = Effect.gen(function* () {
    const jobs = yield* JobTag
    const start = Date.now()
    // A lightweight operation to verify the queue is responsive
    yield* Effect.tryPromise(() => jobs.getJob('__health__')).pipe(Effect.orDie)
    return {
      status: 'ok' as const,
      latencyMs: Date.now() - start,
    } satisfies HealthStatus
  })

  return createLayerConfig('jobs', effectLayer, {
    healthCheck,
  })
}

// Re-export types
export type { JobLayer as JobLayerContract }
