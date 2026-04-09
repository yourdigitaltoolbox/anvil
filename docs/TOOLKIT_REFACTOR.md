# Toolkit Refactor Plan

## Goal

Separate YDTB-specific "tool/scope" concepts from the generic framework. The framework becomes truly generic — any app can define its own module system. YDTB's tool/scope pattern moves to `@ydtb/anvil-toolkit`.

## The Split

### Framework (`@ydtb/anvil` + server/client/build/hooks)
Generic primitives. No knowledge of "tools" or "scopes."

**Keeps:**
- `defineApp` — composition root (brand, layers, extensions)
- `defineExtension` — extensible platform systems
- Layers — `LayerMap`, `LayerConfig`, `RequiredLayers`, `getLayer()`
- Hooks — `HookSystem`, actions/broadcasts/filters
- Server — `createServer`, lifecycle, health, middleware, request context, SPA handler, cache helpers
- Client — `useLayer`, `useScope`, `useAuth`, `createApiClient`
- Build — plugin mechanics (resolveId/load), dev server, vite config

### Toolkit (`@ydtb/anvil-toolkit` — NEW package)
YDTB's pattern for building apps with tools and scopes.

**Gets:**
- `defineTool`, `ToolDescriptor`
- `defineClient`, `Client`, `ClientCore`, `RouteEntry`, `NavigationEntry`, `PermissionGroup`
- `defineServer`, `Server`, `ServerCore`, `ServerHooks`
- `scope()`, `ScopeDefinition`, `ScopeTree`
- `assembleRoutes()`, `createAnvilApp()`
- `toolEntry()`, `processSurfaces()`, `ToolEntry`, `ProcessedSurfaces`
- `collectTools()`, `collectToolsWithScopes()`
- All virtual module generators (server-tools, client-tools, schema, scope-tree, permissions)
- `virtual.d.ts` type declarations
- Augments `AppConfig` with `scopes` field via declaration merging

## Key Design Decisions

### 1. AppConfig becomes extensible
```ts
// BEFORE (framework knows about scopes)
interface AppConfig {
  brand: BrandConfig
  layers: RequiredLayers
  scopes: ScopeTree        // ← hardcoded
  extensions?: Extension[]
}

// AFTER (generic)
interface AppConfig {
  brand: BrandConfig
  layers: RequiredLayers
  extensions?: Extension[]
  [key: string]: unknown    // extensible via declaration merging
}

// Toolkit augments:
declare module '@ydtb/anvil' {
  interface AppConfig {
    scopes?: ScopeTree
  }
}
```

### 2. Extension.client/server become unknown
```ts
// BEFORE
interface Extension {
  id: string
  name: string
  client?: Client    // ← toolkit type
  server?: Server    // ← toolkit type
}

// AFTER
interface Extension {
  id: string
  name: string
  client?: unknown   // toolkit narrows this
  server?: unknown   // toolkit narrows this
}
```

### 3. createServer accepts generic modules
```ts
// BEFORE
interface ServerConfig {
  tools: ToolEntry[]   // ← toolkit type
}

// AFTER  
interface ServerConfig {
  modules?: unknown[]  // generic — toolkit defines the shape
  processSurfaces?: (hooks: HookSystem, modules: unknown[], extensions: Extension[]) => ProcessedResult
}

// Toolkit provides:
import { createToolServer } from '@ydtb/anvil-toolkit'

const server = createToolServer({  // wraps createServer with tool processing
  config,
  tools: [toolEntry('contacts', contactsServer)],
})
```

### 4. Build plugin becomes extensible
```ts
// BEFORE — hardcoded generators
const VIRTUAL_MODULES = {
  'virtual:anvil/server-tools': generateServerToolsModule,
  // ... all hardcoded
}

// AFTER — extensible
anvilPlugin(config, {
  modules: toolkitModules(config),  // toolkit provides generators
})
```

### 5. SPA handler uses local route type
```ts
// BEFORE — imports RouteEntry from @ydtb/anvil
import type { RouteEntry } from '@ydtb/anvil'

// AFTER — defines its own minimal type
interface RouteDefinition {
  path: string
  loader?: (ctx: { params: Record<string, string> }) => Promise<unknown>
}
```

## File-by-File Changes

### Files that MOVE entirely to toolkit
| Current Location | New Location |
|---|---|
| `packages/anvil/src/define-tool.ts` | `packages/toolkit/src/define-tool.ts` |
| `packages/anvil/src/scope.ts` | `packages/toolkit/src/scope.ts` |
| `packages/anvil/src/client.ts` | `packages/toolkit/src/client.ts` |
| `packages/anvil/src/server.ts` | `packages/toolkit/src/server.ts` |
| `packages/server/src/surfaces.ts` | `packages/toolkit/src/surfaces.ts` |
| `packages/client/src/assemble-routes.ts` | `packages/toolkit/src/assemble-routes.ts` |
| `packages/client/src/create-app.tsx` | `packages/toolkit/src/create-app.tsx` |
| `packages/build/src/collect-tools.ts` | `packages/toolkit/src/collect-tools.ts` |
| `packages/build/src/generators.ts` | `packages/toolkit/src/generators.ts` |
| `packages/build/src/virtual.d.ts` | `packages/toolkit/src/virtual.d.ts` |

