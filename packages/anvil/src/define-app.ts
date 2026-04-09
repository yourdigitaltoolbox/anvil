/**
 * Composition root — the single source of truth for an Anvil application.
 *
 * `defineApp` declares everything: brand identity, infrastructure layers,
 * the scope tree with tool includes, and extensions. This is the one file
 * that tells you what the entire application is made of.
 */

import type { ScopeTree } from './scope.ts'
import type { RequiredLayers } from './layers.ts'
import type { Extension } from './extension.ts'

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
  /** Infrastructure layers — requires all keys declared by installed layer packages */
  layers: RequiredLayers
  /** Scope hierarchy — nested tree with per-level tool includes */
  scopes: ScopeTree
  /** Extensions — app-level systems that define contracts for tools to contribute to */
  extensions?: Extension[]
}

/**
 * Define an Anvil application.
 *
 * The composition root is the single source of truth. It declares the brand,
 * wires infrastructure layers, defines the scope hierarchy with tool includes,
 * and registers extensions.
 *
 * All layer keys declared by installed layer packages are required — omit one
 * and TypeScript errors at compile time.
 *
 * @example
 * ```ts
 * import { defineApp, scope } from '@ydtb/anvil'
 * import { postgres } from '@ydtb/anvil-layer-postgres'
 * import { redis } from '@ydtb/anvil-layer-redis'
 * import { onboarding } from '@ydtb/ext-onboarding'
 * import { search } from '@ydtb/ext-search'
 *
 * export default defineApp({
 *   brand: { name: 'My App' },
 *   layers: {
 *     database: postgres({ url: env.DATABASE_URL }),
 *     cache: redis({ url: env.REDIS_URL }),
 *   },
 *   scopes: scope({
 *     type: 'system', label: 'System', urlPrefix: '/s',
 *     includes: [contacts, billing],
 *   }),
 *   extensions: [onboarding, search],
 * })
 * ```
 */
export function defineApp(config: AppConfig): AppConfig {
  return config
}
