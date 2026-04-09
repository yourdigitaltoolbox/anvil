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
} from './generators.ts'

/**
 * Returns the virtual module map for the Anvil build plugin.
 * These generators produce virtual modules for tool discovery,
 * schema collection, scope tree, and permissions.
 */
export function toolkitModules(_config: AppConfig): Record<string, (config: AppConfig) => string> {
  return {
    'virtual:anvil/server-tools': generateServerToolsModule,
    'virtual:anvil/client-tools': generateClientToolsModule,
    'virtual:anvil/schema': generateSchemaModule,
    'virtual:anvil/scope-tree': generateScopeTreeModule,
    'virtual:anvil/permissions': generatePermissionsModule,
    'virtual:anvil/extensions': generateExtensionsModule,
  }
}
