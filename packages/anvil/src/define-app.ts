/**
 * Composition root — the single source of truth for an Anvil application.
 *
 * `defineApp` declares the brand, infrastructure layers, and extensions.
 * Toolkits augment `AppConfig` with additional fields (e.g., scopes, modules)
 * via TypeScript declaration merging.
 */

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
// App Config — extensible via declaration merging
// ---------------------------------------------------------------------------

/**
 * Application configuration. Framework provides the base fields.
 * Toolkits augment with additional fields via declaration merging:
 *
 * ```ts
 * // In @ydtb/anvil-toolkit:
 * declare module '@ydtb/anvil' {
 *   interface AppConfig {
 *     scopes?: ScopeTree
 *   }
 * }
 * ```
 */
export interface AppConfig {
  /** Brand identity */
  brand: BrandConfig
  /** Infrastructure layers — requires all keys declared by installed layer packages */
  layers: RequiredLayers
  /** Extensions — app-level systems that define contracts for tools to contribute to */
  extensions?: Extension[]
  /** Toolkit-specific fields added via declaration merging */
  [key: string]: unknown
}

/**
 * Define an Anvil application.
 *
 * The composition root is the single source of truth. It declares the brand,
 * wires infrastructure layers, and registers extensions. Toolkits add
 * additional fields (scopes, modules, etc.) via declaration merging.
 *
 * @example
 * ```ts
 * import { defineApp } from '@ydtb/anvil'
 * import { postgres } from '@ydtb/anvil-layer-postgres'
 *
 * export default defineApp({
 *   brand: { name: 'My App' },
 *   layers: {
 *     database: postgres({ url: env.DATABASE_URL }),
 *   },
 *   extensions: [onboarding, search],
 * })
 * ```
 */
export function defineApp(config: AppConfig): AppConfig {
  return config
}
