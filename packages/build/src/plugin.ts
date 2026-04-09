/**
 * Anvil virtual module plugin for Vite/Rollup.
 *
 * The plugin provides the resolveId/load mechanics for virtual modules.
 * Which modules are generated is configurable — toolkits pass their own
 * module generators via the `modules` option.
 *
 * @example
 * ```ts
 * // With toolkit-provided modules:
 * import { anvilPlugin } from '@ydtb/anvil-build/plugin'
 * import { toolkitModules } from '@ydtb/anvil-toolkit'
 *
 * export default defineConfig({
 *   plugins: [anvilPlugin(config, { modules: toolkitModules(config) })],
 * })
 * ```
 *
 * ```ts
 * // With built-in generators (backwards compat during transition):
 * import { anvilPlugin } from '@ydtb/anvil-build/plugin'
 *
 * export default defineConfig({
 *   plugins: [anvilPlugin(config)],
 * })
 * ```
 */

import type { AppConfig } from '@ydtb/anvil'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A virtual module generator — takes config, returns ESM source code */
export type VirtualModuleGenerator = (config: AppConfig) => string

const RESOLVED_PREFIX = '\0'

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export interface AnvilPluginOptions {
  /** Enable debug logging of generated module contents */
  debug?: boolean
  /**
   * Virtual module generators. Map of module ID → generator function.
   * Toolkit packages provide these.
   *
   * @example
   * ```ts
   * modules: {
   *   'virtual:anvil/server-tools': (config) => `export const tools = [...]`,
   *   'virtual:anvil/schema': (config) => `export const schema = {...}`,
   * }
   * ```
   */
  modules?: Record<string, VirtualModuleGenerator>
}

/**
 * Create the Anvil virtual module plugin.
 *
 * The plugin resolves `virtual:anvil/*` imports and returns generated
 * ESM source code. Which modules are available depends on the `modules`
 * option — toolkits provide their own generators.
 *
 * @param config - The AppConfig from compose.config.ts
 * @param options - Plugin options including virtual module generators
 * @returns A Vite/Rollup plugin
 */
export function anvilPlugin(config: AppConfig, options: AnvilPluginOptions = {}) {
  const { debug = false, modules = {} } = options

  // Try to load built-in generators as fallback (backwards compat)
  let allModules: Record<string, VirtualModuleGenerator> = { ...modules }

  if (Object.keys(allModules).length === 0) {
    // No modules provided — try loading built-in generators
    // These will be removed when toolkit code is extracted (Phase 3)
    try {
      const generators = require('./generators.ts')
      allModules = {
        'virtual:anvil/server-tools': generators.generateServerToolsModule,
        'virtual:anvil/client-tools': generators.generateClientToolsModule,
        'virtual:anvil/schema': generators.generateSchemaModule,
        'virtual:anvil/scope-tree': generators.generateScopeTreeModule,
        'virtual:anvil/permissions': generators.generatePermissionsModule,
        'virtual:anvil/extensions': generators.generateExtensionsModule,
      }
    } catch {
      // Generators not available — that's fine if toolkit provides modules
    }
  }

  // Pre-compute cache
  const moduleCache = new Map<string, string>()

  function getModuleSource(id: string): string | undefined {
    let source = moduleCache.get(id)
    if (source !== undefined) return source

    const generator = allModules[id]
    if (!generator) return undefined

    source = generator(config)
    moduleCache.set(id, source)

    if (debug) {
      console.log(`[anvil-build] Generated ${id}:\n${source}\n`)
    }
    return source
  }

  return {
    name: 'anvil:virtual-modules',

    resolveId(id: string) {
      if (id in allModules) {
        return RESOLVED_PREFIX + id
      }
      return undefined
    },

    load(id: string) {
      if (id.startsWith(RESOLVED_PREFIX)) {
        const virtualId = id.slice(RESOLVED_PREFIX.length)
        return getModuleSource(virtualId)
      }
      return undefined
    },
  }
}
