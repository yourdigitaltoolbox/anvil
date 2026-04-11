/**
 * Client-side scope utilities for tool packages.
 *
 * These are React hooks and pure functions that tools import to work
 * with the scope system — building scoped URLs, getting labels, reading
 * the current scope. They operate on the ScopeHierarchy built from the
 * scope tree at app boot.
 *
 * @example
 * ```tsx
 * import { useScopeLink, useScopeLabel } from '@ydtb/anvil-toolkit/client'
 *
 * function MyToolPage() {
 *   const sl = useScopeLink()
 *   const label = useScopeLabel('company')
 *   return <Link to={sl('/settings')}>Settings for {label.singular}</Link>
 * }
 * ```
 */

import { useMemo } from 'react'
import { useScope, getCurrentScope } from '@ydtb/anvil-client'
import type { ScopeHierarchy, ScopeTypeInfo } from './scope-utils.ts'
import {
  getScopeHierarchy,
  getScopeTypeInfo,
  getPrimaryChildType,
} from './scope-utils.ts'
import type { ScopeDefinition } from './scope.ts'

// ---------------------------------------------------------------------------
// Module-level state — set by initScopeClient() at boot
// ---------------------------------------------------------------------------

let _hierarchy: ScopeHierarchy | null = null
let _urlPrefixes: Record<string, string> = {}

/**
 * Initialize the scope client utilities. Call once at app boot with the
 * scope tree from compose.config. This populates the module-level hierarchy
 * used by all scope hooks and functions.
 *
 * @example
 * ```ts
 * import { initScopeClient } from '@ydtb/anvil-toolkit/client'
 * import { scopeTree } from '../scope-tree.ts'
 *
 * initScopeClient(scopeTree)
 * ```
 */
export function initScopeClient(scopeTree: ScopeDefinition): void {
  _hierarchy = getScopeHierarchy(scopeTree)
  _urlPrefixes = {}
  for (const [type, info] of _hierarchy) {
    _urlPrefixes[type] = info.urlPrefix
  }
}

/**
 * Get the initialized hierarchy. Throws if initScopeClient hasn't been called.
 */
function getHierarchy(): ScopeHierarchy {
  if (!_hierarchy) {
    throw new Error(
      '[anvil-toolkit] Scope client not initialized. Call initScopeClient(scopeTree) at app boot.'
    )
  }
  return _hierarchy
}

// ---------------------------------------------------------------------------
// Pure functions (no React dependency)
// ---------------------------------------------------------------------------

/**
 * Get URL prefixes for all scope types.
 * Returns a map of scopeType → urlPrefix (e.g., `{ system: '/s', company: '/c/$scopeId' }`)
 */
export function getUrlPrefixes(): Record<string, string> {
  getHierarchy() // ensure initialized
  return _urlPrefixes
}

/**
 * Build a scoped URL path from a relative tool path.
 *
 * @example
 * ```ts
 * scopeLink('/offers', { scope: 'location', scopeId: 'loc_abc' })
 * // → '/r/loc_abc/offers'
 *
 * scopeLink('/dashboard', { scope: 'system' })
 * // → '/s/dashboard'
 * ```
 */
export function scopeLink(
  path: string,
  opts: { scope: string; scopeId?: string },
): string {
  const prefixes = getUrlPrefixes()
  const pattern = prefixes[opts.scope]
  if (!pattern) return path

  if (pattern.includes('$scopeId')) {
    if (!opts.scopeId) return path
    return pattern.replace('$scopeId', opts.scopeId) + path
  }

  return pattern + path
}

/**
 * Detect the current scope type and ID from a URL pathname.
 * Returns null if the path doesn't match any scope URL prefix.
 *
 * @example
 * ```ts
 * detectScopeFromPath('/c/co_123/dashboard')
 * // → { scope: 'company', scopeId: 'co_123' }
 *
 * detectScopeFromPath('/login')
 * // → null
 * ```
 */
