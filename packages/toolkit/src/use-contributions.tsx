/**
 * useContributions — React hook for accessing client extension contributions.
 *
 * Provides typed access to collected tool contributions for a specific
 * extension, without prop threading.
 *
 * @example
 * ```tsx
 * import { useContributions } from '@ydtb/anvil-toolkit/client'
 *
 * function DashboardGrid() {
 *   const cards = useContributions<{ cards: DashboardCard[] }>('dashboard')
 *   return cards.flatMap(c => c.cards).map(card => <Card key={card.id} {...card} />)
 * }
 * ```
 */

import { createContext, useContext, type ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type ContributionStore = Record<string, Array<Record<string, unknown> & { toolId: string }>>

const ContributionContext = createContext<ContributionStore>({})

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface ContributionProviderProps {
  contributions: ContributionStore
  children: ReactNode
}

/**
 * Provides collected client contributions to the component tree.
 *
 * Typically placed near the app root after `createAnvilApp()` returns
 * the `contributions` object.
 *
 * @example
 * ```tsx
 * const { App, contributions } = createAnvilApp({ ... })
 *
 * function Root() {
 *   return (
 *     <ContributionProvider contributions={contributions}>
 *       <App />
 *     </ContributionProvider>
 *   )
 * }
 * ```
 */
export function ContributionProvider({ contributions, children }: ContributionProviderProps) {
  return (
    <ContributionContext.Provider value={contributions}>
      {children}
    </ContributionContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Access collected contributions for an extension.
 *
 * Must be inside a `ContributionProvider`. Returns an array of contribution
 * objects from all tools that contributed to this extension.
 *
 * @param extensionId - The extension's id (e.g., 'dashboard', 'search')
 * @returns Array of contribution objects, each with a `toolId` field
 *
 * @example
 * ```tsx
 * const searchProviders = useContributions<{ provider: SearchFn }>('search')
 * // → [{ toolId: 'contacts', provider: ... }, { toolId: 'billing', provider: ... }]
 * ```
 */
export function useContributions<T = Record<string, unknown>>(
  extensionId: string,
): Array<T & { toolId: string }> {
  const store = useContext(ContributionContext)
  return (store[extensionId] ?? []) as Array<T & { toolId: string }>
}
