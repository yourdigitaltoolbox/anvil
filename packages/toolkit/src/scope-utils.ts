/**
 * Scope hierarchy utilities — static query helpers and chain traversal.
 *
 * Generic mechanics for scope-centric apps. No app policy —
 * just hierarchy structure, type queries, and chain walking.
 *
 * @example
 * ```ts
 * import { getScopeHierarchy, getChildTypes, isLeafScope } from '@ydtb/anvil-toolkit/core'
 *
 * const hierarchy = getScopeHierarchy(scopeTree)
 * const children = getChildTypes(hierarchy, 'company')  // ['location']
 * const isLeaf = isLeafScope(hierarchy, 'location')     // true
 * ```
 */

import type { ScopeDefinition } from './scope.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Flattened scope type info derived from the scope tree */
export interface ScopeTypeInfo {
  type: string
  label: string
  labelPlural?: string
  urlPrefix: string
  parentType: string | null
  childTypes: string[]
  depth: number
  icon?: unknown
  defaultRoute?: string
  selfCreate?: string | false
}

/** Flattened hierarchy — all scope types with parent/child relationships */
export type ScopeHierarchy = Map<string, ScopeTypeInfo>

/** A single entry in a scope chain (runtime, from DB) */
export interface ScopeChainEntry {
  scopeType: string
  scopeId: string
}

/** A full scope chain from root to current scope */
export type ScopeChain = ScopeChainEntry[]

// ---------------------------------------------------------------------------
// Hierarchy builder
// ---------------------------------------------------------------------------

/**
 * Build a flattened scope hierarchy from the scope tree.
 *
 * Walks the tree and produces a Map of type → ScopeTypeInfo,
 * with parent/child relationships resolved.
 */
export function getScopeHierarchy(scopeTree: ScopeDefinition): ScopeHierarchy {
  const hierarchy: ScopeHierarchy = new Map()

  function walk(node: ScopeDefinition, parentType: string | null, depth: number): void {
    const childTypes = (node.children ?? []).map(c => c.type)

    hierarchy.set(node.type, {
      type: node.type,
      label: node.label,
      labelPlural: (node as Record<string, unknown>).labelPlural as string | undefined,
      urlPrefix: node.urlPrefix,
      parentType,
      childTypes,
      depth,
      icon: (node as Record<string, unknown>).icon,
      defaultRoute: (node as Record<string, unknown>).defaultRoute as string | undefined,
      selfCreate: (node as Record<string, unknown>).selfCreate as string | false | undefined,
    })

    for (const child of node.children ?? []) {
      walk(child, node.type, depth + 1)
    }
  }

  walk(scopeTree, null, 0)
  return hierarchy
}

// ---------------------------------------------------------------------------
// Static hierarchy queries
// ---------------------------------------------------------------------------

/** Get child scope types for a given parent type */
export function getChildTypes(hierarchy: ScopeHierarchy, parentType: string): string[] {
  return hierarchy.get(parentType)?.childTypes ?? []
}

/** Get the parent scope type (null if root) */
export function getParentType(hierarchy: ScopeHierarchy, childType: string): string | null {
  return hierarchy.get(childType)?.parentType ?? null
}

/** Check if a scope type is the root (has no parent) */
export function isRootScope(hierarchy: ScopeHierarchy, type: string): boolean {
  return hierarchy.get(type)?.parentType === null
}

/** Check if a scope type is a leaf (has no children) */
export function isLeafScope(hierarchy: ScopeHierarchy, type: string): boolean {
  const info = hierarchy.get(type)
  return info ? info.childTypes.length === 0 : false
}

/** Get the root scope type */
export function getRootScopeType(hierarchy: ScopeHierarchy): string | null {
  for (const [type, info] of hierarchy) {
    if (info.parentType === null) return type
  }
  return null
}

/** Get all scope types in order from root to leaves */
export function getAllScopeTypes(hierarchy: ScopeHierarchy): string[] {
  return [...hierarchy.values()]
    .sort((a, b) => a.depth - b.depth)
    .map(info => info.type)
}

/** Get all ancestor types for a scope type (from immediate parent to root) */
export function getAncestorTypes(hierarchy: ScopeHierarchy, type: string): string[] {
  const ancestors: string[] = []
  let current = hierarchy.get(type)?.parentType ?? null
  while (current) {
    ancestors.push(current)
    current = hierarchy.get(current)?.parentType ?? null
  }
  return ancestors
}

