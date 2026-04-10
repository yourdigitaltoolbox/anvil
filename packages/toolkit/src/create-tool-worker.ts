/**
 * createToolWorker — wraps Anvil's createWorker with tool surface processing
 * and automatic job wiring (cron + trigger).
 *
 * After collecting job definitions from tool surfaces, automatically:
 * 1. Registers cron jobs with the job layer (if schedule field present)
 * 2. Wires trigger-based jobs to broadcast listeners (if trigger field present)
 * 3. Registers all job handlers with the job layer
 *
 * @example
 * ```ts
 * import { createToolWorker } from '@ydtb/anvil-toolkit/server'
 *
 * const worker = createToolWorker({ config, tools })
 * await worker.start()
 * // Jobs are automatically scheduled and wired
 * ```
 */

import { createWorker, getHooks, getLayer } from '@ydtb/anvil-server'
import type { AppConfig, JobDefinition } from '@ydtb/anvil'
import { processSurfaces } from './surfaces.ts'
import type { ToolEntry } from './surfaces.ts'

export interface ToolWorkerConfig {
  config: AppConfig
  tools: ToolEntry[]
  /**
   * If true, automatically wire collected jobs to the job layer
   * (cron scheduling + trigger listeners + handler registration).
   * Default: true
   */
  autoWire?: boolean
}

export function createToolWorker(workerConfig: ToolWorkerConfig) {
  const { autoWire = true } = workerConfig

  const worker = createWorker({
    config: workerConfig.config,
    modules: workerConfig.tools,
    processSurfaces: processSurfaces as any,
  })

  // Wrap start to auto-wire jobs after boot
  const originalStart = worker.start.bind(worker)

  return {
    ...worker,
    start: async () => {
      await originalStart()

      if (autoWire) {
        await wireJobs(worker.getJobs())
      }
    },
  }
}

/**
 * Auto-wire collected job definitions to the job layer and hook system.
 */
async function wireJobs(jobs: JobDefinition[]): Promise<void> {
  if (jobs.length === 0) return

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let jobLayer: any
  try {
    jobLayer = (getLayer as (key: string) => unknown)('jobs')
  } catch {
    console.warn('[anvil-toolkit] No job layer installed — collected jobs will not execute')
    return
  }

  if (!jobLayer || typeof jobLayer.registerHandler !== 'function') return

  const hooks = getHooks()

  for (const job of jobs) {
    // Register the handler with the job layer
    if (job.handler) {
      jobLayer.registerHandler(job.id, job.handler)
    }

    // Register cron schedule
    if (job.schedule && job.handler) {
      try {
        await jobLayer.registerCron(job.id, job.schedule, job.handler)
        console.log(`[anvil-toolkit] Cron registered: ${job.id} (${job.schedule})`)
      } catch (error) {
        console.error(`[anvil-toolkit] Failed to register cron for ${job.id}:`, error)
      }
    }

    // Wire trigger-based jobs to broadcast listeners
    if (job.trigger && job.handler) {
      const trigger = job.trigger
      hooks.onBroadcast(trigger, async (payload: unknown) => {
        try {
          await job.handler()
        } catch (error) {
          console.error(`[anvil-toolkit] Trigger job ${job.id} failed:`, error)
        }
      })
      console.log(`[anvil-toolkit] Trigger wired: ${job.id} → ${trigger}`)
    }
  }
}
