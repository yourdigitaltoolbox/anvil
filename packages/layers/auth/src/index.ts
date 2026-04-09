/**
 * @ydtb/anvil-layer-auth — Authentication layer for Anvil.
 *
 * Wraps better-auth with Anvil's layer system. Provides session validation,
 * user management, and a pluggable auth plugin system.
 *
 * @example
 * ```ts
 * import { betterAuth } from '@ydtb/anvil-layer-auth'
 * import { apiKeys, twoFactor } from '@ydtb/anvil-layer-auth/plugins'
 *
 * defineApp({
 *   layers: {
 *     auth: betterAuth({
 *       secret: env.AUTH_SECRET,
 *       baseURL: env.APP_URL,
 *       plugins: [apiKeys(), twoFactor({ issuer: 'My App' })],
 *     }),
 *   },
 * })
 * ```
 *
 * Then in tool code:
 * ```ts
 * const auth = getLayer('auth')
 * const session = await auth.getSession(request)
 * ```
 */

import { Context, Effect, Layer } from 'effect'
import type { LayerConfig } from '@ydtb/anvil'
import { createLayerConfig } from '@ydtb/anvil-server'

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
   * The better-auth handler — mount this to handle auth routes
   * (/api/auth/sign-in, /api/auth/sign-up, /api/auth/callback, etc.)
   */
  readonly handler: (request: Request) => Promise<Response>
  /**
   * The underlying better-auth instance — for advanced use cases
   * and plugin-specific APIs (API key validation, 2FA, etc.)
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
// Effect tag
// ---------------------------------------------------------------------------

export const AuthTag = Context.GenericTag<AuthLayer>('Auth')

// ---------------------------------------------------------------------------
// Plugin type
// ---------------------------------------------------------------------------

/**
 * A better-auth plugin configuration. These are passed to the betterAuth()
 * factory and forwarded to better-auth's plugin system.
 *
 * Use the plugin helpers from '@ydtb/anvil-layer-auth/plugins'.
 */
export interface AuthPlugin {
  /** Plugin identifier */
  id: string
  /** The better-auth plugin configuration object */
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
   * Database connection string or reference.
   * If a string, better-auth connects directly.
   * If you want to share the database layer's connection, pass the URL
   * that your postgres layer uses.
   */
  database: string
  /** better-auth plugins */
  plugins?: AuthPlugin[]
  /** Session configuration */
  session?: {
    /** Session duration in seconds (default: 7 days) */
    expiresIn?: number
    /** How often to refresh the session (default: 1 day) */
    updateAge?: number
  }
  /** Additional better-auth options */
  options?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a better-auth authentication layer.
 *
 * Initializes better-auth with the provided configuration and plugins.
 * The auth handler should be mounted at /api/auth/* for sign-in, sign-up,
 * callbacks, and session management.
 *
 * @example
 * ```ts
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

  const effectLayer = Layer.scoped(
    AuthTag,
    Effect.acquireRelease(
      Effect.promise(async () => {
        // Dynamic import — better-auth is a peer-ish dependency
        const { betterAuth: createAuth } = await import('better-auth')

        const auth = createAuth({
          secret,
          baseURL,
          database: {
            type: 'postgres',
            url: database,
          },
          session: {
            expiresIn: session.expiresIn ?? 60 * 60 * 24 * 7, // 7 days
            updateAge: session.updateAge ?? 60 * 60 * 24, // 1 day
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
              // Use the session API to look up users — better-auth doesn't expose
              // a direct getUser endpoint, but the internal API can be accessed
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

          handler: (request: Request) => {
            return auth.handler(request)
          },

          instance: auth,
        }

        return service
      }),
      // Release: nothing to clean up — better-auth is stateless (uses the DB layer's connection)
      () => Effect.void,
    ),
  )

  return createLayerConfig('auth', AuthTag, effectLayer, {
    healthCheck: Effect.succeed({ status: 'ok' as const, latencyMs: 0 }),
  })
}

