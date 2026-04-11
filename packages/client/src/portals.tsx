/**
 * Layout portals — tools inject content into the app shell's fixed regions.
 *
 * The app shell provides a `PortalProvider` that exposes DOM ref targets for
 * the header and sidebar. Tools render `<HeaderPortal>` and `<SidebarPortal>`
 * to teleport content into those regions via React portals.
 *
 * @example
 * ```tsx
 * // App shell layout (provides the portal targets):
 * import { PortalProvider, useLayoutPortals } from '@ydtb/anvil-client'
 *
 * function DashboardLayout({ children }) {
 *   const { setHeaderRoot, setSidebarRoot } = useLayoutPortals()
 *   return (
 *     <div>
 *       <header ref={setHeaderRoot} />
 *       <aside ref={setSidebarRoot} />
 *       <main>{children}</main>
 *     </div>
 *   )
 * }
 *
 * // Tool page (injects into shell regions):
 * import { HeaderPortal, SidebarPortal } from '@ydtb/anvil-client'
 *
 * function ContactsPage() {
 *   return (
 *     <>
 *       <HeaderPortal><h1>Contacts</h1></HeaderPortal>
 *       <SidebarPortal><FilterPanel /></SidebarPortal>
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
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface PortalContextValue {
  /** Header portal target element */
  headerRoot: HTMLElement | null
  setHeaderRoot: (node: HTMLElement | null) => void

  /** Sidebar portal target element */
  sidebarRoot: HTMLElement | null
  setSidebarRoot: (node: HTMLElement | null) => void

  /** Sidebar title (set by tools, read by the shell) */
  sidebarTitle: string | null
  setSidebarTitle: (title: string | null) => void

  /** Drawer sidebar target (mobile/responsive layouts) */
  drawerSidebarRoot: HTMLElement | null
  setDrawerSidebarRoot: (node: HTMLElement | null) => void

  /** Whether a tool is currently injecting header content */
  hasHeaderContent: boolean
  setHasHeaderContent: (has: boolean) => void

  /** Whether a tool is currently injecting sidebar content */
  hasSidebarContent: boolean
  setHasSidebarContent: (has: boolean) => void
}

const PortalContext = createContext<PortalContextValue | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface PortalProviderProps {
  children: ReactNode
}

/**
 * Provides layout portal context. Place in your app shell root,
 * above any components that use `HeaderPortal` or `SidebarPortal`.
 */
export function PortalProvider({ children }: PortalProviderProps) {
  const [sidebarRoot, setSidebarRoot] = useState<HTMLElement | null>(null)
  const [sidebarTitle, setSidebarTitle] = useState<string | null>(null)
  const [drawerSidebarRoot, setDrawerSidebarRoot] = useState<HTMLElement | null>(null)
  const [headerRoot, setHeaderRoot] = useState<HTMLElement | null>(null)
  const [hasHeaderContent, setHasHeaderContent] = useState(false)
  const [hasSidebarContent, setHasSidebarContent] = useState(false)

  return (
    <PortalContext.Provider
      value={{
        sidebarRoot,
        setSidebarRoot,
        sidebarTitle,
        setSidebarTitle,
        drawerSidebarRoot,
        setDrawerSidebarRoot,
        headerRoot,
        setHeaderRoot,
        hasHeaderContent,
        setHasHeaderContent,
        hasSidebarContent,
        setHasSidebarContent,
      }}
    >
      {children}
    </PortalContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Access the layout portal context.
 *
 * Used by both the app shell (to provide ref targets) and by tools
 * (to check portal availability or read content flags).
 */
export function useLayoutPortals(): PortalContextValue {
  const context = useContext(PortalContext)
  if (!context) {
    throw new Error(
      '[anvil-client] useLayoutPortals must be used within PortalProvider. ' +
      'Add <PortalProvider> to your app shell layout.'
    )
  }
  return context
}

// ---------------------------------------------------------------------------
// Portal components (tools use these)
// ---------------------------------------------------------------------------

export interface HeaderPortalProps {
  children: ReactNode
}

/**
 * Render children into the app shell's header region via React portal.
 * Automatically sets `hasHeaderContent` so the shell can hide its default header.
 */
export function HeaderPortal({ children }: HeaderPortalProps) {
  const { headerRoot, setHasHeaderContent } = useLayoutPortals()

  useEffect(() => {
    setHasHeaderContent(true)
    return () => setHasHeaderContent(false)
  }, [setHasHeaderContent])

  if (!headerRoot) return null
  return createPortal(children, headerRoot)
}

export interface SidebarPortalProps {
  children: ReactNode
}

/**
 * Render children into the app shell's sidebar region via React portal.
 * Renders into both the main sidebar and the drawer sidebar (for responsive layouts).
 * Automatically sets `hasSidebarContent` so the shell can show/hide the sidebar.
 */
export function SidebarPortal({ children }: SidebarPortalProps) {
  const { sidebarRoot, drawerSidebarRoot, setHasSidebarContent } = useLayoutPortals()

  useEffect(() => {
    setHasSidebarContent(true)
    return () => setHasSidebarContent(false)
  }, [setHasSidebarContent])

  return (
    <>
      {sidebarRoot && createPortal(children, sidebarRoot)}
      {drawerSidebarRoot && createPortal(children, drawerSidebarRoot)}
    </>
  )
}
