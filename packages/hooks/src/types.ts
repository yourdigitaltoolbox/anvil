/**
 * Core types for the Anvil hook system.
 *
 * Three primitives:
 * - Actions: request/response (exactly one handler per name)
 * - Broadcasts: fire-and-forget (0-N listeners, priority-ordered)
 * - Filters: value transformation pipeline (0-N callbacks, waterfall)
 */

// ---------------------------------------------------------------------------
// Callback Types
// ---------------------------------------------------------------------------

/** Handler for actions (request/response, exactly one per name). */
export type ActionHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput
) => TOutput | Promise<TOutput>

/** Callback for broadcasts (fire-and-forget side effects). */
export type BroadcastCallback<TPayload = unknown> = (
  payload: TPayload
) => void | Promise<void>

/** Callback for filters (value in, transformed value out). */
export type FilterCallback<TValue = unknown> = (
  value: TValue
) => TValue | Promise<TValue>

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** Options for addFilter — priority and optional scope. */
export type FilterOptions = number | { priority?: number; scope?: string }

/** Options for applyFilter — optional scope query. */
export interface FilterQueryOptions {
  scope?: string
}

/** Priority constants for hook registration ordering. */
export const HookPriority = {
  EARLY: 5,
  DEFAULT: 10,
  LATE: 15,
} as const

export type HookPriorityValue = (typeof HookPriority)[keyof typeof HookPriority]

// ---------------------------------------------------------------------------
// Broadcast Options
// ---------------------------------------------------------------------------

/**
 * Generic metadata passed with broadcasts. Side-channel handlers
 * inspect these keys to create cross-cutting side effects (activity
 * logging, notifications, etc.).
 *
 * Consuming apps define their own option keys and register
 * corresponding side-channels via `registerSideChannel()`.
 *
 * @example
 * ```ts
 * // Fire a broadcast with app-specific metadata
 * hooks.broadcast('contact:created', payload, {
 *   activity: { entityType: 'contact', entityId: 'ct_1', action: 'created' },
 * })
 * ```
 */
export type BroadcastOptions = Record<string, unknown>

// ---------------------------------------------------------------------------
// Side Channels
// ---------------------------------------------------------------------------

/**
 * Context passed to a side-channel payload builder.
 */
export interface SideChannelContext {
  /** The name of the broadcast that triggered this side-channel. */
  broadcastName: string
  /** The payload of the original broadcast. */
  payload: unknown
  /** The value of the matching option key from BroadcastOptions. */
  optionValue: unknown
}

/**
 * Configuration for a side-channel — a cross-cutting broadcast that fires
 * automatically when a specific key is present in BroadcastOptions.
 *
 * @example
 * ```ts
 * hooks.registerSideChannel('activity', {
 *   broadcastName: 'activity',
 *   buildPayload: ({ broadcastName, payload, optionValue }) => ({
 *     broadcastName,
 *     activity: optionValue,
 *     metadata: payload,
 *   }),
 * })
 * ```
 */
export interface SideChannelConfig {
  /** The broadcast name to fire when this side-channel is triggered. */
  broadcastName: string
  /** Build the payload for the side-channel broadcast. */
  buildPayload: (context: SideChannelContext) => unknown
}

// ---------------------------------------------------------------------------
// HookAPI — the interface tools interact with
// ---------------------------------------------------------------------------

/**
 * Hook registration API.
 *
 * Tools receive this interface to register and dispatch hooks.
 * The underlying HookSystem class implements this interface.
 *
 * ## Three Primitives
 *
 * - **Actions:** request/response (exactly one handler per name, returns a result)
 * - **Broadcasts:** fire-and-forget side effects (multiple listeners, priority-ordered)
 * - **Filters:** value transformations (waterfall pipeline)
 */
export interface HookAPI {
  // --- Actions (request/response) ---

  /** Register a request/response action handler. Exactly one per name. Throws on duplicate. */
  addAction<TInput = unknown, TOutput = unknown>(
    name: string,
    handler: ActionHandler<TInput, TOutput>
  ): void

  /** Dispatch an action and return the result. Throws if no handler registered. */
  doAction<TInput = unknown, TOutput = unknown>(
    name: string,
    input: TInput
  ): Promise<TOutput>

  /** Try to dispatch an action. Returns null if no handler (does not throw). */
  tryAction<TInput = unknown, TOutput = unknown>(
    name: string,
    input: TInput
  ): Promise<TOutput | null>

  // --- Broadcasts (fire-and-forget) ---

  /** Register a broadcast listener. Multiple listeners per event. */
  onBroadcast<TPayload = unknown>(
    name: string,
    callback: BroadcastCallback<TPayload>,
    priority?: number
  ): void

  /** Fire a broadcast to all listeners (async, sequential by priority). */
  broadcast<TPayload = unknown>(
    name: string,
    payload: TPayload,
    options?: BroadcastOptions
  ): Promise<void>

  /** Fire a broadcast to all listeners (synchronous). */
  broadcastSync<TPayload = unknown>(
    name: string,
    payload: TPayload
  ): void

  // --- Filters (pipeline) ---

  /** Register a filter callback. Multiple callbacks per hook, waterfall. */
  addFilter<TValue = unknown>(
    hookName: string,
    callback: FilterCallback<TValue>,
    priorityOrOptions?: FilterOptions
  ): void

  /** Apply all filters as a waterfall (async). */
  applyFilter<TValue = unknown>(
    hookName: string,
    initialValue: TValue,
    options?: FilterQueryOptions
  ): Promise<TValue>

  /** Apply all filters as a waterfall (sync). */
  applyFilterSync<TValue = unknown>(
    hookName: string,
    initialValue: TValue,
    options?: FilterQueryOptions
  ): TValue

  // --- Side Channels ---

  /**
   * Register a side-channel that fires automatically when a broadcast
   * is called with a matching key in its options.
   *
   * @param optionKey - The key to watch for in BroadcastOptions
   * @param config - The side-channel configuration (target broadcast name + payload builder)
   */
  registerSideChannel(optionKey: string, config: SideChannelConfig): void

  // --- Lifecycle ---

  /** Declare a hook point for other tools to subscribe to. */
  registerHook(hookName: string): void

  /** Create a scoped API tagged with a tool ID (for error reporting + HMR cleanup). */
  createScopedAPI(pluginId: string): HookAPI

  /** Remove all registrations tagged with a specific tool ID. */
  removePluginRegistrations(pluginId: string): void
}
