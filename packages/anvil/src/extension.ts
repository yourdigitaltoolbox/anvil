/**
 * Extensions — app-level systems that define contracts for tools to contribute to.
 *
 * Extensions are the mechanism for platform-wide features that span multiple
 * modules/tools. Each extension is a package that defines a contract via
 * declaration merging and optionally has its own client and server surfaces.
 *
 * The `client` and `server` fields are typed as `unknown` at the framework level.
 * Toolkits narrow these types based on their surface definitions.
 *
 * @example
 * ```ts
 * import { defineExtension } from '@ydtb/anvil'
 *
 * export const search = defineExtension({
 *   id: 'search',
 *   name: 'Search',
 *   server: {
 *     router: searchRouter,
 *   },
 * })
 * ```
 */

// ---------------------------------------------------------------------------
// Extension Type
// ---------------------------------------------------------------------------

export interface Extension {
  /** Unique extension identifier (e.g. 'onboarding', 'search', 'notifications') */
  id: string
  /** Human-readable display name */
  name: string
  /**
   * The extension's own client surface.
   * Typed as `unknown` at the framework level — toolkits narrow this
   * to their specific surface type (e.g., Client in @ydtb/anvil-toolkit).
   */
  client?: unknown
  /**
   * The extension's own server surface.
   * Typed as `unknown` at the framework level — toolkits narrow this
   * to their specific surface type (e.g., Server in @ydtb/anvil-toolkit).
   */
  server?: unknown
}

/**
 * Define an extension.
 *
 * Extensions are app-level systems registered in `defineApp({ extensions: [...] })`.
 * They define contracts for modules/tools to contribute to via declaration merging
 * on `ClientContributions` and `ServerContributions`.
 */
export function defineExtension(config: Extension): Extension {
  return config
}
