/**
 * @ydtb/anvil-layer-auth — Authentication layer for Anvil.
 *
 * Wraps better-auth with Anvil's layer system. Uses the database layer's
 * Drizzle connection via the Drizzle adapter — no separate connection pool.
 *
 * @example
 * ```ts
 * import { betterAuth } from '@ydtb/anvil-layer-auth'
 *
 * defineApp({
 *   layers: {
 *     database: postgres({ url: env.DATABASE_URL }),
 *     auth: betterAuth({
 *       secret: env.AUTH_SECRET,
 *       baseURL: env.APP_URL,
 *     }),
 *   },
 * })
 * ```
 *
 * The auth layer depends on the database layer. Effect resolves the
 * boot order automatically — database boots first, auth gets the connection.
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
  /** The authenticated user — returned directly from better-auth's getSession */
  user: AuthUser
  /**
   * Additional session fields configured via better-auth's `session.fields`.
   *
   * Apps can extend the session with custom data that persists across requests:
   * ```ts
   * betterAuth({
   *   options: {
   *     session: {
   *       fields: {
   *         scopeId: { type: 'string', required: false },
   *         scopeType: { type: 'string', required: false },
   *       },
   *     },
   *   },
   * })
   * ```
   *
   * These fields are stored in the session table and returned on every
   * `getSession()` call. Access via `session.scopeId`, `session.scopeType`, etc.
   */
  [key: string]: unknown
}

export interface AuthUser {
  id: string
  email: string
  name?: string
  image?: string
  emailVerified: boolean
  createdAt: Date
  updatedAt: Date
  /** Additional fields from better-auth plugins or user.additionalFields config */
  [key: string]: unknown
}

