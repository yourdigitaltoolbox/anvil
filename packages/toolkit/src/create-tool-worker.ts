/**
 * createToolWorker — wraps Anvil's createWorker with tool surface processing.
 */

import { createWorker } from '@ydtb/anvil-server'
import type { AppConfig, JobDefinition } from '@ydtb/anvil'
import { processSurfaces } from './surfaces.ts'
import type { ToolEntry } from './surfaces.ts'

export interface ToolWorkerConfig {
  config: AppConfig
  tools: ToolEntry[]
  onJob?: (job: JobDefinition) => Promise<void>
}

export function createToolWorker(config: ToolWorkerConfig) {
  return createWorker({
    config: config.config,
    modules: config.tools,
    processSurfaces: processSurfaces as any,
    onJob: config.onJob,
  })
}
