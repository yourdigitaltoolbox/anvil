/**
 * Scope tree — configurable hierarchy with per-level tool inclusion.
 *
 * Scopes define the organizational structure of a toolkit app.
 * Each scope type can have children (e.g. system → company → location)
 * and declares which tools are available at that level.
 *
 * Scopes support rich configuration: icons, default routes, create pages,
 * onboarding metadata, and server-side lifecycle hooks.
 */

import type { ComponentType } from 'react'
import type { ToolDescriptor } from './define-tool.ts'

export interface ScopeDefinition {
  /** Scope type identifier (e.g. 'system', 'company', 'location') */
  type: string
  /** Human-readable label (singular) */
  label: string
  /** Plural label (default: label + 's') */
  labelPlural?: string
  /** URL prefix pattern. Use `$scopeId` for the dynamic segment. */
  urlPrefix: string
  /** Tools available at this scope level */
  includes?: ToolDescriptor[]
  /** Child scope types */
  children?: ScopeDefinition[]

  // --- Rich scope configuration ---

  /** Icon identifier or component for this scope type */
  icon?: string | ComponentType<{ className?: string }>
  /** Default route path when entering this scope (e.g., '/dashboard') */
  defaultRoute?: string
  /**
   * How new scopes of this type are created:
   * - 'initial' — created during app setup (singleton scope)
   * - 'checkout' — created via payment flow
   * - 'invite' — created when accepting an invitation
   * - 'self' — user can create freely
   * - false — cannot be self-created
   */
  selfCreate?: 'initial' | 'checkout' | 'invite' | 'self' | false
  /** Component for the scope creation page */
  createPage?: ComponentType
  /** Onboarding steps specific to this scope type */
  onboarding?: unknown[]

  // --- Server-side lifecycle ---

  /** Server-side hooks for scope lifecycle events */
  server?: {
    /** Called after a new scope entity is created */
    postCreate?: (ctx: { scopeId: string; createdBy: string }) => void | Promise<void>
  }

  // --- Extensible ---

  /** Additional scope-specific configuration via declaration merging */
  [key: string]: unknown
}

/** The root of a scope tree. */
export type ScopeTree = ScopeDefinition

/**
 * Define a scope in the hierarchy.
 *
 * @example
 * ```ts
 * import { defineScope } from '@ydtb/anvil-toolkit/core'
 *
 * defineScope({
 *   type: 'company',
 *   label: 'Company',
 *   urlPrefix: '/c/$scopeId',
 *   defaultRoute: '/dashboard',
 *   selfCreate: 'checkout',
 *   icon: 'Building',
 *   includes: [dashboard, billing, team],
 *   children: [
 *     defineScope({ type: 'location', label: 'Location', urlPrefix: '/l/$scopeId' }),
 *   ],
 * })
 * ```
 */
export function defineScope(definition: ScopeDefinition): ScopeDefinition {
  return definition
}

/** @deprecated Use `defineScope` instead. */
export const scope = defineScope
