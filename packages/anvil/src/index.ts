/**
 * @ydtb/anvil — Composable full-stack plugin framework.
 *
 * Anvil provides four primitives for building multi-tenant,
 * scope-aware applications from independent tool packages:
 *
 * - **Composition** — `defineApp`, `defineTool`, `scope`
 * - **Tools** — `defineClient`, `defineServer`
 * - **Layers** — Swappable infrastructure with compile-time verification
 * - **Hooks** — Cross-tool communication (actions, broadcasts, filters)
 *
 * @example
 * ```ts
 * import { defineApp, defineTool, scope } from '@ydtb/anvil'
 * import { postgres } from '@ydtb/anvil-layer-postgres'
 *
 * const contacts = defineTool({ id: 'contacts', name: 'Contacts', package: '@myapp/contacts' })
 *
 * export default defineApp({
 *   brand: { name: 'My App' },
 *   layers: { database: postgres({ url: env.DATABASE_URL }) },
 *   scopes: scope({
 *     type: 'system', label: 'System', urlPrefix: '/s',
 *     includes: [contacts],
 *   }),
 * })
 * ```
 */

export { defineApp } from './define-app.ts'
export { defineTool } from './define-tool.ts'
export { scope } from './scope.ts'
export { defineClient } from './client.ts'
export { defineServer } from './server.ts'

// Types
export type { AppConfig, BrandConfig } from './define-app.ts'
export type { ToolDescriptor } from './define-tool.ts'
export type { ScopeDefinition, ScopeTree } from './scope.ts'
export type { Client } from './client.ts'
export type { Server } from './server.ts'
export type { LayerConfig, RequiredLayers, LayerMap } from './layers.ts'
