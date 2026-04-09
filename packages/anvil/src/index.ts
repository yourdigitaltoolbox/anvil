/**
 * @ydtb/anvil — Composable full-stack plugin framework.
 *
 * Anvil provides generic primitives for building applications:
 *
 * - **Composition** — `defineApp` — the single source of truth
 * - **Extensions** — `defineExtension` — app-level systems with contribution contracts
 * - **Layers** — Swappable infrastructure (empty by default, augmented by layer packages)
 * - **Hooks** — Cross-tool communication (actions, broadcasts, filters) — see `@ydtb/anvil-hooks`
 *
 * All extensible interfaces (`LayerMap`, `ClientContributions`, `ServerContributions`)
 * ship empty and are augmented via declaration merging by layer and extension packages.
 *
 * Toolkits (like `@ydtb/anvil-toolkit`) add module systems on top of these primitives.
 *
 * @example
 * ```ts
 * import { defineApp, defineExtension } from '@ydtb/anvil'
 * import { postgres } from '@ydtb/anvil-layer-postgres'
 *
 * export default defineApp({
 *   brand: { name: 'My App' },
 *   layers: { database: postgres({ url: env.DATABASE_URL }) },
 *   extensions: [search, onboarding],
 * })
 * ```
 */

// Composition
export { defineApp } from './define-app.ts'

// Extensions
export { defineExtension } from './extension.ts'

// Types — Composition
export type { AppConfig, BrandConfig } from './define-app.ts'

// Types — Extensions
export type { Extension } from './extension.ts'

// Types — Layers
export type { LayerConfig, LayerMap, RequiredLayers, HealthStatus } from './layers.ts'

// Types — Supporting
export type { JobDefinition, Logger } from './layers.ts'

// Types — Contributions (empty, augmented by extensions)
export type { ClientContributions } from './contributions.ts'
export type { ServerContributions } from './contributions.ts'
