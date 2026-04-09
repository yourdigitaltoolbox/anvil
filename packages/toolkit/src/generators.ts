/**
 * Virtual module generators — produce ES module source code from AppConfig.
 *
 * Each generator takes the collected tools and/or config and returns a string
 * of valid ESM JavaScript that Vite/Rollup can process.
 */

import type { AppConfig, Extension } from '@ydtb/anvil'
import type { ToolDescriptor } from './define-tool.ts'
import { collectTools } from './collect-tools.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a safe variable name from a tool id */
function toVarName(id: string, prefix: string): string {
  return `${prefix}_${id.replace(/[^a-zA-Z0-9]/g, '_')}`
}

// ---------------------------------------------------------------------------
// virtual:anvil/server-tools
// ---------------------------------------------------------------------------

/**
 * Generate the server tools module.
 *
 * Imports each tool's `./server` export and produces a ToolEntry array
 * that createServer() can consume directly.
 *
 * Output:
 * ```js
 * import * as tool_greeter from '@myapp/greeter/server'
 * import * as tool_billing from '@myapp/billing/server'
 * export const tools = [
 *   { id: 'greeter', module: tool_greeter },
 *   { id: 'billing', module: tool_billing },
 * ]
 * ```
 */
export function generateServerToolsModule(config: AppConfig): string {
  const tools = collectTools(config)
  const lines: string[] = []

  // Imports
  for (const tool of tools) {
    const varName = toVarName(tool.id, 'tool')
    lines.push(`import * as ${varName} from '${tool.package}/server'`)
  }

  lines.push('')

  // Export
  lines.push('export const tools = [')
  for (const tool of tools) {
    const varName = toVarName(tool.id, 'tool')
    lines.push(`  { id: ${JSON.stringify(tool.id)}, module: ${varName} },`)
  }
  lines.push(']')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// virtual:anvil/client-tools
// ---------------------------------------------------------------------------

/**
 * Generate the client tools module.
 *
 * Imports each tool's `./client` export and produces a similar array
 * for the client surface registry.
 *
 * Output:
 * ```js
 * import * as tool_greeter from '@myapp/greeter/client'
 * export const tools = [
 *   { id: 'greeter', module: tool_greeter },
 * ]
 * ```
 */
export function generateClientToolsModule(config: AppConfig): string {
  const tools = collectTools(config)
  const lines: string[] = []

  for (const tool of tools) {
    const varName = toVarName(tool.id, 'tool')
    lines.push(`import * as ${varName} from '${tool.package}/client'`)
  }

  lines.push('')
  lines.push('export const tools = [')
  for (const tool of tools) {
    const varName = toVarName(tool.id, 'tool')
    lines.push(`  { id: ${JSON.stringify(tool.id)}, module: ${varName} },`)
  }
  lines.push(']')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// virtual:anvil/schema
// ---------------------------------------------------------------------------

/**
 * Generate the schema module.
 *
 * Imports each tool's `./server` export, extracts schema fields,
 * and re-exports them as a merged object. Used by drizzle.config.ts
 * for migration discovery.
 *
 * Output:
 * ```js
 * export { contacts, contactNotes } from '@myapp/contacts/server'
 * export { wallets, transactions } from '@myapp/billing/server'
 * ```
 *
 * Note: This module uses namespace re-exports. The actual schema
 * field names aren't known at build time — they're whatever the
 * tool's defineServer({ schema: { ... } }) declares. We import
 * the full server module and let the consuming code (drizzle config)
 * handle the schema extraction.
 */
export function generateSchemaModule(config: AppConfig): string {
  const tools = collectTools(config)
  const lines: string[] = []

  // Import each tool's server module and collect schemas
  for (const tool of tools) {
    const varName = toVarName(tool.id, 'tool')
    lines.push(`import ${varName} from '${tool.package}/server'`)
  }

  lines.push('')
  lines.push('// Merge all tool schemas into a single object')
  lines.push('export const schema = {')
  for (const tool of tools) {
    const varName = toVarName(tool.id, 'tool')
    lines.push(`  ...((${varName})?.schema ?? {}),`)
  }
  lines.push('}')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// virtual:anvil/scope-tree
// ---------------------------------------------------------------------------

/**
 * Generate the scope tree module.
 *
 * Serializes the scope hierarchy to JSON, replacing tool references
 * with lightweight descriptors (id + package only, no functions).
 *
 * Output:
 * ```js
 * export const scopeTree = { type: 'system', label: 'System', ... }
 * ```
 */
export function generateScopeTreeModule(config: AppConfig): string {
  function serializeScope(scope: import('@ydtb/anvil').ScopeDefinition): unknown {
    return {
      type: scope.type,
      label: scope.label,
      urlPrefix: scope.urlPrefix,
      includes: (scope.includes ?? []).map((t) => ({ id: t.id, name: t.name })),
      children: (scope.children ?? []).map(serializeScope),
    }
  }

  const tree = serializeScope(config.scopes as import('@ydtb/anvil').ScopeDefinition)
  return `export const scopeTree = ${JSON.stringify(tree, null, 2)}`
}

// ---------------------------------------------------------------------------
// virtual:anvil/permissions
// ---------------------------------------------------------------------------

/**
 * Generate the permissions module.
 *
 * Imports each tool's `./types` export and collects permission declarations
 * (objects with `feature` and `actions` fields).
 *
 * Output:
 * ```js
 * import * as types_greeter from '@myapp/greeter/types'
 * // ... collection logic
 * export const permissions = [...]
 * ```
 */
export function generatePermissionsModule(config: AppConfig): string {
  const tools = collectTools(config)
  const lines: string[] = []

  for (const tool of tools) {
    const varName = toVarName(tool.id, 'types')
    lines.push(`import * as ${varName} from '${tool.package}/types'`)
  }

  lines.push('')
  lines.push('function collectPermissions(exports) {')
  lines.push('  const perms = []')
  lines.push('  for (const value of Object.values(exports)) {')
  lines.push('    if (value && typeof value === "object" && "feature" in value && "actions" in value) {')
  lines.push('      perms.push(value)')
  lines.push('    }')
  lines.push('  }')
  lines.push('  return perms')
  lines.push('}')
  lines.push('')
  lines.push('export const permissions = [')
  for (const tool of tools) {
    const varName = toVarName(tool.id, 'types')
    lines.push(`  ...collectPermissions(${varName}),`)
  }
  lines.push(']')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// virtual:anvil/extensions
// ---------------------------------------------------------------------------

/**
 * Generate the extensions module.
 *
 * Simply re-exports the extensions array from the config.
 * Extensions are already imported and instantiated in compose.config.ts —
 * this module makes them available to the server and client runtimes
 * without re-importing compose.config.
 */
export function generateExtensionsModule(config: AppConfig): string {
  // Extensions are runtime objects (they have functions, routers, etc.)
  // We can't serialize them — they need to be imported from the config.
  // This module just provides the extension IDs and metadata.
  const extensions = config.extensions ?? []
  const lines: string[] = []

  lines.push('export const extensions = [')
  for (const ext of extensions) {
    lines.push(`  { id: ${JSON.stringify(ext.id)}, name: ${JSON.stringify(ext.name)} },`)
  }
  lines.push(']')

  return lines.join('\n')
}
