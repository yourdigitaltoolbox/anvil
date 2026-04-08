/**
 * Server definition — what a tool contributes to the server runtime.
 *
 * Each tool exports a `Server` (or a function returning one) from its
 * `./server` subpath. Anvil reads these definitions and registers
 * database schema, API routers, hook handlers, background jobs, etc.
 */

import type { JobDefinition } from './layers.ts'

// ---------------------------------------------------------------------------
// Hook Registration Types
// ---------------------------------------------------------------------------

export interface ServerHooks {
  /** Action handlers — exactly one handler per action name */
  actions?: Record<string, (input: unknown) => unknown | Promise<unknown>>
  /** Broadcast listeners — fire-and-forget, 0-N listeners */
  broadcasts?: Record<string, (payload: unknown) => void | Promise<void>>
  /** Filter callbacks — value transformation pipeline */
  filters?: Record<string, (value: unknown) => unknown>
}

// ---------------------------------------------------------------------------
// Server Definition
// ---------------------------------------------------------------------------

export interface Server {
  /** Drizzle table definitions — collected and merged into the app schema */
  schema?: Record<string, unknown>
  /** oRPC router — mounted at /api/rpc/{toolId}/* */
  router?: unknown
  /** Hook registrations — actions, broadcasts, filters */
  hooks?: ServerHooks
  /** Background job definitions — cron and/or trigger-based */
  jobs?: JobDefinition[]
  /** Notification provider registrations */
  notificationProviders?: unknown
  /** Server-side onboarding step definitions */
  onboarding?: unknown[]
  /**
   * Layer requirements — declares which layers this tool needs.
   * Used for compile-time verification (Level 2).
   */
  requires?: readonly string[]
  /**
   * Escape hatch — imperative setup for edge cases that
   * can't be expressed declaratively.
   */
  setup?: (ctx: {
    hooks: {
      addAction: (name: string, handler: (input: unknown) => unknown | Promise<unknown>) => void
      onBroadcast: (name: string, handler: (payload: unknown) => void | Promise<void>) => void
      addFilter: (name: string, handler: (value: unknown) => unknown, priority?: number) => void
    }
  }) => void
}

/**
 * Define a tool's server contribution.
 *
 * @example
 * ```ts
 * import { defineServer } from '@ydtb/anvil'
 * import { contacts, contactNotes } from './db/schema'
 * import { contactsRouter } from './api/router'
 *
 * export default defineServer({
 *   schema: { contacts, contactNotes },
 *   router: contactsRouter,
 *   hooks: {
 *     actions: {
 *       'contacts:get': getContactHandler,
 *     },
 *   },
 *   jobs: [
 *     { id: 'contacts-cleanup', schedule: '0 3 * * *', handler: purgeDeleted },
 *   ],
 *   requires: ['database', 'email'],
 * })
 * ```
 */
export function defineServer(definition: Server): Server {
  return definition
}
