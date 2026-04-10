/**
 * Server surface — what a tool contributes to the server runtime.
 *
 * The server surface has two parts:
 *
 * 1. **Core fields** — schema, router, hooks, jobs, requires. The framework
 *    knows how to process these (mount routes, register hooks, schedule jobs).
 *
 * 2. **Contributions** — extensible fields defined by Extension packages.
 *    Same declaration merging pattern as client contributions.
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

import type { JobDefinition } from '@ydtb/anvil'

// ---------------------------------------------------------------------------
// Hook Registration Types
// ---------------------------------------------------------------------------

export interface ServerHooks {
  /** Action handlers — exactly one handler per action name */
  actions?: Record<string, (input: unknown) => unknown | Promise<unknown>>
  /** Broadcast listeners — fire-and-forget, 0-N listeners per event */
  broadcasts?: Record<
    string,
    | ((payload: unknown) => void | Promise<void>)
    | Array<(payload: unknown) => void | Promise<void>>
  >
  /** Filter callbacks — value transformation pipeline */
  filters?: Record<string, (value: unknown) => unknown>
}

// ---------------------------------------------------------------------------
// Extension Contributions — augmented by Extension packages
// ---------------------------------------------------------------------------

/**
 * Server-side contributions that tools can make to installed extensions.
 * Empty by default — augmented via declaration merging by extension packages.
 *
 * @example
 * ```ts
 * // In @ydtb/ext-notifications
 * declare module '@ydtb/anvil' {
 *   interface ServerContributions {
 *     notifications?: { providers: NotificationProvider[] }
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ServerContributions {}

// ---------------------------------------------------------------------------
// Server Core — fields the framework knows how to process
// ---------------------------------------------------------------------------

export interface ServerCore {
  /** Drizzle table definitions — collected and merged into the app schema */
  schema?: Record<string, unknown>
  /** Hono sub-app or oRPC router (via fromOrpc()) — mounted at /api/{toolId}/* */
  router?: unknown
  /** Hook registrations — actions, broadcasts, filters */
  hooks?: ServerHooks
  /** Background job definitions — cron and/or trigger-based */
  jobs?: JobDefinition[]
  /**
   * Layer requirements — declares which layers this tool needs.
   * Used for compile-time verification (Level 2 — via virtual module plugin).
   */
  requires?: readonly string[]

  // --- Escape hatch ---

  /**
   * Imperative setup for edge cases that can't be expressed declaratively.
   * Called once during server boot after all surfaces are collected.
   */
  setup?: (ctx: {
    hooks: {
      addAction: (name: string, handler: (input: unknown) => unknown | Promise<unknown>) => void
      onBroadcast: (name: string, handler: (payload: unknown) => void | Promise<void>) => void
      addFilter: (name: string, handler: (value: unknown) => unknown, priority?: number) => void
    }
  }) => void
}

// ---------------------------------------------------------------------------
// Server — the full type (core + contributions)
// ---------------------------------------------------------------------------

/** Full server surface type — core fields plus extension contributions. */
export type Server = ServerCore & ServerContributions

/**
 * Define a tool's server contribution.
 *
 * Core fields (schema, router, hooks, jobs, requires) are processed by the framework.
 * Extension contribution fields are collected and delivered to their owning extension.
 */
export function defineServer(definition: Server): Server {
  return definition
}
