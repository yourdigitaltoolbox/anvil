/**
 * Type declarations for Anvil virtual modules.
 *
 * These modules are generated at build time by the anvilPlugin.
 * Import this file (or include it in tsconfig) so TypeScript knows
 * about the virtual module types.
 *
 * Usage: add to your tsconfig.json:
 * ```json
 * {
 *   "include": ["src", "node_modules/@ydtb/anvil-build/src/virtual.d.ts"]
 * }
 * ```
 */

declare module 'virtual:anvil/server-tools' {
  import type { Server } from '@ydtb/anvil'

  interface VirtualToolEntry {
    id: string
    module: { default?: Server }
  }

  export const tools: VirtualToolEntry[]
}

declare module 'virtual:anvil/client-tools' {
  import type { Client } from '@ydtb/anvil'

  interface VirtualClientToolEntry {
    id: string
    module: { default?: Client }
  }

  export const tools: VirtualClientToolEntry[]
}

declare module 'virtual:anvil/schema' {
  /** Merged schema object from all tools — pass to drizzle-kit config */
  export const schema: Record<string, unknown>
}

declare module 'virtual:anvil/scope-tree' {
  interface VirtualScopeNode {
    type: string
    label: string
    urlPrefix: string
    includes: Array<{ id: string; name: string }>
    children: VirtualScopeNode[]
  }

  export const scopeTree: VirtualScopeNode
}

declare module 'virtual:anvil/permissions' {
  import type { PermissionGroup } from '@ydtb/anvil'

  export const permissions: PermissionGroup[]
}

declare module 'virtual:anvil/extensions' {
  interface VirtualExtensionEntry {
    id: string
    name: string
  }

  export const extensions: VirtualExtensionEntry[]
}

declare module 'virtual:anvil/tailwind-sources' {
  /** CSS module — import in your stylesheet to auto-discover tool source paths */
  const css: string
  export default css
}
