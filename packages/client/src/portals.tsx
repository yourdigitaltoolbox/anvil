/**
 * Layout portal system — generic named slots for content injection.
 *
 * The framework provides the mechanism: named portal slots that any
 * component can render into. The app or toolkit defines which specific
 * slots exist (header, sidebar, footer, toolbar — whatever the layout needs).
 *
 * **Framework level (this file):**
 * - `PortalProvider` — manages a registry of named slots
 * - `PortalSlot` — the target element in the shell layout
 * - `Portal` — renders children into a named slot
 * - `usePortal` — read slot state (hasContent, metadata)
 *
 * **Toolkit/app level (builds on this):**
 * - `HeaderPortal` = `<Portal name="header">` with content tracking
 * - `SidebarPortal` = `<Portal name="sidebar">` with content tracking
 * - Any other named slots the app defines
 *
 * @example
 * ```tsx
 * // App shell layout — defines where slots render:
 * import { PortalProvider, PortalSlot, usePortal } from '@ydtb/anvil-client'
 *
 * function AppLayout({ children }) {
 *   const header = usePortal('header')
 *   return (
 *     <PortalProvider>
 *       <header>
 *         <PortalSlot name="header" />
 *         {!header.hasContent && <DefaultHeader />}
 *       </header>
 *       <aside><PortalSlot name="sidebar" /></aside>
 *       <main>{children}</main>
 *     </PortalProvider>
 *   )
 * }
 *
 * // Tool page — injects into any named slot:
 * import { Portal } from '@ydtb/anvil-client'
 *
 * function ContactsPage() {
 *   return (
 *     <>
 *       <Portal name="header"><h1>Contacts</h1></Portal>
 *       <Portal name="sidebar"><FilterPanel /></Portal>
 *       <main>...</main>
 *     </>
 *   )
 * }
 * ```
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SlotState {
  /** The DOM element to portal into */
  target: HTMLElement | null
  /** Whether any component is currently rendering into this slot */
  hasContent: boolean
  /** Optional metadata set by the content provider (e.g., sidebar title) */
  metadata: Record<string, unknown>
}

