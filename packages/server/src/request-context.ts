/**
 * Request context — AsyncLocalStorage-based per-request state.
 *
 * Every HTTP request is wrapped in an AsyncLocalStorage context containing
 * requestId, logger, timing, and slots for auth/scope middleware to populate.
 *
 * Access anywhere in server-side code:
 * ```ts
 * import { getRequestContext, getLogger } from '@ydtb/anvil-server'
 *
 * const ctx = getRequestContext()
 * ctx?.requestId  // 'abc-123'
 * ctx?.userId     // populated by auth middleware
 *
 * const logger = getLogger()
 * logger.info('Processing request')
 * ```
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import type { Logger } from '@ydtb/anvil'

// ---------------------------------------------------------------------------
// Request Context Type
// ---------------------------------------------------------------------------

export interface RequestContext {
  /** Unique request identifier — set immediately on request entry */
  requestId: string
  /** Authenticated user ID — set by auth middleware */
  userId?: string
  /** Active scope ID — set by scope middleware */
  scopeId?: string
  /** Active scope type — set by scope middleware */
  scopeType?: string
  /** Child logger — rebinds with each context enrichment */
  logger: Logger
  /** Request start time (ms) — for duration tracking */
  startedAt: number
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export const requestContext = new AsyncLocalStorage<RequestContext>()

// ---------------------------------------------------------------------------
// Console fallback logger
// ---------------------------------------------------------------------------

/**
 * Minimal console-based logger satisfying the Logger interface.
 * Used during boot (before layers are available) and outside request context.
 */
export function createConsoleLogger(): Logger {
  const bind = (bindings: Record<string, unknown>): Logger => {
    const prefix = Object.entries(bindings)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')

    return {
      debug: (obj, msg) => console.debug(`[${prefix}]`, msg ?? '', obj),
      info: (obj, msg) => console.info(`[${prefix}]`, msg ?? '', obj),
      warn: (obj, msg) => console.warn(`[${prefix}]`, msg ?? '', obj),
      error: (obj, msg) => console.error(`[${prefix}]`, msg ?? '', obj),
      child: (childBindings) => bind({ ...bindings, ...childBindings }),
    }
  }

  return {
    debug: (obj, msg) => console.debug(msg ?? '', obj),
    info: (obj, msg) => console.info(msg ?? '', obj),
    warn: (obj, msg) => console.warn(msg ?? '', obj),
    error: (obj, msg) => console.error(msg ?? '', obj),
    child: bind,
  }
}

/** Default console logger instance — used before LogLayer is available */
const consoleLogger = createConsoleLogger()

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/**
 * Get the current request context, if inside an HTTP request.
 * Returns undefined if called outside a request (e.g., during boot or in a job).
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore()
}

/**
 * Get the current logger.
 *
 * Resolution order:
 * 1. Request context logger (if inside a request — includes requestId, userId, scopeId)
 * 2. LogLayer logger (if layers are booted — for boot/job contexts)
 * 3. Console fallback (during early boot, before layers are ready)
 */
export function getLogger(): Logger {
  const ctx = requestContext.getStore()
  if (ctx) return ctx.logger

  // TODO: Check LogLayer once getLayer is implemented
  // const logLayer = tryGetLayer('logging')
  // if (logLayer) return logLayer.logger

  return consoleLogger
}
