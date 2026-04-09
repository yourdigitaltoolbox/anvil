/**
 * Core hook engine — three primitives for cross-tool communication.
 *
 * - Actions: request/response (exactly one handler per name, returns result)
 * - Broadcasts: fire-and-forget side effects, executed sequentially by priority
 * - Filters: value transformations (waterfall), each receives previous output
 *
 * Broadcasts and filters support priority ordering (lower = runs first, default = 10).
 * All callbacks are wrapped in try/catch so a failing tool never crashes the platform.
 */

import type {
  ActionHandler,
  BroadcastCallback,
  BroadcastOptions,
  FilterCallback,
  FilterOptions,
  FilterQueryOptions,
  HookAPI,
  SideChannelConfig,
} from './types.ts'

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

interface ActionRegistration {
  handler: (input: unknown) => unknown | Promise<unknown>
  pluginId: string
}

interface BroadcastRegistration {
  callback: (payload: unknown) => void | Promise<void>
  priority: number
  pluginId: string
}

interface FilterRegistration {
  callback: (value: unknown) => unknown | Promise<unknown>
  priority: number
  pluginId: string
  scope?: string
}

function parseFilterOptions(opts?: FilterOptions): {
  priority: number
  scope?: string
} {
  if (opts == null) return { priority: 10 }
  if (typeof opts === 'number') return { priority: opts }
  return { priority: opts.priority ?? 10, scope: opts.scope }
}

// ---------------------------------------------------------------------------
// Error Handler
// ---------------------------------------------------------------------------

/**
 * Pluggable error handler for hook system errors.
 * Defaults to console.error. Override via `setHookErrorHandler()` to
 * integrate with structured logging or error reporting.
 */
export type HookErrorHandler = (
  context: { hookType: 'action' | 'broadcast' | 'filter'; hookName: string; pluginId?: string },
  error: unknown
) => void

let errorHandler: HookErrorHandler = (ctx, error) => {
  const source = ctx.pluginId ? ` [tool: ${ctx.pluginId}]` : ''
  console.error(`[HookSystem] Error in ${ctx.hookType} "${ctx.hookName}"${source}:`, error)
}

/** Override the default error handler for hook system errors. */
export function setHookErrorHandler(handler: HookErrorHandler): void {
  errorHandler = handler
}

// ---------------------------------------------------------------------------
// HookSystem
// ---------------------------------------------------------------------------

export class HookSystem implements HookAPI {
  private readonly actionHandlers = new Map<string, ActionRegistration>()
  private readonly broadcastListeners = new Map<string, BroadcastRegistration[]>()
  private readonly filters = new Map<string, FilterRegistration[]>()
  private readonly declaredHooks = new Set<string>()
  private readonly sideChannels = new Map<string, SideChannelConfig>()

  // -------------------------------------------------------------------------
  // Actions (request/response)
  // -------------------------------------------------------------------------

  addAction<TInput = unknown, TOutput = unknown>(
    name: string,
    handler: ActionHandler<TInput, TOutput>
  ): void {
    if (this.actionHandlers.has(name)) {
      throw new Error(
        `[HookSystem] Action handler already registered for "${name}". ` +
        `Only one handler is allowed per action name.`
      )
    }
    this.actionHandlers.set(name, {
      handler: handler as ActionRegistration['handler'],
      pluginId: '',
    })
  }

  async doAction<TInput = unknown, TOutput = unknown>(
    name: string,
    input: TInput
  ): Promise<TOutput> {
    const registration = this.actionHandlers.get(name)
    if (!registration) {
      throw new Error(
        `[HookSystem] No action handler registered for "${name}". ` +
        `Register a handler with addAction("${name}", handler) first.`
      )
    }
    return (await registration.handler(input)) as TOutput
  }

  async tryAction<TInput = unknown, TOutput = unknown>(
    name: string,
    input: TInput
  ): Promise<TOutput | null> {
    const registration = this.actionHandlers.get(name)
    if (!registration) return null
    return (await registration.handler(input)) as TOutput
  }

