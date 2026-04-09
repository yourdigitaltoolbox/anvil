/**
 * Scope tree — configurable hierarchy with per-level tool inclusion.
 *
 * Scopes define the multi-tenant structure of an Anvil application.
 * Each scope type can have children (e.g. system → company → location)
 * and declares which tools are available at that level.
 */

import type { ToolDescriptor } from './define-tool.ts'

export interface ScopeDefinition {
  /** Scope type identifier (e.g. 'system', 'company', 'location') */
  type: string
  /** Human-readable label */
  label: string
  /** URL prefix pattern. Use `$scopeId` for the dynamic segment. */
  urlPrefix: string
  /** Tools available at this scope level */
  includes?: ToolDescriptor[]
  /** Child scope types */
  children?: ScopeDefinition[]
}

/** The root of a scope tree. */
export type ScopeTree = ScopeDefinition

/**
 * Define a scope in the hierarchy.
 *
 * @example
 * ```ts
 * import { scope } from '@ydtb/anvil'
 *
 * scope({
 *   type: 'system', label: 'System', urlPrefix: '/s',
 *   includes: [dashboard],
 *   children: [
 *     scope({
 *       type: 'company', label: 'Company', urlPrefix: '/c/$scopeId',
 *       includes: [dashboard, billing, team],
 *     }),
 *   ],
 * })
 * ```
 */
export function defineScope(definition: ScopeDefinition): ScopeDefinition {
  return definition
}

/** @deprecated Use `defineScope` instead. */
export const scope = defineScope
