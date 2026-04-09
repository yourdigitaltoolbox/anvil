/**
 * Example tool: greeter.
 *
 * Demonstrates the full tool authoring pattern:
 * - Hono router with routes that use getLayer()
 * - Hook registrations (actions, broadcasts)
 * - Extension contributions (widgets)
 *
 * In a real app, this would be @myapp/contacts or @myapp/billing.
 */

import { Hono } from 'hono'
import { defineTool, defineServer } from '../../packages/anvil/src/index.ts'
import { getLayer, getRequestContext } from '../../packages/server/src/index.ts'

// ---------------------------------------------------------------------------
// Tool descriptor (used in scope includes)
// ---------------------------------------------------------------------------

export const greeter = defineTool({
  id: 'greeter',
  name: 'Greeter',
  package: '@example/greeter',
})

// ---------------------------------------------------------------------------
// Router — plain Hono, uses getLayer() for infrastructure
// ---------------------------------------------------------------------------

const router = new Hono()

router.get('/hello', (c) => {
  const name = c.req.query('name') ?? 'World'
  const ctx = getRequestContext()

  // Use the store layer to track greetings
  const store = getLayer('store')
  const count = parseInt(store.get('greetCount') ?? '0', 10) + 1
  store.set('greetCount', String(count))

  return c.json({
    message: `Hello, ${name}!`,
    totalGreetings: count,
    requestId: ctx?.requestId,
  })
})

router.get('/stats', (c) => {
  const store = getLayer('store')
  return c.json({
    greetCount: parseInt(store.get('greetCount') ?? '0', 10),
    keys: store.keys(),
  })
})

// ---------------------------------------------------------------------------
// Server surface — hooks + router + extension contributions
// ---------------------------------------------------------------------------

export const greeterServer = defineServer({
  router,

  hooks: {
    actions: {
      'greeter:greet': (input: unknown) => {
        const { name } = input as { name: string }
        return { message: `Hello, ${name}!` }
      },
    },
    broadcasts: {
      'greeter:greeted': async (payload: unknown) => {
        const { name } = payload as { name: string }
        const store = getLayer('store')
        store.set(`lastGreeted`, name)
      },
    },
  },

  // Contribute to the widgets extension
  widgets: {
    items: [
      { id: 'recent-greetings', label: 'Recent Greetings', description: 'Shows the latest greetings' },
      { id: 'greet-counter', label: 'Greet Counter', description: 'Total greetings count' },
    ],
  },
})
