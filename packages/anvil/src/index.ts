/**
 * @ydtb/anvil — Composable full-stack plugin framework.
 *
 * Anvil provides five primitives for building multi-tenant,
 * scope-aware applications from independent tool packages:
 *
 * - **Composition** — `defineApp`, `defineTool`, `scope`
 * - **Tools** — `defineClient`, `defineServer`
 * - **Layers** — Swappable infrastructure (empty by default, augmented by layer packages)
 * - **Hooks** — Cross-tool communication (actions, broadcasts, filters) — see `@ydtb/anvil-hooks`
 * - **Extensions** — `defineExtension` — app-level systems with tool contribution contracts
 *
 * All extensible interfaces (`LayerMap`, `ClientContributions`, `ServerContributions`)
 * ship empty and are augmented via declaration merging by layer and extension packages.
 *
 * @example
 * ```ts
 * import { defineApp, defineTool, defineExtension, scope } from '@ydtb/anvil'
 * import { postgres } from '@ydtb/anvil-layer-postgres'
 * import { onboarding } from '@ydtb/ext-onboarding'
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
 *   extensions: [onboarding],
 * })
 * ```
 */

// Composition
export { defineApp } from './define-app.ts'
export { defineTool } from './define-tool.ts'
export { scope } from './scope.ts'

// Tools
export { defineClient } from './client.ts'
export { defineServer } from './server.ts'

// Extensions
export { defineExtension } from './extension.ts'

// Types — Composition
export type { AppConfig, BrandConfig } from './define-app.ts'
export type { ToolDescriptor } from './define-tool.ts'
export type { ScopeDefinition, ScopeTree } from './scope.ts'

// Types — Tool Surfaces
export type { Client, ClientCore, ClientContributions } from './client.ts'
export type { RouteEntry, NavigationEntry, PermissionEntry, PermissionGroup } from './client.ts'
export type { Server, ServerCore, ServerContributions, ServerHooks } from './server.ts'

// Types — Extensions
export type { Extension } from './extension.ts'

// Types — Layers
export type { LayerConfig, LayerMap, RequiredLayers, HealthStatus } from './layers.ts'

// Types — Supporting
export type { JobDefinition, Logger } from './layers.ts'
