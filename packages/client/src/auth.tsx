/**
 * Auth client helpers — hooks and components for authentication.
 *
 * Works with the auth layer's /api/auth/* routes.
 *
 * @example
 * ```tsx
 * import { useAuth, AuthGate } from '@ydtb/anvil-client'
 *
 * function App() {
 *   return (
 *     <AuthGate loginPath="/login">
 *       <Dashboard />
 *     </AuthGate>
 *   )
 * }
 *
 * function UserMenu() {
 *   const { user, signOut } = useAuth()
 *   return <button onClick={signOut}>{user?.name}</button>
 * }
 * ```
 */

import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string
  email: string
  name?: string
  image?: string
}

export interface AuthContextValue {
  /** Current user — null if not authenticated, undefined if loading */
  user: AuthUser | null | undefined
  /** Whether the auth state is still loading */
  loading: boolean
  /** Whether the user is authenticated */
  isAuthenticated: boolean
  /** Sign out and clear session */
  signOut: () => Promise<void>
  /** Refresh the session — re-check auth state */
  refresh: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue>({
  user: undefined,
  loading: true,
  isAuthenticated: false,
  signOut: async () => {},
  refresh: async () => {},
})

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface AuthProviderProps {
  /** Base URL for auth API (default: window.location.origin) */
  apiUrl?: string
  children: ReactNode
}

/**
 * Auth provider — fetches session on mount and provides auth state.
 *
 * Wrap your app in this to enable useAuth() in child components.
 * Works with better-auth's /api/auth/get-session endpoint.
 */
export function AuthProvider({ apiUrl, children }: AuthProviderProps) {
  const baseUrl = apiUrl ?? (typeof window !== 'undefined' ? window.location.origin : '')
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  async function fetchSession() {
    try {
      const res = await fetch(`${baseUrl}/api/auth/get-session`, {
        credentials: 'include',
      })

      if (res.ok) {
        const data = await res.json()
        if (data.user) {
          setUser({
            id: data.user.id,
            email: data.user.email,
            name: data.user.name ?? undefined,
            image: data.user.image ?? undefined,
          })
        } else {
          setUser(null)
        }
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  async function signOut() {
    try {
      await fetch(`${baseUrl}/api/auth/sign-out`, {
        method: 'POST',
        credentials: 'include',
      })
    } catch {
      // Ignore errors
    }
    setUser(null)
  }

  useEffect(() => {
    fetchSession()
  }, [])

  const value: AuthContextValue = {
    user,
    loading,
    isAuthenticated: user !== null && user !== undefined,
    signOut,
    refresh: fetchSession,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Access auth state — current user, loading state, sign out.
 *
 * Must be inside an AuthProvider.
 */
export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}

// ---------------------------------------------------------------------------
// Auth Gate
// ---------------------------------------------------------------------------

export interface AuthGateProps {
  /** Where to redirect when not authenticated (default: '/login') */
  loginPath?: string
  /** What to show while checking auth (default: null) */
  fallback?: ReactNode
  children: ReactNode
}

/**
 * Renders children only if authenticated.
 * Redirects to loginPath if not.
 */
export function AuthGate({ loginPath = '/login', fallback = null, children }: AuthGateProps) {
  const { user, loading } = useAuth()

  if (loading) return <>{fallback}</>

  if (!user) {
    if (typeof window !== 'undefined' && window.location.pathname !== loginPath) {
      window.location.href = loginPath
    }
    return null
  }

  return <>{children}</>
}
