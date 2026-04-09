/**
 * Console email layer — for development and testing.
 *
 * Logs emails to console instead of sending them via Resend.
 * Returns fake IDs. No external dependencies.
 *
 * @example
 * ```ts
 * import { consoleEmail } from '@ydtb/anvil-layer-resend/console'
 *
 * defineApp({
 *   layers: {
 *     email: consoleEmail(),
 *   },
 * })
 * ```
 */

import { Effect, Layer } from 'effect'
import type { LayerConfig } from '@ydtb/anvil'
import { createLayerConfig, getLayerTag } from '@ydtb/anvil-server'
import type { EmailLayer, EmailMessage } from './index.ts'

const EmailTag = getLayerTag<EmailLayer>('email')

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface ConsoleEmailConfig {
  /** If true, suppress all console output (for tests) */
  silent?: boolean
}

/**
 * Create a console email layer.
 *
 * Logs email details to console. Useful for development where you want
 * to see what emails would be sent without actually sending them.
 *
 * @param options.silent - Suppress console output (for tests)
 */
export function consoleEmail(options?: ConsoleEmailConfig): LayerConfig<'email'> {
  const silent = options?.silent ?? false
  let nextId = 1

  /** Track sent messages for test inspection */
  const sent: Array<EmailMessage & { id: string }> = []

  const service: EmailLayer = {
    send: async (message) => {
      const id = `fake_${nextId++}`

      sent.push({ ...message, id })

      if (!silent) {
        const to = Array.isArray(message.to) ? message.to.join(', ') : message.to
        console.info(
          `[console-email] To: ${to} | Subject: ${message.subject} | ID: ${id}`,
        )
        if (message.body) {
          console.info(`[console-email] Body: ${message.body.slice(0, 200)}`)
        }
      }

      return { id }
    },
  }

  return createLayerConfig(
    'email',
    Layer.succeed(EmailTag, service),
    {
      healthCheck: Effect.succeed({ status: 'ok' as const, latencyMs: 0 }),
    },
  )
}

/**
 * Get the list of sent messages from a console email layer instance.
 * Useful for test assertions.
 *
 * NOTE: This is only available on the consoleEmail layer, not the production
 * resend layer. Use it in tests to verify emails were "sent".
 */
export { type EmailMessage } from './index.ts'
