/**
 * Contribution interfaces — augmented by extension packages.
 *
 * These are empty by default. Extension packages add fields via
 * TypeScript declaration merging, making them available on tool
 * surface types defined by the toolkit.
 */

/**
 * Client-side contributions that modules can make to installed extensions.
 * Empty by default — augmented via declaration merging by extension packages.
 *
 * @example
 * ```ts
 * // In an extension package:
 * declare module '@ydtb/anvil' {
 *   interface ClientContributions {
 *     search?: { provider: SearchProvider }
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ClientContributions {}

/**
 * Server-side contributions that modules can make to installed extensions.
 * Empty by default — augmented via declaration merging by extension packages.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ServerContributions {}
