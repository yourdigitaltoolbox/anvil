/**
 * Guard system — composable pipeline of route access checks.
 *
 * Guards are steps that run before a route renders. Each guard can:
 * - Pass (optionally adding context for downstream guards)
 * - Redirect to another path
 * - Render a fallback component instead of the route
 *
 * @example
 * ```ts
 * import { defineGuard } from '@ydtb/anvil-client'
 *
 * const requireAuth = defineGuard({
 *   id: 'auth',
 *   check: async (ctx) => {
 *     const session = await getSession()
 *     if (!session) return { redirect: '/login' }
 *     return { pass: true, context: { userId: session.userId } }
 *   },
 * })
 * ```
 */

import type { ComponentType } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Context passed to each guard in the pipeline.
 * Accumulates data from previous guards.
 */
export interface GuardContext {
  /** URL path being accessed */
  path: string
  /** URL parameters (e.g., { scopeId: 'co_123' }) */
  params: Record<string, string>
  /** Accumulated context from previous guards in the pipeline */
  data: Record<string, unknown>
}

/**
 * Result of a guard check.
 */
export type GuardResult =
  | { pass: true; context?: Record<string, unknown> }
  | { redirect: string }
  | { render: ComponentType }

/**
 * A guard step in the pipeline.
 */
export interface Guard {
  /** Unique identifier for this guard */
  id: string
  /**
   * Check function — determines if the route should render.
   * Receives accumulated context from previous guards.
   * Returns pass (with optional context), redirect, or render.
   */
  check: (ctx: GuardContext) => GuardResult | Promise<GuardResult>
}

// ---------------------------------------------------------------------------
// defineGuard
// ---------------------------------------------------------------------------

/**
 * Define a route guard.
 *
 * Guards are composable steps in a route layout's access pipeline.
 * Each guard checks one concern (auth, scope, permissions, etc.)
 * and either passes, redirects, or renders a fallback.
 *
 * @example
 * ```ts
 * const requireAuth = defineGuard({
 *   id: 'auth',
 *   check: async (ctx) => {
 *     const session = await getSession()
 *     if (!session) return { redirect: '/login' }
 *     return { pass: true, context: { userId: session.userId } }
 *   },
 * })
 *
 * const requireScope = defineGuard({
 *   id: 'scope',
 *   check: async (ctx) => {
 *     const scopeId = ctx.params.scopeId
 *     if (!scopeId) return { redirect: '/select-context' }
 *     const valid = await checkMembership(scopeId, ctx.data.userId)
 *     if (!valid) return { redirect: '/no-access' }
 *     return { pass: true, context: { scopeId } }
 *   },
 * })
 * ```
 */
export function defineGuard(guard: Guard): Guard {
  return guard
}

// ---------------------------------------------------------------------------
// Guard pipeline execution
// ---------------------------------------------------------------------------

/**
 * Run a pipeline of guards sequentially.
 * Each guard receives the accumulated context from previous guards.
 * Stops at the first guard that doesn't pass.
 *
 * @returns The final result — either all passed (with accumulated context) or the first non-pass result
 */
export async function runGuardPipeline(
  guards: Guard[],
  initialContext: Omit<GuardContext, 'data'>,
): Promise<{ passed: true; data: Record<string, unknown> } | { redirect: string } | { render: ComponentType }> {
  const data: Record<string, unknown> = {}

  for (const guard of guards) {
    const result = await guard.check({
      path: initialContext.path,
      params: initialContext.params,
      data,
    })

    if ('pass' in result && result.pass) {
      // Merge context from this guard into accumulated data
      if (result.context) {
        Object.assign(data, result.context)
      }
      continue
    }

    // Guard didn't pass — return the redirect or render result
    if ('redirect' in result) return { redirect: result.redirect }
    if ('render' in result) return { render: result.render }
  }

  return { passed: true, data }
}
