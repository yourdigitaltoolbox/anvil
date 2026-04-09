/**
 * Scope context — provides the current scope (id, type) to the component tree.
 *
 * The ScopeProvider reads scope from URL parameters and makes it available
 * via useScope(). The API client factory uses this to inject scope headers
 * on every request.
 *
 * @example
 * ```tsx
 * // In your app root (inside the router)
 * <ScopeProvider scopeId={params.scopeId} scopeType={detectedType}>
 *   <Outlet />
 * </ScopeProvider>
 *
 * // In any component
 * const { scopeId, scopeType } = useScope()
 * ```
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScopeContextValue {
  /** Current scope ID (e.g., 'co_abc123') — null if no scope active */
  scopeId: string | null
  /** Current scope type (e.g., 'company') — null if no scope active */
  scopeType: string | null
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ScopeContext = createContext<ScopeContextValue>({
  scopeId: null,
  scopeType: null,
})

// ---------------------------------------------------------------------------
// Module-level ref for API client headers (non-React access)
// ---------------------------------------------------------------------------

let _currentScope: ScopeContextValue = { scopeId: null, scopeType: null }

/**
 * Get the current scope outside of React (for API client headers).
 * Updated by ScopeProvider via useEffect.
 */
export function getCurrentScope(): ScopeContextValue {
  return _currentScope
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface ScopeProviderProps {
  scopeId: string | null
  scopeType: string | null
  children: ReactNode
}

/**
 * Provide scope context to the component tree.
 *
 * Typically placed inside the router, where scopeId comes from URL params
 * and scopeType is detected from the URL path pattern.
 */
export function ScopeProvider({ scopeId, scopeType, children }: ScopeProviderProps) {
  const value = useMemo(
    () => ({ scopeId, scopeType }),
    [scopeId, scopeType],
  )

  // Keep module-level ref in sync for non-React API client usage
  _currentScope = value

  return (
    <ScopeContext.Provider value={value}>
      {children}
    </ScopeContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Access the current scope.
 *
 * @example
 * ```ts
 * const { scopeId, scopeType } = useScope()
 * if (scopeId) {
 *   // Inside a scope — show scope-specific UI
 * }
 * ```
 */
export function useScope(): ScopeContextValue {
  return useContext(ScopeContext)
}
