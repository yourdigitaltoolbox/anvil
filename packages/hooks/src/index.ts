/**
 * @ydtb/anvil-hooks — Cross-tool communication for Anvil.
 *
 * Three primitives:
 * - **Actions:** request/response (exactly one handler per name)
 * - **Broadcasts:** fire-and-forget (0-N listeners, priority-ordered)
 * - **Filters:** value transformation pipeline (0-N callbacks, waterfall)
 *
 * @example
 * ```ts
 * import { HookSystem } from '@ydtb/anvil-hooks'
 *
 * const hooks = new HookSystem()
 *
 * // Register an action
 * hooks.addAction('contacts:get', async (id: string) => {
 *   return await db.select().from(contacts).where(eq(contacts.id, id))
 * })
 *
 * // Dispatch it
 * const contact = await hooks.doAction('contacts:get', 'ct_123')
 *
 * // Register a broadcast listener
 * hooks.onBroadcast('contact:created', async (payload) => {
 *   console.log('New contact:', payload)
 * })
 *
 * // Fire it
 * await hooks.broadcast('contact:created', { id: 'ct_123', name: 'John' })
 * ```
 *
 * For typed wrappers, import from `@ydtb/anvil-hooks/typed`:
 * ```ts
 * import { createTypedHooks } from '@ydtb/anvil-hooks/typed'
 * ```
 */

export { HookSystem, setHookErrorHandler } from './hook-system.ts'
export type { HookErrorHandler } from './hook-system.ts'

export type {
  ActionHandler,
  BroadcastCallback,
  BroadcastOptions,
  FilterCallback,
  FilterOptions,
  FilterQueryOptions,
  HookAPI,
  HookPriorityValue,
  SideChannelConfig,
  SideChannelContext,
} from './types.ts'

export { HookPriority } from './types.ts'
