/**
 * Toolkit build modules — virtual module generators for the Anvil build plugin.
 *
 * Pass these to `anvilPlugin()` to enable tool/scope virtual modules:
 *
 * @example
 * ```ts
 * import { anvilPlugin } from '@ydtb/anvil-build/plugin'
 * import { toolkitModules } from '@ydtb/anvil-toolkit/build'
 *
 * export default defineConfig({
 *   plugins: [anvilPlugin(config, { modules: toolkitModules(config) })],
 * })
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
  generateTailwindSourcesModule,
} from './generators.ts'

// Re-export generators for direct use (e.g., in tests)
export {
  generateServerToolsModule,
  generateClientToolsModule,
  generateSchemaModule,
  generateScopeTreeModule,
  generatePermissionsModule,
  generateExtensionsModule,
} from './generators.ts'

/**
 * Returns the virtual module map for the Anvil build plugin.
 * These generators produce virtual modules for tool discovery,
 * schema collection, scope tree, and permissions.
 */
// Tailwind CSS source generation
export { generateTailwindSources, writeTailwindSources, tailwindSourcesPlugin } from './generate-tailwind-sources.ts'

/**
 * Returns the virtual module map for the Anvil build plugin.
 */
export function toolkitModules(_config: AppConfig): Record<string, (config: AppConfig) => string> {
  return {
    'virtual:anvil/server-tools': generateServerToolsModule,
    'virtual:anvil/client-tools': generateClientToolsModule,
    'virtual:anvil/schema': generateSchemaModule,
    'virtual:anvil/scope-tree': generateScopeTreeModule,
    'virtual:anvil/permissions': generatePermissionsModule,
    'virtual:anvil/extensions': generateExtensionsModule,
    'virtual:anvil/tailwind-sources': generateTailwindSourcesModule,
  }
}
