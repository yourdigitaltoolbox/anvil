/**
 * @ydtb/anvil-build — Build system for Anvil.
 *
 * Provides:
 * - `anvilPlugin(config)` — Vite/Rollup plugin that generates virtual modules
 * - `collectTools(config)` — utility to extract all tools from the scope tree
 * - Virtual module type declarations for TypeScript
 *
 * Virtual modules generated:
 * - `virtual:anvil/server-tools` — tool server surfaces as ToolEntry[]
 * - `virtual:anvil/client-tools` — tool client surfaces
 * - `virtual:anvil/schema` — merged schema from all tools (for drizzle-kit)
 * - `virtual:anvil/scope-tree` — scope hierarchy as JSON
 * - `virtual:anvil/permissions` — permission declarations from all tools
 * - `virtual:anvil/extensions` — extension metadata
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { anvilPlugin } from '@ydtb/anvil-build'
 * import config from './compose.config'
 *
 * export default defineConfig({
 *   plugins: [anvilPlugin(config)],
 * })
 * ```
 */

export { anvilPlugin } from './plugin.ts'
export type { AnvilPluginOptions } from './plugin.ts'

export { createDevServer } from './dev-server.ts'
export type { DevServerConfig } from './dev-server.ts'

export { createViteConfig } from './vite-config.ts'
export type { ViteConfigOptions } from './vite-config.ts'

export { collectTools, collectToolsWithScopes } from './collect-tools.ts'

export {
  generateServerToolsModule,
  generateClientToolsModule,
  generateSchemaModule,
  generateScopeTreeModule,
  generatePermissionsModule,
  generateExtensionsModule,
} from './generators.ts'
