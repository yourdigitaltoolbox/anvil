/**
 * Typed hook wrappers — compile-time safety for cross-tool communication.
 *
 * These wrappers sit on top of the HookSystem and provide type-safe
 * dispatch/registration for actions and broadcasts. The underlying
 * hook system is unchanged — these are compile-time only.
 *
 * ## Usage
 *
 * Each tool declares its event/action types in `./types`:
 *
 * ```ts
 * // tools/billing/src/types.ts
 * export interface BillingActions {
 *   'billing:deduct': {
 *     input: { walletId: string; amount: number }
 *     output: { transactionId: string; newBalance: number }
 *   }
 * }
 *
 * export interface BillingEvents {
 *   'wallet:depleted': { walletId: string; scopeId: string }
 *   'wallet:credited': { walletId: string; amount: number }
 * }
 * ```
 *
 * Then use the typed wrappers:
 *
 * ```ts
 * import { createTypedHooks } from '@ydtb/anvil-hooks/typed'
 * import type { BillingActions } from '@myapp/billing/types'
 * import type { AllEvents } from './event-registry'
 *
 * const hooks = createTypedHooks<AllEvents, BillingActions>(hookSystem)
 *
 * // Typed — compiler checks event name + payload shape
 * hooks.broadcast('wallet:depleted', { walletId: 'wal_123', scopeId: 'loc_456' })
 *
 * // Typed — compiler checks action name + input/output
 * const result = await hooks.doAction('billing:deduct', { walletId: 'wal_123', amount: 500 })
 * //    ^? { transactionId: string; newBalance: number }
 * ```
 */

import type { BroadcastOptions, HookAPI } from './types.ts'

// ---------------------------------------------------------------------------
// Event Registry Type
// ---------------------------------------------------------------------------

/**
 * Base type for an event registry.
 * Each key is a broadcast event name, value is the payload type.
 *
 * Consuming apps create a merged interface:
 * ```ts
 * interface AppEvents extends BillingEvents, ContactEvents, TeamEvents {}
 * ```
 */
export type EventRegistry = Record<string, unknown>

/**
 * Base type for an action registry.
 * Each key is an action name, value is { input, output }.
 */
export type ActionTypeRegistry = Record<string, { input: unknown; output: unknown }>

// ---------------------------------------------------------------------------
// Typed Hook Wrappers
// ---------------------------------------------------------------------------

export interface TypedHooks<
  TEvents extends EventRegistry = EventRegistry,
  TActions extends ActionTypeRegistry = ActionTypeRegistry,
> {
  /** Type-safe broadcast — compiler verifies event name and payload shape. */
  broadcast<K extends keyof TEvents & string>(
    name: K,
    payload: TEvents[K],
    options?: BroadcastOptions
  ): Promise<void>

  /** Type-safe broadcast listener — compiler verifies event name and payload shape. */
  onBroadcast<K extends keyof TEvents & string>(
    name: K,
    callback: (payload: TEvents[K]) => void | Promise<void>,
    priority?: number
  ): void

  /** Type-safe action dispatch — compiler verifies name, input, and output. */
  doAction<K extends keyof TActions & string>(
    name: K,
    input: TActions[K]['input']
  ): Promise<TActions[K]['output']>

  /** Type-safe optional action — returns null if no handler. */
  tryAction<K extends keyof TActions & string>(
    name: K,
    input: TActions[K]['input']
  ): Promise<TActions[K]['output'] | null>

  /** Type-safe action handler registration. */
  addAction<K extends keyof TActions & string>(
    name: K,
    handler: (input: TActions[K]['input']) => TActions[K]['output'] | Promise<TActions[K]['output']>
  ): void

  /** Access the underlying untyped HookAPI for filters and advanced usage. */
  raw: HookAPI
}

/**
 * Create typed hook wrappers around a HookAPI instance.
 *
 * The returned object provides compile-time checked versions of
 * broadcast, onBroadcast, doAction, tryAction, and addAction.
 * Filters are accessed via `.raw` since they're less commonly typed.
 */
export function createTypedHooks<
  TEvents extends EventRegistry = EventRegistry,
  TActions extends ActionTypeRegistry = ActionTypeRegistry,
>(hooks: HookAPI): TypedHooks<TEvents, TActions> {
  return {
    broadcast: (name, payload, options) =>
      hooks.broadcast(name, payload, options),

    onBroadcast: (name, callback, priority) =>
      hooks.onBroadcast(name, callback as (payload: unknown) => void | Promise<void>, priority),

    doAction: (name, input) =>
      hooks.doAction(name, input),

    tryAction: (name, input) =>
      hooks.tryAction(name, input),

    addAction: (name, handler) =>
      hooks.addAction(name, handler as (input: unknown) => unknown | Promise<unknown>),

    raw: hooks,
  }
}
