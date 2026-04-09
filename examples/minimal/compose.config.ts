/**
 * Composition root — the single source of truth for this app.
 *
 * Declares brand, layers, extensions, and scope hierarchy.
 * This is the one file that tells you what the app is made of.
 */

import { defineApp, scope } from '../../packages/anvil/src/index.ts'
import { memoryStore } from './layer-store.ts'
import { widgets } from './ext-widgets.ts'
import { greeter } from './tool-greeter.ts'

export default defineApp({
  brand: {
    name: 'Anvil Minimal Example',
  },

  layers: {
    store: memoryStore(),
  },

  extensions: [widgets],

  scopes: scope({
    type: 'system',
    label: 'System',
    urlPrefix: '/s',
    includes: [greeter],
  }),
})
