/**
 * Anvil virtual module plugin for Vite/Rollup.
 *
 * Reads compose.config.ts and generates virtual modules that wire tools,
 * schemas, permissions, and scope tree into the build without manual imports.
 *
 * Works with both Vite (client) and Rollup (server) builds — uses only
 * standard resolveId + load hooks.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { anvilPlugin } from '@ydtb/anvil-build/plugin'
 * import config from './compose.config'
 *
 * export default defineConfig({
 *   plugins: [anvilPlugin(config)],
 * })
 * ```
 *
 * Then in your code:
 * ```ts
 * import { tools } from 'virtual:anvil/server-tools'
 * import { schema } from 'virtual:anvil/schema'
 * import { scopeTree } from 'virtual:anvil/scope-tree'
 * ```
 */

import type { AppConfig } from '@ydtb/anvil'
import {
  generateServerToolsModule,
  generateClientToolsModule,
  generateSchemaModule,
  generateScopeTreeModule,
  generatePermissionsModule,
  generateExtensionsModule,
} from './generators.ts'

// ---------------------------------------------------------------------------
// Virtual module IDs
// ---------------------------------------------------------------------------

const VIRTUAL_PREFIX = 'virtual:anvil/'

const VIRTUAL_MODULES = {
  'virtual:anvil/server-tools': generateServerToolsModule,
  'virtual:anvil/client-tools': generateClientToolsModule,
  'virtual:anvil/schema': generateSchemaModule,
  'virtual:anvil/scope-tree': generateScopeTreeModule,
  'virtual:anvil/permissions': generatePermissionsModule,
  'virtual:anvil/extensions': generateExtensionsModule,
} as const

type VirtualModuleId = keyof typeof VIRTUAL_MODULES

const RESOLVED_PREFIX = '\0'

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export interface AnvilPluginOptions {
  /** Enable debug logging of generated module contents */
  debug?: boolean
}

/**
 * Create the Anvil virtual module plugin.
 *
 * @param config - The AppConfig from compose.config.ts
 * @param options - Plugin options
 * @returns A Vite/Rollup plugin
 */
export function anvilPlugin(config: AppConfig, options: AnvilPluginOptions = {}) {
  const { debug = false } = options

  // Pre-compute — config is static for the lifetime of the build/dev server
  const moduleCache = new Map<string, string>()

  function getModuleSource(id: VirtualModuleId): string {
    let source = moduleCache.get(id)
    if (!source) {
      const generator = VIRTUAL_MODULES[id]
      source = generator(config)
      moduleCache.set(id, source)

      if (debug) {
        console.log(`[anvil-build] Generated ${id}:\n${source}\n`)
      }
    }
    return source
  }

  return {
    name: 'anvil:virtual-modules',

    resolveId(id: string) {
      if (id in VIRTUAL_MODULES) {
        return RESOLVED_PREFIX + id
      }
      return undefined
    },

    load(id: string) {
      if (id.startsWith(RESOLVED_PREFIX)) {
        const virtualId = id.slice(RESOLVED_PREFIX.length) as VirtualModuleId
        if (virtualId in VIRTUAL_MODULES) {
          return getModuleSource(virtualId)
        }
      }
      return undefined
    },
  }
}
