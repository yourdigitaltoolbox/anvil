/**
 * Extension lifecycle — boot hooks that run after contributions are collected.
 *
 * Extensions can register a `boot` function that runs after all tool surfaces
 * are processed and contributions are collected. This is the place to:
 * - Materialize registries from collected contributions
 * - Start listeners (activity, notifications)
 * - Build derived state
 *
 * @example
 * ```ts
 * import { defineExtension } from '@ydtb/anvil'
 * import { onExtensionBoot } from '@ydtb/anvil-server'
 *
 * export const search = defineExtension({
 *   id: 'search',
 *   name: 'Search',
 *   server: { router: searchRouter },
 * })
 *
 * // Called after all tool contributions are collected
 * onExtensionBoot('search', async (contributions) => {
 *   const providers = contributions.map(c => c.provider)
 *   searchRegistry.register(providers)
 * })
 * ```
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExtensionBootFn = (
  contributions: Array<Record<string, unknown> & { toolId: string }>
) => void | Promise<void>

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const bootFns = new Map<string, ExtensionBootFn[]>()

/**
 * Register a boot function for an extension.
 *
 * Called after all tool surfaces are processed and contributions collected.
 * The function receives the collected contributions for this extension.
 *
 * Can be called multiple times for the same extension — all functions run.
 */
export function onExtensionBoot(extensionId: string, fn: ExtensionBootFn): void {
  const existing = bootFns.get(extensionId) ?? []
  existing.push(fn)
  bootFns.set(extensionId, existing)
}

/**
 * Run all registered boot functions for all extensions.
 *
 * Called internally by the boot sequence after contributions are collected.
 * @internal
 */
export async function runExtensionBoot(
  contributions: Record<string, unknown[]>,
): Promise<void> {
  for (const [extId, fns] of bootFns) {
    const extContributions = (contributions[extId] ?? []) as Array<Record<string, unknown> & { toolId: string }>
    for (const fn of fns) {
      try {
        await fn(extContributions)
      } catch (error) {
        console.error(`[anvil-server] Extension boot error (${extId}):`, error)
      }
    }
  }
}

/**
 * Clear all registered boot functions. For testing.
 * @internal
 */
export function clearExtensionBoot(): void {
  bootFns.clear()
}
