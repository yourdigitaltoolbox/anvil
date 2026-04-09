/**
 * Mock auth layer — for testing without a real auth backend.
 *
 * Provides a configurable mock that validates sessions from a predefined
 * user list and an in-memory session store.
 *
 * @example
 * ```ts
 * import { mockAuth } from '@ydtb/anvil-layer-auth/mock'
 *
 * defineApp({
 *   layers: {
 *     auth: mockAuth({
 *       users: [
 *         { id: 'usr_1', email: 'alice@test.com', name: 'Alice' },
 *         { id: 'usr_2', email: 'bob@test.com', name: 'Bob' },
 *       ],
 *       // Requests with Authorization: Bearer usr_1 are authenticated as Alice
 *     }),
 *   },
 * })
 * ```
 */

import { Context, Effect, Layer } from 'effect'
import type { LayerConfig } from '@ydtb/anvil'
import { createLayerConfig } from '@ydtb/anvil-server'
import type { AuthLayer, AuthSession, AuthUser } from './index.ts'
import { AuthTag } from './index.ts'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface MockUser {
  id: string
  email: string
  name?: string
  image?: string
}

export interface MockAuthConfig {
  /** Predefined users */
  users?: MockUser[]
  /**
   * How to extract the user ID from a request.
   * Default: reads from Authorization: Bearer {userId} header.
   */
  extractUserId?: (request: Request) => string | null
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a mock auth layer for testing.
 *
 * Authenticates requests based on the Authorization header.
 * `Authorization: Bearer usr_1` authenticates as the user with id 'usr_1'.
 */
export function mockAuth(config?: MockAuthConfig): LayerConfig<'auth'> {
  const users = config?.users ?? []
  const userMap = new Map(users.map((u) => [u.id, u]))

  const extractUserId = config?.extractUserId ?? ((request: Request) => {
    const header = request.headers.get('authorization')
    if (!header?.startsWith('Bearer ')) return null
    return header.slice(7)
  })

  const service: AuthLayer = {
    getSession: async (request: Request) => {
      const userId = extractUserId(request)
      if (!userId || !userMap.has(userId)) return null

      return {
        userId,
        sessionId: `session_${userId}`,
        expiresAt: new Date(Date.now() + 86400000), // 24h from now
      }
    },

    getUser: async (userId: string) => {
      const mock = userMap.get(userId)
      if (!mock) return null

      return {
        id: mock.id,
        email: mock.email,
        name: mock.name,
        image: mock.image,
        emailVerified: true,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }
    },

    handler: async (request: Request) => {
      // Mock handler — returns basic responses for auth routes
      const url = new URL(request.url)
      const path = url.pathname

      if (path.endsWith('/session')) {
        const userId = extractUserId(request)
        if (userId && userMap.has(userId)) {
          return Response.json({ session: { userId, token: `session_${userId}` }, user: userMap.get(userId) })
        }
        return Response.json({ session: null }, { status: 401 })
      }

      return Response.json({ error: 'Mock auth: route not implemented' }, { status: 404 })
    },

    instance: null, // No real better-auth instance in mock
  }

  return createLayerConfig(
    'auth',
    AuthTag,
    Layer.succeed(AuthTag, service),
    {
      healthCheck: Effect.succeed({ status: 'ok' as const, latencyMs: 0 }),
    },
  )
}
