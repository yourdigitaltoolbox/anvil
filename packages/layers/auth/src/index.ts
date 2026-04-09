/**
 * @ydtb/anvil-layer-auth — Authentication layer for Anvil.
 *
 * Wraps better-auth with Anvil's layer system. Supports two database modes:
 * - URL string: better-auth manages its own connection
 * - Drizzle adapter: shares the database layer's connection
 *
 * @example
 * ```ts
 * // Simple — URL string (better-auth manages its own connection)
 * import { betterAuth } from '@ydtb/anvil-layer-auth'
 *
 * defineApp({
 *   layers: {
 *     auth: betterAuth({
 *       secret: env.AUTH_SECRET,
 *       database: env.DATABASE_URL,
 *     }),
 *   },
 * })
 * ```
 *
 * ```ts
 * // Advanced — Drizzle adapter (shares database layer's connection)
 * import { betterAuth } from '@ydtb/anvil-layer-auth'
 * import { drizzleAdapter } from 'better-auth/adapters/drizzle'
 *
 * defineApp({
 *   layers: {
 *     database: postgres({ url: env.DATABASE_URL }),
 *     auth: betterAuth({
 *       secret: env.AUTH_SECRET,
 *       database: drizzleAdapter(db, { provider: 'pg', schema }),
 *     }),
 *   },
 * })
 * ```
 */

import { Effect, Layer } from 'effect'
import type { LayerConfig } from '@ydtb/anvil'
import { createLayerConfig, getLayerTag } from '@ydtb/anvil-server'

// ---------------------------------------------------------------------------
// Layer contract
// ---------------------------------------------------------------------------

export interface AuthSession {
  userId: string
  sessionId: string
  expiresAt: Date
}

export interface AuthUser {
  id: string
  email: string
  name?: string
  image?: string
  emailVerified: boolean
  createdAt: Date
  updatedAt: Date
}

export interface AuthLayer {
  /** Validate a request and return the session, or null if not authenticated */
  readonly getSession: (request: Request) => Promise<AuthSession | null>
  /** Get a user by ID */
  readonly getUser: (userId: string) => Promise<AuthUser | null>
  /**
   * The better-auth handler — mount at /api/auth/* for sign-in, sign-up,
   * callbacks, session management, and any plugin-added endpoints.
   */
  readonly handler: (request: Request) => Promise<Response>
  /**
   * The underlying better-auth instance — for advanced use cases,
   * plugin-specific APIs, and direct access to better-auth's API.
   */
  readonly instance: unknown
}

// ---------------------------------------------------------------------------
// Augment LayerMap
// ---------------------------------------------------------------------------

declare module '@ydtb/anvil' {
  interface LayerMap {
    auth: AuthLayer
  }
}

// ---------------------------------------------------------------------------
// Effect tag (via shared registry)
// ---------------------------------------------------------------------------

export const AuthTag = getLayerTag<AuthLayer>('auth')

// ---------------------------------------------------------------------------
// Plugin type
// ---------------------------------------------------------------------------

/**
 * A better-auth plugin configuration. Passed to the betterAuth() factory
 * and forwarded to better-auth's plugin system.
 *
 * For Anvil-provided plugins, use '@ydtb/anvil-layer-auth/plugins'.
 * For app-specific plugins (e.g., scope auth), create your own AuthPlugin
 * and pass the raw better-auth plugin object.
 */
export interface AuthPlugin {
  /** Plugin identifier */
  id: string
  /**
   * The better-auth plugin object.
   * This is the raw plugin as returned by better-auth's plugin API.
   * Pass the actual better-auth plugin — not a wrapper.
   */
  plugin: unknown
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface BetterAuthConfig {
  /** Secret key for signing sessions */
  secret: string
  /** Base URL of the application (used for OAuth callbacks, email links) */
  baseURL?: string
  /**
   * Database configuration. Accepts either:
   * - A connection URL string (better-auth manages its own connection)
   * - A better-auth database adapter object (e.g., drizzleAdapter for shared connections)
   *
   * For the Drizzle adapter pattern (sharing the database layer's connection):
   * ```ts
   * import { drizzleAdapter } from 'better-auth/adapters/drizzle'
   *
   * betterAuth({
   *   database: drizzleAdapter(db, { provider: 'pg', schema }),
   * })
   * ```
   */
  database: string | { adapter: unknown } | Record<string, unknown>
  /** better-auth plugins — both Anvil-provided and app-specific */
  plugins?: AuthPlugin[]
  /** Session configuration */
  session?: {
    /** Session duration in seconds (default: 7 days) */
    expiresIn?: number
    /** How often to refresh the session (default: 1 day) */
    updateAge?: number
  }
  /**
   * Additional better-auth options. Passed directly to betterAuth().
   * Use for advanced configuration not covered by the typed fields.
   */
  options?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a better-auth authentication layer.
 *
 * Supports custom better-auth plugins for app-specific auth behavior
 * (e.g., scope-based auth, custom session fields, organization support).
 * Plugins add endpoints, tables, and middleware to better-auth.
 */
export function betterAuth(config: BetterAuthConfig): LayerConfig<'auth'> {
  const {
    secret,
    baseURL,
    database,
    plugins = [],
    session = {},
    options = {},
  } = config

  // Resolve database config
  const databaseConfig = typeof database === 'string'
    ? { type: 'postgres' as const, url: database }
    : database

  const effectLayer = Layer.scoped(
    AuthTag,
    Effect.acquireRelease(
      Effect.promise(async () => {
        const { betterAuth: createAuth } = await import('better-auth')

        const auth = createAuth({
          secret,
          baseURL,
          database: databaseConfig as any,
          session: {
            expiresIn: session.expiresIn ?? 60 * 60 * 24 * 7,
            updateAge: session.updateAge ?? 60 * 60 * 24,
          },
          plugins: plugins.map((p) => p.plugin),
          ...options,
        } as any)

        const service: AuthLayer = {
          getSession: async (request: Request) => {
            try {
              const result = await auth.api.getSession({ headers: request.headers })
              if (!result?.session) return null
              return {
                userId: result.session.userId,
                sessionId: result.session.id ?? result.session.token,
                expiresAt: new Date(result.session.expiresAt),
              }
            } catch {
              return null
            }
          },

          getUser: async (userId: string) => {
            try {
              const api = auth.api as any
              if (typeof api.getUser === 'function') {
                const user = await api.getUser({ query: { id: userId } })
                if (!user) return null
                return {
                  id: user.id,
                  email: user.email,
                  name: user.name ?? undefined,
                  image: user.image ?? undefined,
                  emailVerified: !!user.emailVerified,
                  createdAt: new Date(user.createdAt),
                  updatedAt: new Date(user.updatedAt),
                }
              }
              return null
            } catch {
              return null
            }
          },

          handler: (request: Request) => auth.handler(request),

          instance: auth,
        }

        return service
      }),
      () => Effect.void,
    ),
  )

  return createLayerConfig('auth', effectLayer, {
    healthCheck: Effect.succeed({ status: 'ok' as const, latencyMs: 0 }),
  })
}
