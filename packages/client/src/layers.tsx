/**
 * Client layers — swappable client-side services via React context.
 *
 * The client-side equivalent of server layers. Provides useLayer() for
 * accessing client services (analytics, feature flags, etc.) and
 * LayerProvider for providing/mocking them.
 *
 * @example
 * ```ts
 * // In a React component
 * import { useLayer } from '@ydtb/anvil-client'
 *
 * function MyComponent() {
 *   const analytics = useLayer('analytics')
 *   analytics.track('page_view', { page: 'contacts' })
 * }
 * ```
 *
 * ```tsx
 * // In Storybook or tests
 * import { LayerProvider } from '@ydtb/anvil-client'
 *
 * <LayerProvider layers={{ analytics: noopAnalytics() }}>
 *   <MyComponent />
 * </LayerProvider>
 * ```
 */

import { createContext, useContext, type ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Client Layer Map — augmented by client layer packages
// ---------------------------------------------------------------------------

/**
 * Map of client-side layer contracts. Empty by default — augmented
 * via declaration merging by client layer packages.
 *
 * @example
 * ```ts
 * // In @myapp/client-layer-analytics
 * declare module '@ydtb/anvil-client' {
 *   interface ClientLayerMap {
 *     analytics: { track: (event: string, props?: Record<string, unknown>) => void }
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ClientLayerMap {}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ClientLayerContext = createContext<Partial<ClientLayerMap> | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface LayerProviderProps {
  /** Client layer implementations to provide */
  layers: Partial<ClientLayerMap>
  children: ReactNode
}

/**
 * Provide client layers to the component tree.
 *
 * Typically used at the app root to provide real implementations,
 * and in tests/Storybook to provide mocks.
 *
 * @example
 * ```tsx
 * // App root
 * <LayerProvider layers={{
 *   analytics: posthog({ apiKey: '...' }),
 *   featureFlags: growthbook({ apiHost: '...' }),
 * }}>
 *   <App />
 * </LayerProvider>
 *
 * // Tests
 * <LayerProvider layers={{
 *   analytics: { track: vi.fn() },
 * }}>
 *   <ComponentUnderTest />
 * </LayerProvider>
 * ```
 */
export function LayerProvider({ layers, children }: LayerProviderProps) {
  return (
    <ClientLayerContext.Provider value={layers}>
      {children}
    </ClientLayerContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Access a client layer by key.
 *
 * Must be called inside a LayerProvider. Throws if the layer
 * is not provided.
 *
 * @example
 * ```ts
 * const analytics = useLayer('analytics')
 * analytics.track('button_click', { buttonId: 'submit' })
 * ```
 */
export function useLayer<K extends keyof ClientLayerMap>(key: K): ClientLayerMap[K] {
  const layers = useContext(ClientLayerContext)

  if (!layers) {
    throw new Error(
      `[anvil-client] useLayer('${String(key)}') called outside a LayerProvider. ` +
      `Wrap your app in <LayerProvider layers={{...}}>.</>`
    )
  }

  const layer = layers[key]
  if (layer === undefined) {
    throw new Error(
      `[anvil-client] Client layer '${String(key)}' not provided. ` +
      `Add it to your <LayerProvider layers={{ ${String(key)}: ... }}>.`
    )
  }

  return layer as ClientLayerMap[K]
}
