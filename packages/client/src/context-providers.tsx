/**
 * Context provider registry — tools and extensions contribute React providers
 * to the component tree.
 *
 * Providers are registered with a priority (lower = outermost in the tree).
 * The framework collects them and nests them automatically.
 *
 * @example
 * ```ts
 * // A tool registers a provider
 * import { defineContextProvider } from '@ydtb/anvil-client'
 *
 * export const contactsProvider = defineContextProvider({
 *   id: 'contacts-cache',
 *   provider: ContactsCacheProvider,
 *   priority: 50,
 * })
 * ```
 *
 * ```tsx
 * // The app shell wraps content in all registered providers
 * import { ContextProviderStack } from '@ydtb/anvil-client'
 *
 * function App() {
 *   return (
 *     <ContextProviderStack providers={allProviders}>
 *       <Router />
 *     </ContextProviderStack>
 *   )
 * }
 * ```
 */

import React, { type ReactNode, type ComponentType } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContextProviderEntry {
  /** Unique identifier */
  id: string
  /**
   * React component that wraps children.
   * Must accept and render `children`.
   */
  provider: ComponentType<{ children: ReactNode }>
  /**
   * Priority — lower numbers are outermost in the tree.
   * Default: 100.
   *
   * Example ordering:
   * - 10: QueryClient, error boundaries
   * - 20: Auth
   * - 30: Theme
   * - 50: Tool-specific providers
   * - 100: Default
   */
  priority?: number
}

// ---------------------------------------------------------------------------
// defineContextProvider
// ---------------------------------------------------------------------------

/**
 * Define a context provider that will be added to the component tree.
 *
 * Tools and extensions use this to contribute React context providers
 * (cache providers, state providers, theme providers, etc.) that wrap
 * the entire app or specific sections.
 *
 * @example
 * ```ts
 * const queryProvider = defineContextProvider({
 *   id: 'query-client',
 *   provider: ({ children }) => (
 *     <QueryClientProvider client={queryClient}>
 *       {children}
 *     </QueryClientProvider>
 *   ),
 *   priority: 10,
 * })
 * ```
 */
export function defineContextProvider(entry: ContextProviderEntry): ContextProviderEntry {
  return { priority: 100, ...entry }
}

// ---------------------------------------------------------------------------
// ContextProviderStack
// ---------------------------------------------------------------------------

export interface ContextProviderStackProps {
  /** Providers to nest — sorted by priority (lower = outermost) */
  providers: ContextProviderEntry[]
  children: ReactNode
}

/**
 * Nest multiple context providers in priority order.
 *
 * Lower priority numbers are outermost (wrap more of the tree).
 * Providers are sorted automatically.
 *
 * @example
 * ```tsx
 * <ContextProviderStack providers={[queryProvider, authProvider, themeProvider]}>
 *   <App />
 * </ContextProviderStack>
 * ```
 */
export function ContextProviderStack({ providers, children }: ContextProviderStackProps) {
  // Sort by priority (lower = outermost = first to wrap)
  const sorted = [...providers].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))

  // Nest providers: outermost first
  return sorted.reduceRight<ReactNode>(
    (inner, { provider: Provider }) => <Provider>{inner}</Provider>,
    children,
  ) as React.JSX.Element
}
