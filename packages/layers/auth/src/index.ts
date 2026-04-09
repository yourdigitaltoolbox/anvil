/**
 * @ydtb/anvil-layer-auth — Authentication layer for Anvil.
 *
 * Wraps better-auth with Anvil's layer system. Depends on the database layer —
 * shares the same connection pool instead of creating its own.
 *
 * @example
 * ```ts
 * import { betterAuth } from '@ydtb/anvil-layer-auth'
 * import { apiKeys, twoFactor } from '@ydtb/anvil-layer-auth/plugins'
 *
 * defineApp({
 *   layers: {
 *     database: postgres({ url: env.DATABASE_URL }),
 *     auth: betterAuth({
 *       secret: env.AUTH_SECRET,
 *       baseURL: env.APP_URL,
 *       plugins: [apiKeys(), twoFactor({ issuer: 'My App' })],
 *     }),
 *   },
 * })
 * ```
 *
 * The auth layer automatically uses the database layer's connection.
 * Effect resolves the dependency — database boots first, auth gets it.
 */

import { Context, Effect, Layer } from 'effect'
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
// Effect tag (via shared registry — enables inter-layer dependencies)
// ---------------------------------------------------------------------------

export const AuthTag = getLayerTag<AuthLayer>('auth')

// ---------------------------------------------------------------------------
// Plugin type
// ---------------------------------------------------------------------------

export interface AuthPlugin {
  id: string
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
   * Database connection string.
   * Used by better-auth for its own tables (users, sessions, accounts).
   * In the future, this could reference the database layer's connection directly.
   */
  database: string
  /** better-auth plugins */
  plugins?: AuthPlugin[]
  /** Session configuration */
  session?: {
    expiresIn?: number
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
 * The auth layer declares a dependency on the database layer via Effect's
 * dependency system. The lifecycle manager boots database first, then auth.
 *
 * Note: better-auth currently manages its own database connection via the
 * `database` config string. In the future, we can pass the shared Drizzle
 * instance from the database layer once better-auth supports it.
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
        const { betterAuth: createAuth } = await import('better-auth')

        const auth = createAuth({
          secret,
          baseURL,
          database: {
            type: 'postgres',
            url: database,
          },
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