  // -------------------------------------------------------------------------
  // Broadcasts (fire-and-forget)
  // -------------------------------------------------------------------------

  onBroadcast<TPayload = unknown>(
    name: string,
    callback: BroadcastCallback<TPayload>,
    priority = 10
  ): void {
    const registrations = this.broadcastListeners.get(name) ?? []
    registrations.push({
      callback: callback as BroadcastRegistration['callback'],
      priority,
      pluginId: '',
    })
    registrations.sort((a, b) => a.priority - b.priority)
    this.broadcastListeners.set(name, registrations)
  }

  async broadcast<TPayload = unknown>(
    name: string,
    payload: TPayload,
    options?: BroadcastOptions
  ): Promise<void> {
    const registrations = this.broadcastListeners.get(name)
    if (registrations) {
      for (const reg of registrations) {
        try {
          await reg.callback(payload)
        } catch (error) {
          errorHandler({ hookType: 'broadcast', hookName: name, pluginId: reg.pluginId }, error)
        }
      }
    }

    // Generic side-channels: fire registered side-channel broadcasts
    // for each matching key in options
    if (options) {
      for (const [optionKey, config] of this.sideChannels) {
        if (options[optionKey] != null) {
          let sidePayload: unknown
          try {
            sidePayload = config.buildPayload({
              broadcastName: name,
              payload,
              optionValue: options[optionKey],
            })
          } catch (error) {
            errorHandler({ hookType: 'broadcast', hookName: config.broadcastName, pluginId: undefined }, error)
            continue
          }
          const listeners = this.broadcastListeners.get(config.broadcastName)
          if (listeners) {
            for (const reg of listeners) {
              try {
                await reg.callback(sidePayload)
              } catch (error) {
                errorHandler({ hookType: 'broadcast', hookName: config.broadcastName, pluginId: reg.pluginId }, error)
              }
            }
          }
        }
      }
    }
  }

  broadcastSync<TPayload = unknown>(name: string, payload: TPayload): void {
    const registrations = this.broadcastListeners.get(name)
    if (!registrations) return
    for (const reg of registrations) {
      try {
        reg.callback(payload)
      } catch (error) {
        errorHandler({ hookType: 'broadcast', hookName: name, pluginId: reg.pluginId }, error)
      }
    }
  }

  // -------------------------------------------------------------------------
  // Filters (pipeline)
  // -------------------------------------------------------------------------

  addFilter<TValue = unknown>(
    hookName: string,
    callback: FilterCallback<TValue>,
    priorityOrOptions?: FilterOptions
  ): void {
    const { priority, scope } = parseFilterOptions(priorityOrOptions)
    const registrations = this.filters.get(hookName) ?? []
    registrations.push({
      callback: callback as FilterRegistration['callback'],
      priority,
      pluginId: '',
      scope,
    })
    registrations.sort((a, b) => a.priority - b.priority)
    this.filters.set(hookName, registrations)
  }

  async applyFilter<TValue>(
    hookName: string,
    initialValue: TValue,
    options?: FilterQueryOptions
  ): Promise<TValue> {
    const registrations = this.filters.get(hookName)
    if (!registrations) return initialValue

    const applicable = options?.scope
      ? registrations.filter((r) => r.scope === options.scope || r.scope == null)
      : registrations

    let value = initialValue
    for (const reg of applicable) {
      try {
        value = (await reg.callback(value)) as TValue
      } catch (error) {
        errorHandler({ hookType: 'filter', hookName, pluginId: reg.pluginId }, error)
      }
    }
    return value
  }

  applyFilterSync<TValue>(
    hookName: string,
    initialValue: TValue,
    options?: FilterQueryOptions
  ): TValue {
    const registrations = this.filters.get(hookName)
    if (!registrations) return initialValue

    const applicable = options?.scope
      ? registrations.filter((r) => r.scope === options.scope || r.scope == null)
      : registrations

    let value = initialValue
    for (const reg of applicable) {
      try {
        value = reg.callback(value) as TValue
      } catch (error) {
        errorHandler({ hookType: 'filter', hookName, pluginId: reg.pluginId }, error)
      }
    }
    return value
  }