interface PortalRegistryValue {
  /** Register/update a slot target element */
  setSlotTarget: (name: string, el: HTMLElement | null) => void
  /** Get the target element for a slot */
  getSlotTarget: (name: string) => HTMLElement | null
  /** Mark a slot as having content (or not) */
  setSlotHasContent: (name: string, has: boolean) => void
  /** Check if a slot currently has content */
  getSlotHasContent: (name: string) => boolean
  /** Set metadata on a slot */
  setSlotMetadata: (name: string, key: string, value: unknown) => void
  /** Get metadata from a slot */
  getSlotMetadata: (name: string, key: string) => unknown
  /** Subscribe to changes on a specific slot */
  subscribe: (name: string, listener: () => void) => () => void
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const PortalRegistryContext = createContext<PortalRegistryValue | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface PortalProviderProps {
  children: ReactNode
}

/**
 * Manages the portal slot registry. Place at your app shell root,
 * above any `PortalSlot` or `Portal` components.
 */
export function PortalProvider({ children }: PortalProviderProps) {
  // Use refs for the mutable registry to avoid re-rendering the entire
  // tree on every slot target change. Subscribers are notified individually.
  const slotsRef = useRef<Map<string, SlotState>>(new Map())
  const listenersRef = useRef<Map<string, Set<() => void>>>(new Map())

  const notify = useCallback((name: string) => {
    const listeners = listenersRef.current.get(name)
    if (listeners) {
      for (const fn of listeners) fn()
    }
  }, [])

  const getOrCreateSlot = useCallback((name: string): SlotState => {
    let slot = slotsRef.current.get(name)
    if (!slot) {
      slot = { target: null, hasContent: false, metadata: {} }
      slotsRef.current.set(name, slot)
    }
    return slot
  }, [])

  const value = useMemo<PortalRegistryValue>(() => ({
    setSlotTarget: (name, el) => {
      const slot = getOrCreateSlot(name)
      slot.target = el
      notify(name)
    },
    getSlotTarget: (name) => slotsRef.current.get(name)?.target ?? null,
    setSlotHasContent: (name, has) => {
      const slot = getOrCreateSlot(name)
      slot.hasContent = has
      notify(name)
    },
    getSlotHasContent: (name) => slotsRef.current.get(name)?.hasContent ?? false,
    setSlotMetadata: (name, key, val) => {
      const slot = getOrCreateSlot(name)
      slot.metadata[key] = val
      notify(name)
    },
    getSlotMetadata: (name, key) => slotsRef.current.get(name)?.metadata[key],
    subscribe: (name, listener) => {
      let listeners = listenersRef.current.get(name)
      if (!listeners) {
        listeners = new Set()
        listenersRef.current.set(name, listeners)
      }
      listeners.add(listener)
      return () => { listeners!.delete(listener) }
    },
  }), [getOrCreateSlot, notify])

  return (
    <PortalRegistryContext.Provider value={value}>
      {children}
    </PortalRegistryContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Internal hook
// ---------------------------------------------------------------------------

function useRegistry(): PortalRegistryValue {
  const ctx = useContext(PortalRegistryContext)
  if (!ctx) {
    throw new Error(
      '[anvil-client] Portal used outside PortalProvider. ' +
      'Add <PortalProvider> to your app shell root.'
    )
  }
  return ctx
}

// ---------------------------------------------------------------------------
// PortalSlot — the target element in the shell layout
// ---------------------------------------------------------------------------

export interface PortalSlotProps {
  /** Unique slot name (e.g., 'header', 'sidebar', 'footer') */
  name: string
  /** Optional element type (default: 'div') */
  as?: keyof JSX.IntrinsicElements
  /** Optional className for the slot container */
  className?: string
  /** Optional children to render when no content is portaled in */
  children?: ReactNode
}

/**
 * Defines a named target in the shell layout where tools can inject content.
 *
 * Place these in your layout component:
 * ```tsx
 * <header><PortalSlot name="header" /></header>
 * <aside><PortalSlot name="sidebar" /></aside>
 * ```
 */
export function PortalSlot({ name, as: Tag = 'div', className, children }: PortalSlotProps) {
  const registry = useRegistry()
  const [ref, setRef] = useState<HTMLElement | null>(null)
  const hasContent = usePortalHasContent(name)

  useEffect(() => {
    registry.setSlotTarget(name, ref)
    return () => registry.setSlotTarget(name, null)
  }, [name, ref, registry])

  return (
    <>
      <Tag ref={setRef as any} className={className} />
      {!hasContent && children}
    </>
  )
}

// ---------------------------------------------------------------------------
// Portal — renders children into a named slot
// ---------------------------------------------------------------------------

export interface PortalProps {
  /** Which slot to render into */
  name: string
  /** Content to inject into the slot */
  children: ReactNode
}

/**
 * Render children into a named portal slot via React portal.
 * Automatically tracks whether the slot has content.
 *
 * ```tsx
 * <Portal name="header"><h1>My Tool</h1></Portal>
 * <Portal name="sidebar"><nav>...</nav></Portal>
 * ```
 */
export function Portal({ name, children }: PortalProps) {
  const registry = useRegistry()
  const [target, setTarget] = useState<HTMLElement | null>(null)

  // Subscribe to slot target changes
  useEffect(() => {
    setTarget(registry.getSlotTarget(name))
    return registry.subscribe(name, () => {
      setTarget(registry.getSlotTarget(name))
    })
  }, [name, registry])

  // Track content presence
  useEffect(() => {
    registry.setSlotHasContent(name, true)
    return () => registry.setSlotHasContent(name, false)
  }, [name, registry])

  if (!target) return null
  return createPortal(children, target)
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Check whether a named slot currently has content rendered into it.
 * Re-renders when the hasContent state changes.
 */
export function usePortalHasContent(name: string): boolean {
  const registry = useRegistry()
  const [hasContent, setHasContent] = useState(() => registry.getSlotHasContent(name))

  useEffect(() => {
    setHasContent(registry.getSlotHasContent(name))
    return registry.subscribe(name, () => {
      setHasContent(registry.getSlotHasContent(name))
    })
  }, [name, registry])

  return hasContent
}

/**
 * Read and write metadata on a named slot.
 *
 * Useful for secondary data like sidebar titles:
 * ```tsx
 * // Tool sets it:
 * const { setMetadata } = usePortalMeta('sidebar')
 * setMetadata('title', 'Filters')
 *
 * // Shell reads it:
 * const { metadata } = usePortalMeta('sidebar')
 * <h3>{metadata.title}</h3>
 * ```
 */
export function usePortalMeta(name: string): {
  metadata: Record<string, unknown>
  setMetadata: (key: string, value: unknown) => void
} {
  const registry = useRegistry()
  const [metadata, setLocal] = useState<Record<string, unknown>>({})

  useEffect(() => {
    return registry.subscribe(name, () => {
      const slot = (registry as any).slotsRef?.current?.get(name)
      if (slot) setLocal({ ...slot.metadata })
    })
  }, [name, registry])

  const setMetadata = useCallback(
    (key: string, value: unknown) => registry.setSlotMetadata(name, key, value),
    [name, registry],
  )

  return { metadata, setMetadata }
}
