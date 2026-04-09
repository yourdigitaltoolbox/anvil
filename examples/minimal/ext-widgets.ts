/**
 * Example extension: widget registry.
 *
 * Demonstrates the full extension authoring pattern:
 * 1. Define the contribution types
 * 2. Augment ClientContributions/ServerContributions via declaration merging
 * 3. Define the extension with its own surfaces
 * 4. Export for registration in defineApp
 *
 * In a real app, this would be @myapp/ext-dashboard or @myapp/ext-search.
 */

import { Hono } from 'hono'
import { defineExtension } from '../../packages/anvil/src/index.ts'
import { getHooks } from '../../packages/server/src/index.ts'

// ---------------------------------------------------------------------------
// 1. Define contribution types
// ---------------------------------------------------------------------------

export interface WidgetEntry {
  id: string
  label: string
  description?: string
}

// ---------------------------------------------------------------------------
// 2. Augment surface types — tools can now contribute widgets
// ---------------------------------------------------------------------------

declare module '@ydtb/anvil' {
  interface ServerContributions {
    widgets?: { items: WidgetEntry[] }
  }
}

// ---------------------------------------------------------------------------
// 3. Extension's own server surface — provides a route to list all widgets
// ---------------------------------------------------------------------------

const widgetRouter = new Hono()

widgetRouter.get('/', (c) => {
  // Retrieve collected contributions via the hook system
  const hooks = getHooks()
  const widgets = hooks.applyFilterSync('ext:widgets:contributions', [] as WidgetEntry[])
  return c.json({ widgets })
})

// ---------------------------------------------------------------------------
// 4. Export the extension
// ---------------------------------------------------------------------------

export const widgets = defineExtension({
  id: 'widgets',
  name: 'Widgets',
  server: {
    router: widgetRouter,
  },
})
