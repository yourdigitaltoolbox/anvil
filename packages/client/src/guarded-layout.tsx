/**
 * GuardedLayout — React component that runs a guard pipeline
 * before rendering a route layout's children.
 *
 * Used internally by the app routing system. Not typically imported
 * directly by tool authors.
 */

import React, { useEffect, useState, type ReactNode, type ComponentType } from 'react'
import { runGuardPipeline, type Guard, type GuardContext } from './guards.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GuardedLayoutProps {
  /** Guard pipeline to run */
  guards: Guard[]
  /** The layout component to wrap children with */
  layout: ComponentType<{ children?: ReactNode }>
  /** URL path */
  path: string
  /** URL parameters */
  params: Record<string, string>
  /** Children to render (route content) */
  children: ReactNode
  /** Component to show while guards are running (default: null) */
  loadingFallback?: ReactNode
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Runs a guard pipeline, then renders the layout + children if all pass.
 * Redirects or renders fallback if any guard doesn't pass.
 */
export function GuardedLayout({
  guards,
  layout: Layout,
  path,
  params,
  children,
  loadingFallback = null,
}: GuardedLayoutProps) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'passed'; data: Record<string, unknown> }
    | { status: 'redirect'; to: string }
    | { status: 'render'; component: ComponentType }
  >({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    runGuardPipeline(guards, { path, params }).then((result) => {
      if (cancelled) return

      if ('passed' in result) {
        setState({ status: 'passed', data: result.data })
      } else if ('redirect' in result) {
        setState({ status: 'redirect', to: result.redirect })
      } else if ('render' in result) {
        setState({ status: 'render', component: result.render })
      }
    })

    return () => { cancelled = true }
  }, [path, JSON.stringify(params)])

  switch (state.status) {
    case 'loading':
      return <>{loadingFallback}</>

    case 'redirect':
      // Redirect — use window.location for framework-agnostic behavior
      if (typeof window !== 'undefined') {
        window.location.href = state.to
      }
      return null

    case 'render': {
      const Fallback = state.component
      return <Fallback />
    }

    case 'passed':
      return (
        <Layout>
          {children}
        </Layout>
      )
  }
}
