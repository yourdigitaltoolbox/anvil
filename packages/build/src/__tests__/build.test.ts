/**
 * Tests for @ydtb/anvil-build
 *
 * Proves:
 * - Tool collection from scope tree (deduplication, nested scopes)
 * - Virtual module generation (correct imports, exports, structure)
 * - Plugin resolveId/load hooks
 */

import { describe, it, expect } from 'vitest'
import { defineApp, defineExtension } from '@ydtb/anvil'
import { defineTool, scope, collectTools, collectToolsWithScopes } from '@ydtb/anvil-toolkit/core'
import {
  toolkitModules,
  generateServerToolsModule,
  generateClientToolsModule,
  generateSchemaModule,
  generateScopeTreeModule,
  generatePermissionsModule,
  generateExtensionsModule,
} from '@ydtb/anvil-toolkit/build'
import { anvilPlugin } from '../plugin.ts'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const contacts = defineTool({ id: 'contacts', name: 'Contacts', package: '@myapp/contacts' })
const billing = defineTool({ id: 'billing', name: 'Billing', package: '@myapp/billing' })
const dashboard = defineTool({ id: 'dashboard', name: 'Dashboard', package: '@myapp/dashboard' })
const team = defineTool({ id: 'team', name: 'Team', package: '@myapp/team' })

const searchExt = defineExtension({ id: 'search', name: 'Search' })
const onboardingExt = defineExtension({ id: 'onboarding', name: 'Onboarding' })

const testConfig = defineApp({
  brand: { name: 'Test App' },
  layers: {} as any,
  scopes: scope({
    type: 'system',
    label: 'System',
    urlPrefix: '/s',
    includes: [dashboard],
    children: [
      scope({
        type: 'company',
        label: 'Company',
        urlPrefix: '/c/$scopeId',
        includes: [dashboard, billing, team],
        children: [
          scope({
            type: 'location',
            label: 'Location',
            urlPrefix: '/l/$scopeId',
            includes: [dashboard, billing, contacts, team],
          }),
        ],
      }),
    ],
  }),
  extensions: [searchExt, onboardingExt],
})

// ---------------------------------------------------------------------------
// Tool collection
// ---------------------------------------------------------------------------

describe('collectTools', () => {
  it('collects all unique tools from scope tree', () => {
    const tools = collectTools(testConfig)
    const ids = tools.map((t) => t.id)

    expect(ids).toContain('dashboard')
    expect(ids).toContain('billing')
    expect(ids).toContain('contacts')
    expect(ids).toContain('team')
    expect(ids).toHaveLength(4) // deduplicated
  })

  it('deduplicates tools appearing in multiple scopes', () => {
    const tools = collectTools(testConfig)
    const dashboardCount = tools.filter((t) => t.id === 'dashboard').length
    expect(dashboardCount).toBe(1)
  })

  it('handles empty scope tree', () => {
    const config = defineApp({
      brand: { name: 'Empty' },
      layers: {} as any,
      scopes: scope({ type: 'system', label: 'System', urlPrefix: '/s' }),
    })
    const tools = collectTools(config)
    expect(tools).toEqual([])
  })
})

describe('collectToolsWithScopes', () => {
  it('tracks which scope types include each tool', () => {
    const result = collectToolsWithScopes(testConfig)
    const dashboardEntry = result.find((r) => r.tool.id === 'dashboard')
    const contactsEntry = result.find((r) => r.tool.id === 'contacts')

    expect(dashboardEntry?.scopeTypes).toEqual(['system', 'company', 'location'])
    expect(contactsEntry?.scopeTypes).toEqual(['location'])
  })
})

// ---------------------------------------------------------------------------
// Module generation
// ---------------------------------------------------------------------------

describe('generateServerToolsModule', () => {
  it('generates valid ESM with imports and exports', () => {
    const source = generateServerToolsModule(testConfig)

    expect(source).toContain("import * as tool_dashboard from '@myapp/dashboard/server'")
    expect(source).toContain("import * as tool_billing from '@myapp/billing/server'")
    expect(source).toContain("import * as tool_contacts from '@myapp/contacts/server'")
    expect(source).toContain("import * as tool_team from '@myapp/team/server'")
    expect(source).toContain('export const tools = [')
    expect(source).toContain("id: \"dashboard\"")
    expect(source).toContain('module: tool_dashboard')
  })
})