export function detectScopeFromPath(
  path: string,
): { scope: string; scopeId?: string } | null {
  const prefixes = getUrlPrefixes()

  for (const [scope, pattern] of Object.entries(prefixes)) {
    if (pattern.includes('$scopeId')) {
      const staticPrefix = pattern.split('$scopeId')[0]
      if (path.startsWith(staticPrefix)) {
        const rest = path.slice(staticPrefix.length)
        const scopeId = rest.split('/')[0]
        return { scope, scopeId }
      }
    } else {
      if (path.startsWith(pattern + '/') || path === pattern) {
        return { scope }
      }
    }
  }

  return null
}

/**
 * Check if a scope type has a $scopeId segment in its URL prefix.
 * Singleton scopes (e.g., system) don't; entity scopes (e.g., company, location) do.
 */
export function scopeHasUrlScopeId(scopeType: string): boolean {
  const h = getHierarchy()
  const info = getScopeTypeInfo(h, scopeType)
  return info?.urlPrefix.includes('$scopeId') ?? false
}

/**
 * Check if a scope type is a singleton (no $scopeId in URL).
 */
export function isSingletonScope(scopeType: string): boolean {
  return !scopeHasUrlScopeId(scopeType)
}

// ---------------------------------------------------------------------------
// React hooks
// ---------------------------------------------------------------------------

/**
 * Returns a scoped link builder bound to the current scope context.
 *
 * The returned function builds full scope-prefixed paths from relative tool paths.
 * Automatically uses the current scope from React context. Override with opts for
 * cross-scope navigation.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const sl = useScopeLink()
 *   return (
 *     <>
 *       <Link to={sl('/offers')}>Offers</Link>
 *       <Link to={sl('/team', { scope: 'company', scopeId: parentId })}>Parent Team</Link>
 *     </>
 *   )
 * }
 * ```
 */
export function useScopeLink(): (
  path: string,
  opts?: { scope?: string; scopeId?: string },
) => string {
  const { scopeId: contextScopeId, scopeType: contextScopeType } = useScope()

  return (path: string, opts?: { scope?: string; scopeId?: string }) => {
    // Explicit scope override
    if (opts?.scope) {
      return scopeLink(path, { scope: opts.scope, scopeId: opts.scopeId })
    }

    // Auto-detect from current scope context
    if (contextScopeType) {
      return scopeLink(path, {
        scope: contextScopeType,
        scopeId: opts?.scopeId ?? contextScopeId ?? undefined,
      })
    }

    // Fallback — try URL detection
    const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/'
    const detected = detectScopeFromPath(currentPath)
    if (detected) {
      return scopeLink(path, {
        scope: detected.scope,
        scopeId: opts?.scopeId ?? detected.scopeId,
      })
    }

    return path
  }
}

/**
 * Returns the human-readable label for a scope type.
 *
 * @example
 * ```tsx
 * const label = useScopeLabel('company')
 * // → { singular: 'Company', plural: 'Companies' }
 * ```
 */
export function useScopeLabel(scopeType: string): { singular: string; plural: string } {
  return useMemo(() => {
    const h = getHierarchy()
    const info = getScopeTypeInfo(h, scopeType)
    if (!info) {
      const cap = scopeType.charAt(0).toUpperCase() + scopeType.slice(1)
      return { singular: cap, plural: cap + 's' }
    }
    return {
      singular: info.label,
      plural: info.labelPlural ?? info.label + 's',
    }
  }, [scopeType])
}

/**
 * Returns the label for the primary child scope type, or null if leaf.
 *
 * @example
 * ```tsx
 * const childLabel = useChildScopeLabel('company')
 * // → { singular: 'Location', plural: 'Locations' } or null
 * ```
 */
export function useChildScopeLabel(
  scopeType: string,
): { singular: string; plural: string } | null {
  return useMemo(() => {
    const h = getHierarchy()
    const childType = getPrimaryChildType(h, scopeType)
    if (!childType) return null
    const info = getScopeTypeInfo(h, childType)
    if (!info) return null
    return {
      singular: info.label,
      plural: info.labelPlural ?? info.label + 's',
    }
  }, [scopeType])
}
