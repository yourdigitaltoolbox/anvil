/**
 * @ydtb/anvil-layer-resend — Transactional email layer for Anvil.
 *
 * Provides email sending through the Resend API. Stateless HTTP client
 * with no connection lifecycle — just needs an API key.
 *
 * @example
 * ```ts
 * // compose.config.ts
 * import { resend } from '@ydtb/anvil-layer-resend'
 *
 * export default defineApp({
 *   layers: {
 *     email: resend({ apiKey: env.RESEND_API_KEY }),
 *   },
 * })
 * ```
 *
 * Then in tool code:
 * ```ts
 * import { getLayer } from '@ydtb/anvil-server'
 *
 * const email = getLayer('email')
 * await email.send({
 *   to: 'user@example.com',
 *   subject: 'Welcome!',
 *   body: 'Thanks for signing up.',
 *   html: '<h1>Welcome!</h1><p>Thanks for signing up.</p>',
 * })
 * ```
 */

import { Resend } from 'resend'
import { Context, Effect, Layer } from 'effect'
import type { LayerConfig } from '@ydtb/anvil'
import { createLayerConfig } from '@ydtb/anvil-server'

// ---------------------------------------------------------------------------
// Layer contract
// ---------------------------------------------------------------------------

export interface EmailMessage {
  to: string | string[]
  subject: string
  body: string
  html?: string
  from?: string
  replyTo?: string
}

export interface EmailLayer {
  /** Send a transactional email. Returns the Resend message ID. */
  readonly send: (message: EmailMessage) => Promise<{ id: string }>
}

// ---------------------------------------------------------------------------
// Augment LayerMap
// ---------------------------------------------------------------------------

declare module '@ydtb/anvil' {
  interface LayerMap {
    email: EmailLayer
  }
}

// ---------------------------------------------------------------------------
// Effect tag
// ---------------------------------------------------------------------------

export const EmailTag = Context.GenericTag<EmailLayer>('Email')

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface ResendConfig {
  /** Resend API key */
  apiKey: string
  /** Default "from" address (e.g., 'App Name <noreply@example.com>') */
  defaultFrom?: string
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a Resend email layer.
 *
 * The Resend client is stateless (HTTP-based), so there is no connection
 * lifecycle to manage. The client is created on acquire and requires no
 * cleanup on release.
 *
 * @example
 * ```ts
 * import { resend } from '@ydtb/anvil-layer-resend'
 *
 * defineApp({
 *   layers: {
 *     email: resend({
 *       apiKey: 're_123...',
 *       defaultFrom: 'My App <noreply@myapp.com>',
 *     }),
 *   },
 * })
 * ```
 */
export function resend(config: ResendConfig): LayerConfig<'email'> {
  const { apiKey, defaultFrom } = config

  const effectLayer = Layer.scoped(
    EmailTag,
    Effect.acquireRelease(
      // Acquire: create Resend client
      Effect.sync(() => {
        const client = new Resend(apiKey)

        const service: EmailLayer = {
          send: async (message) => {
            const from = message.from ?? defaultFrom
            if (!from) {
              throw new Error(
                'Email "from" address is required. Set it per-message or via defaultFrom in the resend() config.',
              )
            }

            const result = await client.emails.send({
              from,
              to: Array.isArray(message.to) ? message.to : [message.to],
              subject: message.subject,
              text: message.body,
              html: message.html,
              replyTo: message.replyTo,
            })

            if (result.error) {
              throw new Error(`Resend error: ${result.error.message}`)
            }

            return { id: result.data!.id }
          },
        }

        return service
      }),
      // Release: no cleanup needed (stateless HTTP client)
      () => Effect.void,
    ),
  )

  // Health check: always ok (stateless HTTP client)
  return createLayerConfig('email', EmailTag, effectLayer, {
    healthCheck: Effect.succeed({ status: 'ok' as const, latencyMs: 0 }),
  })
}

// Re-export types
export type { EmailLayer as EmailLayerContract }
