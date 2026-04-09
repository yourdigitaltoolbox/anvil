/**
 * Tool collector — walks the scope tree and deduplicates tool descriptors.
 *
 * Given an AppConfig, extracts all unique tools from the scope hierarchy.
 * Each tool appears once regardless of how many scopes include it.
 */

import type { AppConfig, ToolDescriptor, ScopeDefinition } from '@ydtb/anvil'

/**
 * Collect all unique tools from the scope tree.
 * Walks depth-first, deduplicates by tool id.
 */
export function collectTools(config: AppConfig): ToolDescriptor[] {
  const seen = new Map<string, ToolDescriptor>()

  function walk(scope: ScopeDefinition): void {
    if (scope.includes) {
      for (const tool of scope.includes) {
        if (!seen.has(tool.id)) {
          seen.set(tool.id, tool)
        }
      }
    }
    if (scope.children) {
      for (const child of scope.children) {
        walk(child)
      }
    }
  }

  walk(config.scopes)
  return [...seen.values()]
}

/**
 * Collect all unique tools along with which scope types include them.
 * Useful for scope-aware routing and tool visibility.
 */
export function collectToolsWithScopes(
  config: AppConfig,
): Array<{ tool: ToolDescriptor; scopeTypes: string[] }> {
  const toolScopes = new Map<string, { tool: ToolDescriptor; scopeTypes: string[] }>()

  function walk(scope: ScopeDefinition): void {
    if (scope.includes) {
      for (const tool of scope.includes) {
        const entry = toolScopes.get(tool.id)
        if (entry) {
          entry.scopeTypes.push(scope.type)
        } else {
          toolScopes.set(tool.id, { tool, scopeTypes: [scope.type] })
        }
      }
    }
    if (scope.children) {
      for (const child of scope.children) {
        walk(child)
      }
    }
  }

  walk(config.scopes)
  return [...toolScopes.values()]
}
