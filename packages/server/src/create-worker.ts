/**
 * createWorker — the job processing entry point for an Anvil app.
 *
 * Same layers, hooks, and tool surfaces as createServer, but no HTTP.
 * Designed to run as a separate process for background job processing.
 *
 * ```ts
 * import { createWorker } from '@ydtb/anvil-server'
 *
 * const worker = createWorker({
 *   config: composeConfig,
 *   tools,
 * })
 *
 * await worker.start()
 * ```
 *
 * The worker:
 * 1. Boots all layers (same lifecycle as server)
 * 2. Creates the hook system and registers all tool hooks
 * 3. Collects job definitions from tool surfaces
 * 4. Starts processing jobs (via the job layer if available)
 * 5. Handles SIGTERM/SIGINT for graceful shutdown
 */

import type { AppConfig, JobDefinition } from '@ydtb/anvil'
import { getLogger } from './request-context.ts'
import { boot } from './boot.ts'
import type { BootResult } from './boot.ts'
// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface WorkerConfig {
  /** The app composition config from defineApp() */
  config: AppConfig
  /** Modules to process — shape depends on toolkit */
  modules?: unknown[]
  /** @deprecated Use `modules` instead */
  tools?: unknown[]
  /** Surface processor — toolkit provides this */
  processSurfaces?: (hooks: import('@ydtb/anvil-hooks').HookSystem, modules: unknown[], extensions: import('@ydtb/anvil').Extension[]) => import('./boot.ts').ProcessedResult
  /**
   * Custom job handler — called for each job that needs processing.
   * If not provided, the worker collects jobs but relies on the job layer
   * (e.g., BullMQ) to handle scheduling and execution.
   */
  onJob?: (job: JobDefinition) => Promise<void>
}

export interface AnvilWorker {
  /** Start the worker — boots layers and begins job processing */
  start: () => Promise<void>
  /** Gracefully shut down the worker */
  shutdown: () => Promise<void>
  /** Get all registered job definitions from tool surfaces */
  getJobs: () => JobDefinition[]
}

// ---------------------------------------------------------------------------
// createWorker
// ---------------------------------------------------------------------------

export function createWorker(workerConfig: WorkerConfig): AnvilWorker {
  const { config, modules: modulesOpt, tools: toolsOpt, processSurfaces, onJob } = workerConfig
  const modules = modulesOpt ?? toolsOpt ?? []

  let bootResult: BootResult | null = null
  let collectedJobs: JobDefinition[] = []

  async function start(): Promise<void> {
    // Shared boot: layers, hooks, surfaces
    bootResult = await boot({ config, modules, label: 'worker', processSurfaces })

    const logger = getLogger()

    // Collect all registered jobs from tool surfaces via the jobs filter
    collectedJobs = bootResult.hooks.applyFilterSync('jobs', [] as JobDefinition[])
    logger.info({ jobCount: collectedJobs.length }, 'Collected job definitions')

    for (const job of collectedJobs) {
      logger.info({ jobId: job.id, schedule: job.schedule }, 'Registered job')
    }

    // If a custom job handler is provided, register it
    if (onJob) {
      for (const job of collectedJobs) {
        if (job.schedule) {
          logger.info({ jobId: job.id, schedule: job.schedule }, 'Cron job registered (scheduling depends on job layer)')
        }
        if (job.trigger) {
          logger.info({ jobId: job.id, trigger: job.trigger }, 'Trigger job registered')
        }
      }
    }

    // Install shutdown hooks (Node/Bun environments only)
    if (typeof globalThis.process !== 'undefined') {
      const shutdownHandler = async () => {
        logger.info({}, 'Worker shutdown signal received')
        await shutdown()
        globalThis.process.exit(0)
      }

      globalThis.process.on('SIGTERM', shutdownHandler)
      globalThis.process.on('SIGINT', shutdownHandler)
    }

    logger.info({}, 'Anvil worker running')
  }

  async function shutdown(): Promise<void> {
    if (bootResult) {
      await bootResult.shutdown()
      bootResult = null
    }
    collectedJobs = []
  }

  function getJobs(): JobDefinition[] {
    return [...collectedJobs]
  }

  return { start, shutdown, getJobs }
}