/** Get all descendant types for a scope type (breadth-first) */
export function getDescendantTypes(hierarchy: ScopeHierarchy, type: string): string[] {
  const descendants: string[] = []
  const queue = [...(hierarchy.get(type)?.childTypes ?? [])]
  while (queue.length > 0) {
    const current = queue.shift()!
    descendants.push(current)
    queue.push(...(hierarchy.get(current)?.childTypes ?? []))
  }
  return descendants
}

/** Check if childType is an allowed child of parentType (direct or nested) */
export function isDescendantType(hierarchy: ScopeHierarchy, parentType: string, childType: string): boolean {
  return getDescendantTypes(hierarchy, parentType).includes(childType)
}

/** Get the primary (first) child type for a parent */
export function getPrimaryChildType(hierarchy: ScopeHierarchy, parentType: string): string | null {
  const children = hierarchy.get(parentType)?.childTypes ?? []
  return children[0] ?? null
}

/** Get scope type info */
export function getScopeTypeInfo(hierarchy: ScopeHierarchy, type: string): ScopeTypeInfo | undefined {
  return hierarchy.get(type)
}

// ---------------------------------------------------------------------------
// Scope chain helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a value by walking a scope chain from lowest (most specific)
 * to highest (root). Returns the first non-undefined value found.
 *
 * @param chain - Scope chain from root to current (root first)
 * @param resolver - Function that returns a value for a scope entry, or undefined to skip
 */
export function resolveLowestFirst<T>(
  chain: ScopeChain,
  resolver: (entry: ScopeChainEntry) => T | undefined,
): T | undefined {
  // Walk from bottom (most specific) to top (root)
  for (let i = chain.length - 1; i >= 0; i--) {
    const value = resolver(chain[i])
    if (value !== undefined) return value
  }
  return undefined
}

/**
 * Resolve a value by walking a scope chain from highest (root)
 * to lowest (most specific). Returns the first non-undefined value found.
 */
export function resolveHighestFirst<T>(
  chain: ScopeChain,
  resolver: (entry: ScopeChainEntry) => T | undefined,
): T | undefined {
  for (const entry of chain) {
    const value = resolver(entry)
    if (value !== undefined) return value
  }
  return undefined
}

/**
 * Collect values across the entire scope chain.
 * Returns an array of non-undefined values from root to leaf.
 */
export function collectAcrossChain<T>(
  chain: ScopeChain,
  resolver: (entry: ScopeChainEntry) => T | undefined,
): T[] {
  const results: T[] = []
  for (const entry of chain) {
    const value = resolver(entry)
    if (value !== undefined) results.push(value)
  }
  return results
}

/**
 * Resolve with lock-awareness: walk from lowest to highest,
 * but stop if a "locked" entry is found.
 *
 * @param chain - Scope chain from root to current
 * @param resolver - Returns { value, locked } or undefined
 */
export function resolveWithLock<T>(
  chain: ScopeChain,
  resolver: (entry: ScopeChainEntry) => { value: T; locked?: boolean } | undefined,
): T | undefined {
  // Walk from bottom to top
  for (let i = chain.length - 1; i >= 0; i--) {
    const result = resolver(chain[i])
    if (result !== undefined) {
      if (result.locked) return result.value // locked — stop here
      return result.value
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Server-side chain builder
// ---------------------------------------------------------------------------

/**
 * Contract for fetching a scope entity's parent info.
 * The app provides this — the toolkit doesn't know the DB schema.
 */
export interface ScopeEntityResolver {
  /** Given a scope ID, return its type and parent scope ID (or null if root) */
  resolve: (scopeId: string) => Promise<{ scopeType: string; parentScopeId: string | null } | null>
}

/**
 * Build a scope chain by walking parent links from a scope entity.
 *
 * The app provides a `ScopeEntityResolver` that knows how to fetch
 * scope entities from the database. The toolkit walks the chain.
 *
 * @param scopeId - Starting scope ID
 * @param resolver - App-provided function to fetch scope entities
 * @param maxDepth - Safety limit (default: 10)
 * @returns Scope chain from root to the given scope
 */
export async function buildScopeChain(
  scopeId: string,
  resolver: ScopeEntityResolver,
  maxDepth = 10,
): Promise<ScopeChain> {
  const chain: ScopeChainEntry[] = []
  let currentId: string | null = scopeId
  let depth = 0

  while (currentId && depth < maxDepth) {
    const entity = await resolver.resolve(currentId)
    if (!entity) break

    chain.unshift({ scopeType: entity.scopeType, scopeId: currentId })
    currentId = entity.parentScopeId
    depth++
  }

  return chain
}