export interface AuthLayer {
  /** Validate a request and return the session + user, or null if not authenticated */
  readonly getSession: (request: Request) => Promise<AuthSession | null>
  /**
   * Update custom fields on the current session.
   *
   * Uses better-auth's session update API. Fields must be declared in
   * the `session.fields` config. Only updates the fields you pass —
   * other session fields are preserved.
   *
   * @example
   * ```ts
   * const auth = getLayer('auth')
   * await auth.updateSession(request, { scopeId: 'co_123', scopeType: 'company' })
   * ```
   */
  readonly updateSession: (request: Request, fields: Record<string, unknown>) => Promise<boolean>
  /** Get a user by ID via better-auth's internal adapter */
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
 */
export interface AuthPlugin {
  /** Plugin identifier */
  id: string
  /**
   * The better-auth plugin object.
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
   * Database configuration. Two modes:
   *
   * 1. **Use the database layer (recommended):**
   *    Omit this field or pass `undefined`. The auth layer will use
   *    `getLayer('database')` to get the Drizzle instance via the
   *    Drizzle adapter. Requires the database layer to be configured.
   *
   * 2. **Provide a Drizzle adapter directly:**
   *    Pass the result of `drizzleAdapter(db, { provider: 'pg' })`.
   *    Useful when you need custom adapter options or schema.
   *
   * 3. **Provide a connection URL (standalone):**
   *    Pass a string URL. better-auth manages its own connection.
   *    Requires `pg` or `mysql2` or `better-sqlite3` installed.
   */
  database?: string | Record<string, unknown>
  /** Drizzle schema to pass to the adapter (for custom table definitions) */
  schema?: Record<string, unknown>
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
 * By default, uses the database layer's Drizzle connection via the
 * Drizzle adapter. This means:
 * - One connection pool shared between database and auth
 * - Database boots first (Effect resolves dependency graph)
 * - No extra configuration needed
 */
export function betterAuth(config: BetterAuthConfig): LayerConfig<'auth'> {
  const {
    secret,
    baseURL,
    database,
    schema,
    plugins = [],
    session = {},
    options = {},
  } = config

  // Resolve database dependency through Effect's type system,
  // not through getLayer() at runtime. This ensures proper boot ordering.
  const usesDatabaseLayer = database === undefined

  const effectLayer = Layer.scoped(
    AuthTag,
    Effect.acquireRelease(
      Effect.gen(function* () {
        // Resolve database config through Effect's dependency system
        let databaseConfig: unknown

        if (usesDatabaseLayer) {
          const DatabaseTag = getLayerTag<{ db: unknown }>('database')
          const dbService = yield* DatabaseTag

          if (!dbService || !dbService.db) {
            return yield* Effect.die(
              new Error(
                '[anvil-layer-auth] Database layer not available. ' +
                'Either configure a database layer or pass a database config to betterAuth().'
              )
            )
          }

          const { drizzleAdapter } = yield* Effect.promise(() => import('better-auth/adapters/drizzle'))
          databaseConfig = drizzleAdapter(dbService.db as any, {
            provider: 'pg',
            ...(schema ? { schema } : {}),
          })
        } else if (typeof database === 'string') {
          databaseConfig = { url: database, type: 'postgres' }
        } else {
          databaseConfig = database
        }

        const { betterAuth: createAuth } = yield* Effect.promise(() => import('better-auth'))

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

        // Helper to normalize a better-auth user object into AuthUser
        function toAuthUser(u: Record<string, unknown>): AuthUser {
          return {
            id: u.id as string,
            email: u.email as string,
            name: (u.name as string) ?? undefined,
            image: (u.image as string) ?? undefined,
            emailVerified: !!(u.emailVerified ?? u.email_verified),
            createdAt: new Date(u.createdAt as string ?? u.created_at as string),
            updatedAt: new Date(u.updatedAt as string ?? u.updated_at as string),
            // Pass through all additional fields (from plugins, additionalFields config)
            ...Object.fromEntries(
              Object.entries(u).filter(([k]) =>
                !['id', 'email', 'name', 'image', 'emailVerified', 'email_verified',
                  'createdAt', 'created_at', 'updatedAt', 'updated_at'].includes(k)
              )
            ),
          }
        }

        const service: AuthLayer = {
          getSession: async (request: Request) => {
            try {
              const result = await auth.api.getSession({ headers: request.headers })
              if (!result?.session || !result?.user) return null
              const s = result.session as Record<string, unknown>
              return {
                // Core session fields
                userId: s.userId as string,
                sessionId: (s.id ?? s.token) as string,
                expiresAt: new Date(s.expiresAt as string),
                user: toAuthUser(result.user as Record<string, unknown>),
                // Pass through all additional session fields (from session.fields config)
                ...Object.fromEntries(
                  Object.entries(s).filter(([k]) =>
                    !['id', 'token', 'userId', 'expiresAt', 'createdAt', 'updatedAt',
                      'ipAddress', 'userAgent'].includes(k)
                  )
                ),
              }
            } catch {
              return null
            }
          },

          updateSession: async (request: Request, fields: Record<string, unknown>) => {
            try {
              const api = auth.api as any
              if (typeof api.updateSession === 'function') {
                await api.updateSession({
                  headers: request.headers,
                  body: fields,
                })
                return true
              }
              // Fallback: use internal adapter
              const ctx = (auth as any).$context
              if (ctx?.internalAdapter?.updateSession) {
                const session = await auth.api.getSession({ headers: request.headers })
                if (!session?.session) return false
                const sessionToken = (session.session as Record<string, unknown>).token ?? (session.session as Record<string, unknown>).id
                await ctx.internalAdapter.updateSession(sessionToken, fields)
                return true
              }
              return false
            } catch {
              return false
            }
          },

          getUser: async (userId: string) => {
            try {
              // Use better-auth's internal adapter — the standard server-side
              // pattern for user lookup by ID. This goes through better-auth's
              // own database adapter layer, not a raw DB query.
              const ctx = (auth as any).$context
              if (ctx?.internalAdapter?.findUserById) {
                const result = await ctx.internalAdapter.findUserById(userId)
                if (!result?.user) return null
                return toAuthUser(result.user as Record<string, unknown>)
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
  ) as Layer.Layer<AuthLayer, never, any>

  return createLayerConfig('auth', effectLayer, {
    healthCheck: Effect.succeed({ status: 'ok' as const, latencyMs: 0 }),
  })
}
