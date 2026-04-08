/**
 * Composition root — the single source of truth for an Anvil application.
 *
 * `defineApp` declares everything: brand identity, infrastructure layers,
 * and the scope tree with tool includes. This is the one file that tells
 * you what the entire application is made of.
 */

import type { ScopeTree } from './scope.ts'
import type { RequiredLayers } from './layers.ts'

// ---------------------------------------------------------------------------
// Brand Config
// ---------------------------------------------------------------------------

export interface BrandConfig {
  /** Application name */
  name: string
  /** Logo URL (optional) */
  logo?: string
  /** Primary brand color (hex, optional) */
  primaryColor?: string
}

// ---------------------------------------------------------------------------
// App Config
// ---------------------------------------------------------------------------

export interface AppConfig {
  /** Brand identity */
  brand: BrandConfig
  /** Infrastructure layers — all required, compile-time verified */
  layers: RequiredLayers
  /** Scope hierarchy — nested tree with per-level tool includes */
  scopes: ScopeTree
}

/**
 * Define an Anvil application.
 *
 * The composition root is the single source of truth. It declares the brand,
 * wires infrastructure layers, and defines the scope hierarchy with tool includes.
 *
 * All layer keys are required — omit one and TypeScript errors at compile time.
 *
 * @example
 * ```ts
 * import { defineApp, scope } from '@ydtb/anvil'
 * import { postgres } from '@ydtb/anvil-layer-postgres'
 * import { redis } from '@ydtb/anvil-layer-redis'
 *
 * export default defineApp({
 *   brand: { name: 'My App' },
 *   layers: {
 *     database: postgres({ url: env.DATABASE_URL }),
 *     cache: redis({ url: env.REDIS_URL }),
 *     // ... all layers required
 *   },
 *   scopes: scope({ type: 'system', label: 'System', urlPrefix: '/s' }),
 * })
 * ```
 */
export function defineApp(config: AppConfig): AppConfig {
  return config
}