describe('generateClientToolsModule', () => {
  it('generates client imports from /client subpath', () => {
    const source = generateClientToolsModule(testConfig)

    expect(source).toContain("from '@myapp/dashboard/client'")
    expect(source).toContain("from '@myapp/contacts/client'")
    expect(source).toContain('export const tools = [')
  })
})

describe('generateSchemaModule', () => {
  it('generates schema imports from server modules', () => {
    const source = generateSchemaModule(testConfig)

    expect(source).toContain("from '@myapp/dashboard/server'")
    expect(source).toContain('export const schema = {')
    expect(source).toContain('?.schema')
  })
})

describe('generateScopeTreeModule', () => {
  it('serializes scope hierarchy with tool refs', () => {
    const source = generateScopeTreeModule(testConfig)

    expect(source).toContain('export const scopeTree =')
    expect(source).toContain('"type": "system"')
    expect(source).toContain('"type": "company"')
    expect(source).toContain('"type": "location"')
    // Tools are lightweight refs (id + name only)
    expect(source).toContain('"id": "dashboard"')
    expect(source).not.toContain('@myapp/dashboard') // package not in scope tree
  })
})

describe('generatePermissionsModule', () => {
  it('generates permission collection from /types exports', () => {
    const source = generatePermissionsModule(testConfig)

    expect(source).toContain("from '@myapp/dashboard/types'")
    expect(source).toContain('collectPermissions')
    expect(source).toContain('export const permissions = [')
  })
})

describe('generateExtensionsModule', () => {
  it('generates extension metadata', () => {
    const source = generateExtensionsModule(testConfig)

    expect(source).toContain('export const extensions = [')
    expect(source).toContain('"search"')
    expect(source).toContain('"onboarding"')
  })

  it('handles no extensions', () => {
    const config = defineApp({
      brand: { name: 'No Ext' },
      layers: {} as any,
      scopes: scope({ type: 'system', label: 'System', urlPrefix: '/s' }),
    })
    const source = generateExtensionsModule(config)
    expect(source).toContain('export const extensions = [')
    expect(source).toContain(']')
  })
})

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

describe('anvilPlugin', () => {
  it('resolves virtual module IDs', () => {
    const plugin = anvilPlugin(testConfig, { modules: toolkitModules(testConfig) })

    expect(plugin.resolveId('virtual:anvil/server-tools')).toBe('\0virtual:anvil/server-tools')
    expect(plugin.resolveId('virtual:anvil/client-tools')).toBe('\0virtual:anvil/client-tools')
    expect(plugin.resolveId('virtual:anvil/schema')).toBe('\0virtual:anvil/schema')
    expect(plugin.resolveId('virtual:anvil/scope-tree')).toBe('\0virtual:anvil/scope-tree')
    expect(plugin.resolveId('virtual:anvil/permissions')).toBe('\0virtual:anvil/permissions')
    expect(plugin.resolveId('virtual:anvil/extensions')).toBe('\0virtual:anvil/extensions')
  })

  it('returns undefined for non-virtual modules', () => {
    const plugin = anvilPlugin(testConfig, { modules: toolkitModules(testConfig) })
    expect(plugin.resolveId('./some-file.ts')).toBeUndefined()
    expect(plugin.resolveId('react')).toBeUndefined()
  })

  it('loads generated source for resolved virtual modules', () => {
    const plugin = anvilPlugin(testConfig, { modules: toolkitModules(testConfig) })

    const source = plugin.load('\0virtual:anvil/server-tools')
    expect(source).toContain("import * as tool_dashboard")
    expect(source).toContain('export const tools')
  })

  it('returns undefined for non-virtual loads', () => {
    const plugin = anvilPlugin(testConfig, { modules: toolkitModules(testConfig) })
    expect(plugin.load('./some-file.ts')).toBeUndefined()
  })

  it('caches generated modules', () => {
    const plugin = anvilPlugin(testConfig, { modules: toolkitModules(testConfig) })

    const first = plugin.load('\0virtual:anvil/server-tools')
    const second = plugin.load('\0virtual:anvil/server-tools')
    expect(first).toBe(second) // same reference = cached
  })
})
