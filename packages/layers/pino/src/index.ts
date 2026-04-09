/**
 * @ydtb/anvil-layer-pino — Structured logging layer for Anvil.
 *
 * Provides a pino-based implementation of the logging layer.
 * JSON output in production, pretty-printed in development.
 *
 * @example
 * ```ts
 * // compose.config.ts
 * import { pino } from '@ydtb/anvil-layer-pino'
 *
 * export default defineApp({
 *   layers: {
 *     logging: pino({ level: 'info' }),
 *   },
 * })
 * ```
 *
 * Then anywhere in tool code:
 * ```ts
 * import { getLayer } from '@ydtb/anvil-server'
 *
 * const { logger } = getLayer('logging')
 * logger.info({ userId: 'usr_123' }, 'User logged in')
 * ```
 *
 * Or via the convenience accessor (automatically includes request context):
 * ```ts
 * import { getLogger } from '@ydtb/anvil-server'
 *
 * const logger = getLogger()
 * logger.info('Processing request')
 * // → {"requestId":"abc","userId":"usr_123","msg":"Processing request"}
 * ```
 */

import pinoLib from 'pino'
import { Context, Effect, Layer } from 'effect'
import type { LayerConfig, Logger } from '@ydtb/anvil'
import { createLayerConfig } from '@ydtb/anvil-server'

// ---------------------------------------------------------------------------
// Layer contract
// ---------------------------------------------------------------------------

export interface LoggingLayer {
  /** The root pino logger instance */
  readonly logger: Logger
}

// ---------------------------------------------------------------------------
// Augment LayerMap
// ---------------------------------------------------------------------------

declare module '@ydtb/anvil' {
  interface LayerMap {
    logging: LoggingLayer
  }
}

// ---------------------------------------------------------------------------
// Effect tag
// ---------------------------------------------------------------------------

export const LoggingTag = Context.GenericTag<LoggingLayer>('Logging')

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface PinoConfig {
  /** Minimum log level (default: 'info') */
  level?: string
  /** Force pretty printing (default: auto-detect from NODE_ENV) */
  pretty?: boolean
  /** Additional pino options */
  options?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a pino logging layer.
 *
 * - Production (NODE_ENV=production): JSON output, no pretty printing
 * - Development: pretty-printed with colors and timestamps
 *
 * @example
 * ```ts
 * import { pino } from '@ydtb/anvil-layer-pino'
 *
 * defineApp({
 *   layers: {
 *     logging: pino({ level: 'debug' }),
 *   },
 * })
 * ```
 */
export function pino(config: PinoConfig = {}): LayerConfig<'logging'> {
  const {
    level = 'info',
    pretty = process.env.NODE_ENV !== 'production',
    options = {},
  } = config

  const transport = pretty
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined

  const pinoLogger = pinoLib({
    level,
    transport,
    ...options,
  })

  // Wrap pino in the Anvil Logger interface
  const logger: Logger = wrapPinoLogger(pinoLogger)

  const service: LoggingLayer = { logger }

  return createLayerConfig(
    'logging',
    LoggingTag,
    Layer.succeed(LoggingTag, service),
    {
      healthCheck: Effect.succeed({ status: 'ok' as const, latencyMs: 0 }),
    },
  )
}

// ---------------------------------------------------------------------------
// Pino → Anvil Logger adapter
// ---------------------------------------------------------------------------

/**
 * Wraps a pino logger instance to satisfy the Anvil Logger interface.
 * Handles the difference in method signatures (pino uses mergingObject first).
 */
function wrapPinoLogger(pinoLogger: pinoLib.Logger): Logger {
  return {
    debug: (obj, msg) => pinoLogger.debug(obj as object, msg),
    info: (obj, msg) => pinoLogger.info(obj as object, msg),
    warn: (obj, msg) => pinoLogger.warn(obj as object, msg),
    error: (obj, msg) => pinoLogger.error(obj as object, msg),
    child: (bindings) => wrapPinoLogger(pinoLogger.child(bindings)),
  }
}

// Re-export types
export type { Logger } from '@ydtb/anvil'
