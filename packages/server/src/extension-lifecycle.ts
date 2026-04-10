/**
 * Extension lifecycle — boot and shutdown hooks for extensions.
 *
 * Two lifecycle phases:
 *
 * **Boot** — runs after all tool surfaces are processed and contributions
 * are collected. Use for materializing registries, starting listeners,
 * building derived state.
 *
 * **Shutdown** — runs during server shutdown, before layers are torn down.
 * Use for cleaning up listeners, flushing buffers, releasing resources.
 *
 * @example
 * ```ts
 * import { onExtensionBoot, onExtensionShutdown } from '@ydtb/anvil-server'
 *
 * let unsubscribe: (() => void) | null = null
 *
 * onExtensionBoot('activity', async (contributions) => {
 *   // Start listening for broadcasts
 *   unsubscribe = hooks.onBroadcast('*', logActivity)
 * })
 *
 * onExtensionShutdown('activity', async () => {
 *   // Clean up listener
 *   unsubscribe?.()
 * })
 * ```
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExtensionBootFn = (
  contributions: Array<Record<string, unknown> & { toolId: string }>
) => void | Promise<void>

export type ExtensionShutdownFn = () => void | Promise<void>

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const bootFns = new Map<string, ExtensionBootFn[]>()
const shutdownFns = new Map<string, ExtensionShutdownFn[]>()

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

/**
 * Register a boot function for an extension.
 *
 * Called after all tool surfaces are processed and contributions collected,
 * before the server is ready to accept requests.
 */
export function onExtensionBoot(extensionId: string, fn: ExtensionBootFn): void {
  const existing = bootFns.get(extensionId) ?? []
  existing.push(fn)
  bootFns.set(extensionId, existing)
}

/**
 * Run all registered boot functions.
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

// ---------------------------------------------------------------------------
// Shutdown
// ---------------------------------------------------------------------------

/**
 * Register a shutdown function for an extension.
 *
 * Called during server shutdown, before layers are torn down.
 * Use for cleaning up listeners, flushing buffers, releasing resources.
 */
export function onExtensionShutdown(extensionId: string, fn: ExtensionShutdownFn): void {
  const existing = shutdownFns.get(extensionId) ?? []
  existing.push(fn)
  shutdownFns.set(extensionId, existing)
}

/**
 * Run all registered shutdown functions.
 * @internal
 */
export async function runExtensionShutdown(): Promise<void> {
  for (const [extId, fns] of shutdownFns) {
    for (const fn of fns) {
      try {
        await fn()
      } catch (error) {
        console.error(`[anvil-server] Extension shutdown error (${extId}):`, error)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Clear (testing)
// ---------------------------------------------------------------------------

/**
 * Clear all registered lifecycle functions. For testing.
 * @internal
 */
export function clearExtensionLifecycle(): void {
  bootFns.clear()
  shutdownFns.clear()
}
