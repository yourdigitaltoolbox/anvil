/**
 * @ydtb/anvil-layer-sentry — Error reporting layer for Anvil.
 *
 * Captures exceptions with request context (requestId, userId, scopeId)
 * automatically attached. Initializes the Sentry SDK on layer boot.
 *
 * @example
 * ```ts
 * import { sentry } from '@ydtb/anvil-layer-sentry'
 *
 * defineApp({
 *   layers: {
 *     errors: sentry({ dsn: env.SENTRY_DSN }),
 *   },
 * })
 * ```
 *
 * Then in tool code:
 * ```ts
 * const { capture } = getLayer('errors')
 * capture(error, { userId: ctx.userId, extra: { orderId } })
 * ```
 */

import * as Sentry from '@sentry/node'
import { Effect, Layer } from 'effect'
import type { LayerConfig } from '@ydtb/anvil'
import { createLayerConfig, getLayerTag } from '@ydtb/anvil-server'

// ---------------------------------------------------------------------------
// Layer contract
// ---------------------------------------------------------------------------

export interface ErrorLayer {
  /** Capture an exception with optional context */
  readonly capture: (error: Error, context?: Record<string, unknown>) => void
  /** Set user context for subsequent error reports */
  readonly setUser: (user: { id: string; email?: string } | null) => void
  /** Add breadcrumb for debugging context */
  readonly addBreadcrumb: (message: string, data?: Record<string, unknown>) => void
}

// ---------------------------------------------------------------------------
// Augment LayerMap
// ---------------------------------------------------------------------------

declare module '@ydtb/anvil' {
  interface LayerMap {
    errors: ErrorLayer
  }
}

// ---------------------------------------------------------------------------
// Effect tag
// ---------------------------------------------------------------------------

const ErrorTag = getLayerTag<ErrorLayer>('errors')

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface SentryConfig {
  /** Sentry DSN */
  dsn: string
  /** Environment name (default: process.env.NODE_ENV) */
  environment?: string
  /** Release version (default: undefined) */
  release?: string
  /** Sample rate for error events (0.0 - 1.0, default: 1.0) */
  sampleRate?: number
  /** Additional Sentry init options */
  options?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a Sentry error reporting layer.
 *
 * Initializes the Sentry SDK and provides capture/setUser/addBreadcrumb
 * through the ErrorLayer contract.
 */
export function sentry(config: SentryConfig): LayerConfig<'errors'> {
  const {
    dsn,
    environment = typeof process !== 'undefined' ? process.env.NODE_ENV : 'development',
    release,
    sampleRate = 1.0,
    options = {},
  } = config

  const effectLayer = Layer.scoped(
    ErrorTag,
    Effect.acquireRelease(
      // Acquire: initialize Sentry SDK
      Effect.sync(() => {
        Sentry.init({
          dsn,
          environment,
          release,
          sampleRate,
          ...options,
        })

        const service: ErrorLayer = {
          capture: (error, context) => {
            Sentry.withScope((scope) => {
              if (context) {
                scope.setExtras(context)
              }
              Sentry.captureException(error)
            })
          },
          setUser: (user) => {
            Sentry.setUser(user)
          },
          addBreadcrumb: (message, data) => {
            Sentry.addBreadcrumb({ message, data })
          },
        }

        return service
      }),
      // Release: flush pending events before shutdown
      () => Effect.promise(() => Sentry.close(2000)),
    ),
  )

  return createLayerConfig('errors', effectLayer, {
    healthCheck: Effect.succeed({ status: 'ok' as const, latencyMs: 0 }),
  })
}
