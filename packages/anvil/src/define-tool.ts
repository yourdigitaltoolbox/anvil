/**
 * Tool descriptor — declares a tool's identity for the composition root.
 *
 * Tools are the unit of functionality in Anvil. Each tool is a package
 * that exports a client definition (routes, nav, permissions) and a
 * server definition (schema, router, hooks, jobs).
 *
 * The descriptor is what gets passed to `scope({ includes: [...] })`.
 */

export interface ToolDescriptor {
  /** Unique tool identifier (e.g. 'contacts', 'billing') */
  id: string
  /** Human-readable display name */
  name: string
  /** Package name for import resolution (e.g. '@myapp/contacts') */
  package: string
}

/**
 * Define a tool descriptor.
 *
 * @example
 * ```ts
 * import { defineTool } from '@ydtb/anvil'
 *
 * export const contacts = defineTool({
 *   id: 'contacts',
 *   name: 'Contacts',
 *   package: '@myapp/contacts',
 * })
 * ```
 */
export function defineTool(descriptor: ToolDescriptor): ToolDescriptor {
  return descriptor
}
