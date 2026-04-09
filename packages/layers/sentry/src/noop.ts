/**
 * No-op error layer — for development and testing.
 *
 * Logs errors to console instead of sending to Sentry.
 * No external dependencies, no network calls.
 *
 * @example
 * ```ts
 * import { noopErrors } from '@ydtb/anvil-layer-sentry/noop'
 *
 * defineApp({
 *   layers: { errors: noopErrors() },
 * })
 * ```
 */

import { Context, Effect, Layer } from 'effect'
import type { LayerConfig } from '@ydtb/anvil'
import { createLayerConfig } from '@ydtb/anvil-server'
import type { ErrorLayer } from './index.ts'
import { ErrorTag } from './index.ts'

/**
 * No-op error layer — logs to console, doesn't send anywhere.
 *
 * @param options.silent - If true, don't even log to console (for tests)
 */
export function noopErrors(options?: { silent?: boolean }): LayerConfig<'errors'> {
  const silent = options?.silent ?? false

  const service: ErrorLayer = {
    capture: (error, context) => {
      if (!silent) {
        console.error('[noop-errors] Captured:', error.message, context ?? '')
      }
    },
    setUser: (user) => {
      if (!silent) {
        console.info('[noop-errors] Set user:', user?.id ?? 'null')
      }
    },
    addBreadcrumb: (message, data) => {
      if (!silent) {
        console.debug('[noop-errors] Breadcrumb:', message, data ?? '')
      }
    },
  }

  return createLayerConfig(
    'errors',
    ErrorTag,
    Layer.succeed(ErrorTag, service),
  )
}
