/**
 * Extensions — app-level systems that define contracts for tools to contribute to.
 *
 * Extensions are the fifth primitive in Anvil. They're not tools (not business
 * features), not layers (not infrastructure), not hooks (not communication).
 * They're platform-level systems that orchestrate cross-cutting concerns.
 *
 * Each Extension is a package that:
 * - Has an identity (id, name)
 * - Defines a contract via declaration merging on `ClientContributions` / `ServerContributions`
 * - Collects contributions from all tools that opt in
 * - Can have its own client and server surfaces (routes, hooks, etc.)
 *
 * @example
 * ```ts
 * // @ydtb/ext-onboarding — an extension package
 * import { defineExtension } from '@ydtb/anvil'
 * import type { OnboardingStep } from './types'
 *
 * // 1. Define the extension
 * export const onboarding = defineExtension({
 *   id: 'onboarding',
 *   name: 'Onboarding',
 *   client: {
 *     authenticatedRoutes: [
 *       { path: 'setup-wizard', component: () => import('./wizard') },
 *     ],
 *   },
 *   server: {
 *     router: onboardingRouter,
 *   },
 * })
 *
 * // 2. Augment surface types so tools can contribute
 * declare module '@ydtb/anvil' {
 *   interface ClientContributions {
 *     onboarding?: { steps: OnboardingStep[] }
 *   }
 *   interface ServerContributions {
 *     onboarding?: { validators: OnboardingValidator[] }
 *   }
 * }
 * ```
 *
 * Then tools contribute:
 * ```ts
 * // tools/contacts/client.ts
 * export default defineClient({
 *   routes: [...],
 *   onboarding: { steps: [{ id: 'import-contacts', ... }] },
 * })
 * ```
 *
 * And the app registers the extension:
 * ```ts
 * // compose.config.ts
 * export default defineApp({
 *   extensions: [onboarding],
 *   // ...
 * })
 * ```
 */

import type { Client } from './client.ts'
import type { Server } from './server.ts'

// ---------------------------------------------------------------------------
// Extension Type
// ---------------------------------------------------------------------------

export interface Extension {
  /** Unique extension identifier (e.g. 'onboarding', 'search', 'notifications') */
  id: string
  /** Human-readable display name */
  name: string
  /**
   * The extension's own client surface — routes, navigation, etc.
   * Uses the same surface type as tools, so extensions can contribute
   * to other extensions too.
   */
  client?: Client
  /**
   * The extension's own server surface — router, hooks, jobs, etc.
   * Uses the same surface type as tools, so extensions can contribute
   * to other extensions too.
   */
  server?: Server
}

/**
 * Define an extension.
 *
 * Extensions are app-level systems registered in `defineApp({ extensions: [...] })`.
 * They define contracts for tools to contribute to via declaration merging on
 * `ClientContributions` and `ServerContributions`.
 *
 * @example
 * ```ts
 * export const search = defineExtension({
 *   id: 'search',
 *   name: 'Search',
 *   client: {
 *     routes: [{ path: 'search', component: () => import('./search-page') }],
 *   },
 *   server: {
 *     router: searchRouter,
 *   },
 * })
 * ```
 */
export function defineExtension(config: Extension): Extension {
  return config
}
