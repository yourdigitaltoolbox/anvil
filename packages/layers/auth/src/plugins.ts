/**
 * Auth plugin helpers — wraps better-auth plugins for use with the auth layer.
 *
 * @example
 * ```ts
 * import { betterAuth } from '@ydtb/anvil-layer-auth'
 * import { apiKeys, twoFactor, oAuth } from '@ydtb/anvil-layer-auth/plugins'
 *
 * betterAuth({
 *   secret: env.AUTH_SECRET,
 *   database: env.DATABASE_URL,
 *   plugins: [
 *     apiKeys(),
 *     twoFactor({ issuer: 'My App' }),
 *     oAuth({
 *       google: {
 *         clientId: env.GOOGLE_CLIENT_ID,
 *         clientSecret: env.GOOGLE_CLIENT_SECRET,
 *       },
 *     }),
 *   ],
 * })
 * ```
 */

import type { AuthPlugin } from './index.ts'

/**
 * Wrap a raw better-auth plugin for use with the Anvil auth layer.
 *
 * Use this when you have a custom better-auth plugin (e.g., YDTB's scope
 * plugin) and want to pass it to betterAuth({ plugins: [...] }).
 *
 * @example
 * ```ts
 * import { wrapPlugin } from '@ydtb/anvil-layer-auth/plugins'
 * import { myScopePlugin } from './my-scope-plugin'
 *
 * betterAuth({
 *   plugins: [wrapPlugin('scope', myScopePlugin)],
 * })
 * ```
 */
export function wrapPlugin(id: string, plugin: unknown): AuthPlugin {
  return { id, plugin }
}

/**
 * API Key authentication plugin.
 * Allows machine-to-machine auth via API keys.
 */
export function apiKeys(config?: {
  /** Prefix for generated API keys (default: 'ak_') */
  prefix?: string
}): AuthPlugin {
  return {
    id: 'api-keys',
    plugin: {
      id: 'api-keys',
      ...config,
    },
  }
}

/**
 * Two-factor authentication plugin.
 * Adds TOTP-based 2FA to the auth flow.
 */
export function twoFactor(config?: {
  /** Issuer name shown in authenticator apps */
  issuer?: string
}): AuthPlugin {
  return {
    id: 'two-factor',
    plugin: {
      id: 'two-factor',
      ...config,
    },
  }
}

/**
 * OAuth provider configuration.
 * Adds social login (Google, GitHub, etc.) to the auth flow.
 */
export function oAuth(providers: Record<string, {
  clientId: string
  clientSecret: string
  scopes?: string[]
}>): AuthPlugin {
  return {
    id: 'oauth',
    plugin: {
      id: 'oauth',
      providers,
    },
  }
}

/**
 * Organization/team plugin.
 * Adds multi-tenancy support with organization membership.
 */
export function organization(config?: {
  /** Allow users to create organizations (default: true) */
  allowCreate?: boolean
  /** Max organizations per user (default: unlimited) */
  maxPerUser?: number
}): AuthPlugin {
  return {
    id: 'organization',
    plugin: {
      id: 'organization',
      ...config,
    },
  }
}

/**
 * Email verification plugin.
 * Requires users to verify their email before accessing the app.
 */
export function emailVerification(config?: {
  /** Send verification email on signup (default: true) */
  sendOnSignUp?: boolean
  /** Verification email expiry in seconds (default: 24 hours) */
  expiresIn?: number
}): AuthPlugin {
  return {
    id: 'email-verification',
    plugin: {
      id: 'email-verification',
      ...config,
    },
  }
}
