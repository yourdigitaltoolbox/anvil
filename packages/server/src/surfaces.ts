/**
 * Surface processor — collects and processes tool + extension server surfaces.
 *
 * Reads server surfaces from tools and extensions, then:
 * - Registers hooks (actions, broadcasts, filters) with the HookSystem
 * - Extracts routers for mounting
 * - Collects jobs for the job scheduler
 * - Collects extension contributions from tools
 * - Runs setup functions (escape hatch)
 */

import type { Server, ServerHooks, Extension, AppConfig } from '@ydtb/anvil'
import type { HookSystem, HookAPI } from '@ydtb/anvil-hooks'
import { getLogger } from './request-context.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolEntry {
  id: string
  module: { default?: Server }
}

export interface ProcessedSurfaces {
  /** Map of tool/extension ID → router */
  routers: Record<string, unknown>
  /** All extension contributions collected from tools, keyed by extension ID */
  contributions: Record<string, unknown[]>
  /** All collected schemas merged */
  schemas: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Processing
// ---------------------------------------------------------------------------

/**
 * Process all server surfaces — extensions first, then tools.
 * Returns extracted routers and collected contributions.
 */
export function processSurfaces(
  hooks: HookSystem,
  tools: ToolEntry[],
  extensions: Extension[],
): ProcessedSurfaces {
  const logger = getLogger()
  const routers: Record<string, unknown> = {}
  const contributions: Record<string, unknown[]> = {}
  const schemas: Record<string, unknown> = {}

  // Initialize contribution buckets for each registered extension
  for (const ext of extensions) {
    contributions[ext.id] = []
  }

  // Process extension server surfaces first (they may register hooks that tools depend on)
  for (const ext of extensions) {
    if (!ext.server) continue

    const scopedApi = hooks.createScopedAPI(`ext:${ext.id}`)
    logger.info({ extensionId: ext.id }, 'Processing extension server surface')

    processSingleSurface(ext.id, ext.server, scopedApi, routers, schemas)
  }

  // Process tool server surfaces
  for (const entry of tools) {
    const surface = entry.module.default
    if (!surface) continue

    const scopedApi = hooks.createScopedAPI(`tool:${entry.id}`)
    logger.info({ toolId: entry.id }, 'Processing tool server surface')

    processSingleSurface(entry.id, surface, scopedApi, routers, schemas)

    // Collect extension contributions from this tool's surface
    collectContributions(entry.id, surface, extensions, contributions)
  }

  return { routers, contributions, schemas }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function processSingleSurface(
  id: string,
  surface: Server,
  scopedApi: HookAPI,
  routers: Record<string, unknown>,
  schemas: Record<string, unknown>,
): void {
  // Extract router
  if (surface.router) {
    routers[id] = surface.router
  }

  // Register hooks
  if (surface.hooks) {
    registerHooks(scopedApi, surface.hooks)
  }

  // Collect schema
  if (surface.schema) {
    Object.assign(schemas, surface.schema)
  }

  // Register jobs via filter
  if (surface.jobs?.length) {
    scopedApi.addFilter('jobs', (existing: unknown[]) => [...existing, ...surface.jobs!])
  }

  // Run escape hatch
  if (surface.setup) {
    surface.setup({
      hooks: {
        addAction: (name, handler) => scopedApi.addAction(name, handler),
        onBroadcast: (name, handler) => scopedApi.onBroadcast(name, handler),
        addFilter: (name, handler, priority) => scopedApi.addFilter(name, handler, priority),
      },
    })
  }
}

function registerHooks(api: HookAPI, hooks: ServerHooks): void {
  if (hooks.actions) {
    for (const [name, handler] of Object.entries(hooks.actions)) {
      api.addAction(name, handler)
    }
  }

  if (hooks.broadcasts) {
    for (const [name, listeners] of Object.entries(hooks.broadcasts)) {
      const fns = Array.isArray(listeners) ? listeners : [listeners]
      for (const fn of fns) {
        api.onBroadcast(name, fn)
      }
    }
  }

  if (hooks.filters) {
    for (const [name, fn] of Object.entries(hooks.filters)) {
      api.addFilter(name, fn)
    }
  }
}

/**
 * Collect extension contributions from a tool's server surface.
 *
 * Any key on the surface that matches a registered extension ID
 * is treated as a contribution to that extension.
 */
function collectContributions(
  toolId: string,
  surface: Server,
  extensions: Extension[],
  contributions: Record<string, unknown[]>,
): void {
  const extensionIds = new Set(extensions.map((e) => e.id))
  const coreKeys = new Set(['schema', 'router', 'hooks', 'jobs', 'requires', 'setup'])

  for (const [key, value] of Object.entries(surface)) {
    if (coreKeys.has(key)) continue
    if (!extensionIds.has(key)) continue
    if (value == null) continue

    contributions[key].push({ toolId, ...value as object })
  }
}