  // -------------------------------------------------------------------------
  // Side Channels
  // -------------------------------------------------------------------------

  registerSideChannel(optionKey: string, config: SideChannelConfig): void {
    this.sideChannels.set(optionKey, config)
  }

  // -------------------------------------------------------------------------
  // Hook declaration
  // -------------------------------------------------------------------------

  registerHook(hookName: string): void {
    this.declaredHooks.add(hookName)
  }

  hasHook(hookName: string): boolean {
    return this.declaredHooks.has(hookName)
  }

  getRegisteredHooks(): string[] {
    return [...this.declaredHooks]
  }

  // -------------------------------------------------------------------------
  // Scoped API (per-tool isolation)
  // -------------------------------------------------------------------------

  createScopedAPI(pluginId: string): HookAPI {
    this.removePluginRegistrations(pluginId)

    return {
      addAction: <TInput = unknown, TOutput = unknown>(
        name: string,
        handler: ActionHandler<TInput, TOutput>
      ) => {
        if (this.actionHandlers.has(name)) {
          throw new Error(
            `[HookSystem] Action handler already registered for "${name}". ` +
            `Only one handler is allowed per action name.`
          )
        }
        this.actionHandlers.set(name, {
          handler: handler as ActionRegistration['handler'],
          pluginId,
        })
      },
      doAction: (name, input) => this.doAction(name, input),
      tryAction: (name, input) => this.tryAction(name, input),
      onBroadcast: <TPayload = unknown>(
        name: string,
        callback: BroadcastCallback<TPayload>,
        priority = 10
      ) => {
        const registrations = this.broadcastListeners.get(name) ?? []
        registrations.push({
          callback: callback as BroadcastRegistration['callback'],
          priority,
          pluginId,
        })
        registrations.sort((a, b) => a.priority - b.priority)
        this.broadcastListeners.set(name, registrations)
      },
      broadcast: (name, payload, options) => this.broadcast(name, payload, options),
      broadcastSync: (name, payload) => this.broadcastSync(name, payload),
      addFilter: <TValue = unknown>(
        hookName: string,
        callback: FilterCallback<TValue>,
        priorityOrOptions?: FilterOptions
      ) => {
        const { priority, scope } = parseFilterOptions(priorityOrOptions)
        const registrations = this.filters.get(hookName) ?? []
        registrations.push({
          callback: callback as FilterRegistration['callback'],
          priority,
          pluginId,
          scope,
        })
        registrations.sort((a, b) => a.priority - b.priority)
        this.filters.set(hookName, registrations)
      },
      applyFilter: (hookName, initialValue, options) =>
        this.applyFilter(hookName, initialValue, options),
      applyFilterSync: (hookName, initialValue, options) =>
        this.applyFilterSync(hookName, initialValue, options),
      registerSideChannel: (optionKey, config) => this.registerSideChannel(optionKey, config),
      registerHook: (hookName) => this.declaredHooks.add(hookName),
      createScopedAPI: (childId) => this.createScopedAPI(childId),
      removePluginRegistrations: (targetId) => this.removePluginRegistrations(targetId),
    }
  }

  // -------------------------------------------------------------------------
  // Removal
  // -------------------------------------------------------------------------

  removeAction(hookName: string): void {
    this.actionHandlers.delete(hookName)
  }

  removePluginRegistrations(pluginId: string): void {
    for (const [name, reg] of this.actionHandlers) {
      if (reg.pluginId === pluginId) this.actionHandlers.delete(name)
    }
    for (const [hookName, registrations] of this.filters) {
      const filtered = registrations.filter((r) => r.pluginId !== pluginId)
      if (filtered.length === 0) this.filters.delete(hookName)
      else this.filters.set(hookName, filtered)
    }
    for (const [hookName, registrations] of this.broadcastListeners) {
      const filtered = registrations.filter((r) => r.pluginId !== pluginId)
      if (filtered.length === 0) this.broadcastListeners.delete(hookName)
      else this.broadcastListeners.set(hookName, filtered)
    }
  }
}
