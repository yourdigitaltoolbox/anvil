/**
 * Layout portals for scope-based apps — HeaderPortal and SidebarPortal.
 *
 * These are toolkit-level convenience components built on the framework's
 * generic portal system. They define the standard slot names that scoped
 * dashboard layouts use: 'header', 'sidebar', and 'sidebar-drawer'.
 *
 * **Framework provides:** `PortalProvider`, `PortalSlot`, `Portal` (generic, any named slot)
 * **Toolkit provides:** `HeaderPortal`, `SidebarPortal` (pre-named slots for dashboard layouts)
 *
 * @example
 * ```tsx
 * // App shell layout (uses toolkit slot names):
 * import { PortalProvider, PortalSlot } from '@ydtb/anvil-client'
 *
 * function DashboardLayout({ children }) {
 *   return (
 *     <PortalProvider>
 *       <header><PortalSlot name="header"><DefaultHeader /></PortalSlot></header>
 *       <aside><PortalSlot name="sidebar" /></aside>
 *       <main>{children}</main>
 *     </PortalProvider>
 *   )
 * }
 *
 * // Tool page (uses toolkit convenience components):
 * import { HeaderPortal, SidebarPortal } from '@ydtb/anvil-toolkit/client'
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

import type { ReactNode } from 'react'
import { Portal } from '@ydtb/anvil-client'

// ---------------------------------------------------------------------------
// Standard slot names for scope-based dashboard layouts
// ---------------------------------------------------------------------------

/** The standard header slot name used by toolkit dashboard layouts */
export const HEADER_SLOT = 'header'

/** The standard sidebar slot name used by toolkit dashboard layouts */
export const SIDEBAR_SLOT = 'sidebar'

/** The standard drawer sidebar slot name (mobile/responsive) */
export const SIDEBAR_DRAWER_SLOT = 'sidebar-drawer'

// ---------------------------------------------------------------------------
// Convenience portal components
// ---------------------------------------------------------------------------

export interface HeaderPortalProps {
  children: ReactNode
}

/**
 * Render children into the dashboard header slot.
 * Shorthand for `<Portal name="header">`.
 */
export function HeaderPortal({ children }: HeaderPortalProps) {
  return <Portal name={HEADER_SLOT}>{children}</Portal>
}

export interface SidebarPortalProps {
  children: ReactNode
}

/**
 * Render children into the dashboard sidebar slot(s).
 * Renders into both the main sidebar and the drawer sidebar
 * for responsive layouts.
 *
 * Shorthand for `<Portal name="sidebar">` + `<Portal name="sidebar-drawer">`.
 */
export function SidebarPortal({ children }: SidebarPortalProps) {
  return (
    <>
      <Portal name={SIDEBAR_SLOT}>{children}</Portal>
      <Portal name={SIDEBAR_DRAWER_SLOT}>{children}</Portal>
    </>
  )
}
