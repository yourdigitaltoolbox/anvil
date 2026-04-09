/**
 * Silent logging layer — for tests and environments where you don't want log output.
 *
 * @example
 * ```ts
 * // test/test-config.ts
 * import { silent } from '@ydtb/anvil-layer-pino/silent'
 *
 * export default defineApp({
 *   layers: {
 *     logging: silent(),
 *   },
 * })
 * ```
 */

import { Context, Effect, Layer } from 'effect'
import type { LayerConfig, Logger } from '@ydtb/anvil'
import { createLayerConfig } from '@ydtb/anvil-server'
import type { LoggingLayer } from './index.ts'
import { LoggingTag } from './index.ts'

/**
 * Create a no-op silent logger. All log calls are discarded.
 * Useful for tests where you don't want console noise.
 */
function createSilentLogger(): Logger {
  const noop = () => {}
  const logger: Logger = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: () => logger,
  }
  return logger
}

/**
 * Silent logging layer — discards all log output.
 *
 * @example
 * ```ts
 * import { silent } from '@ydtb/anvil-layer-pino/silent'
 *
 * defineApp({
 *   layers: { logging: silent() },
 * })
 * ```
 */
export function silent(): LayerConfig<'logging'> {
  const service: LoggingLayer = { logger: createSilentLogger() }

  return createLayerConfig(
    'logging',
    LoggingTag,
    Layer.succeed(LoggingTag, service),
  )
}