### Files that STAY but need modification
| File | Change |
|---|---|
| `packages/anvil/src/define-app.ts` | Remove `scopes` from `AppConfig`, make extensible |
| `packages/anvil/src/extension.ts` | `client`/`server` become `unknown` |
| `packages/anvil/src/layers.ts` | Remove `JobDefinition` (toolkit concept) — keep `Logger`, `HealthStatus` |
| `packages/anvil/src/index.ts` | Remove all toolkit exports |
| `packages/server/src/boot.ts` | Accept `processSurfaces` callback instead of importing it |
| `packages/server/src/create-server.ts` | `tools` → `modules`, accept `processSurfaces` |
| `packages/server/src/create-worker.ts` | Same as create-server |
| `packages/server/src/spa-handler.ts` | Define local `RouteDefinition` type |
| `packages/server/src/index.ts` | Remove toolkit exports |
| `packages/client/src/index.ts` | Remove toolkit exports |
| `packages/build/src/plugin.ts` | Accept `modules` map parameter |
| `packages/build/src/index.ts` | Remove toolkit exports |

### New files in toolkit
| File | Purpose |
|---|---|
| `packages/toolkit/package.json` | Package definition |
| `packages/toolkit/tsconfig.json` | TypeScript config |
| `packages/toolkit/src/index.ts` | Barrel export |
| `packages/toolkit/src/augment.ts` | Declaration merging for AppConfig.scopes |
| `packages/toolkit/src/create-tool-server.ts` | Wrapper around createServer with tool processing |
| `packages/toolkit/src/create-tool-worker.ts` | Wrapper around createWorker with tool processing |
| `packages/toolkit/src/build-modules.ts` | Virtual module generators for the build plugin |

## Execution Order

### Phase 1: Prepare framework for extensibility (non-breaking)
Make the framework accept optional/generic parameters alongside the current ones. This means existing code keeps working while we build the toolkit.

1. Make `AppConfig` extensible (add index signature, keep `scopes` for now)
2. Make `Extension.client`/`Extension.server` accept `unknown`
3. Make `anvilPlugin` accept optional `modules` map
4. Make `boot.ts` accept optional `processSurfaces` callback
5. Make `createServer`/`createWorker` accept optional `modules` + `processSurfaces`
6. Define local route type in `spa-handler.ts`

### Phase 2: Create toolkit package
Build the new package that re-exports everything that's moving.

7. Create `packages/toolkit/` with package.json, tsconfig
8. Copy toolkit files from their current locations
9. Create `augment.ts` with declaration merging
10. Create `create-tool-server.ts` and `create-tool-worker.ts` wrappers
11. Create `build-modules.ts` for virtual module generators
12. Create barrel export

### Phase 3: Update framework to remove toolkit code
Remove the toolkit-specific code from framework packages.

13. Remove moved files from `packages/anvil/src/`
14. Remove moved files from `packages/server/src/`, `packages/client/src/`, `packages/build/src/`
15. Update all barrel exports
16. Remove `scopes` from `AppConfig`

### Phase 4: Update consumers
Update everything that imports from the framework to import from the toolkit where needed.

17. Update example app
18. Update all tests
19. Update documentation (README, GETTING_STARTED, API_REFERENCE, DESIGN)

### Phase 5: Update ydtb-anvil
20. Add `@ydtb/anvil-toolkit` dependency
21. Update imports in compose.config.ts, server/index.ts, client files

## Risk Mitigation

- **Phase 1 is non-breaking** — framework gains new optional parameters, existing code keeps working
- **Phase 2 builds alongside** — toolkit can be tested independently
- **Phase 3 is the breaking change** — remove old exports. Do this in one commit.
- **Phase 4 updates consumers** — must happen in the same commit as Phase 3

## Impact on ydtb-anvil

After the refactor, ydtb-anvil's imports change:

```ts
// BEFORE
import { defineApp, scope, defineTool, defineClient, defineServer } from '@ydtb/anvil'
import { createServer, toolEntry } from '@ydtb/anvil-server'
import { assembleRoutes, createAnvilApp } from '@ydtb/anvil-client'

// AFTER
import { defineApp } from '@ydtb/anvil'
import { scope, defineTool, defineClient, defineServer, toolEntry } from '@ydtb/anvil-toolkit'
import { createToolServer } from '@ydtb/anvil-toolkit'
import { assembleRoutes, createAnvilApp } from '@ydtb/anvil-toolkit'
import { createServer } from '@ydtb/anvil-server'  // still available for non-toolkit use
```
