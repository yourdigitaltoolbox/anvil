# Anvil

> **Pre-alpha.** Anvil is under active development. APIs and interfaces will change before the alpha and stable releases. Not recommended for production use unless you are prepared to track breaking changes.

A composable full-stack framework for building extensible applications with swappable infrastructure. Anvil provides the generic foundation — toolkits define repeatable module patterns on top of it.

## The Framework

Anvil gives you five primitives and stays out of the way. It has no opinions about your domain, your database schema, your module shape, or your platform features. Everything concrete comes from packages that extend the framework through TypeScript declaration merging.

```ts
// compose.config.ts — one file declares your entire app
import { defineApp } from '@ydtb/anvil'
import { postgres } from '@ydtb/anvil-layer-postgres'
import { pino } from '@ydtb/anvil-layer-pino'
import { betterAuth } from '@ydtb/anvil-layer-auth'

export default defineApp({
  brand: { name: 'My App' },

  layers: {
    database: postgres({ url: process.env.DATABASE_URL! }),
    logging: pino({ level: 'info' }),
    auth: betterAuth({ secret: process.env.AUTH_SECRET! }),
  },

  extensions: [search, notifications, onboarding],
})
```

### Primitives

| Primitive | What | Example |
|---|---|---|
| **Composition** | `defineApp` + `defineExtension` — the application root | Brand, layers, extensions, middleware |
| **Layers** | Swappable infrastructure behind `getLayer()` | Database, cache, email, storage, auth, logging, errors, jobs |
| **Hooks** | Cross-module runtime communication | Actions (request/response), broadcasts (events), filters (pipelines) |
| **Extensions** | App-level systems that define contribution contracts | Onboarding, search, dashboard, notifications |
| **Client Primitives** | Guards, route layouts, portals, context providers | Route access checks, layout containers, content injection slots |

### Framework Ships Empty

`LayerMap` is an empty interface — installing a layer package fills it in:

```ts
// Install @ydtb/anvil-layer-postgres → LayerMap gains 'database'
// Install @ydtb/anvil-layer-redis → LayerMap gains 'cache'
// Install @ydtb/anvil-layer-auth → LayerMap gains 'auth'
// Miss one in defineApp → TypeScript error at compile time
```

Same pattern for extensions. `ClientContributions` and `ServerContributions` are empty interfaces augmented by extension packages — modules get autocomplete for fields defined by installed extensions.

### Server

```ts
import { createServer } from '@ydtb/anvil-server'

const server = createServer({
  config: composeConfig,
  middleware: [
    { id: 'auth', handler: authMiddleware(), priority: 10 },
  ],
  routes: { auth: authApp, settings: settingsApp },
})

await server.start()
Bun.serve({ port: 3000, fetch: server.app.fetch })
```

`createServer` boots layers via Effect (dependency graph resolved automatically), creates a Hono app, mounts routes, and installs health checks at `/healthz` and `/readyz`. Modules access infrastructure through `getLayer('database')` — never direct imports. Effect manages lifecycle internally; module authors write plain `async/await` TypeScript.

### What a Toolkit Does

A toolkit defines a **module system** on top of the framework. It decides what a "module" looks like in your application — what it exports, how it's discovered, how its surfaces are processed.

The framework doesn't know or care what shape your modules take. One toolkit might call them "tools" with scope hierarchies. Another might call them "widgets" with a flat registry. Another might call them "plugins" with dependency chains. The framework provides composition, layers, hooks, and extensions. The toolkit provides the repeatable structure that module authors follow.

---

## The Scope Toolkit (`@ydtb/anvil-toolkit`)

`@ydtb/anvil-toolkit` is the first toolkit built on Anvil. It provides the **tool/scope pattern** — a module system where self-contained business features (tools) are organized into a hierarchical scope tree.

```ts
import { defineScope, defineTool } from '@ydtb/anvil-toolkit/core'

const contacts = defineTool({ id: 'contacts', name: 'Contacts', package: '@myapp/contacts' })
const billing = defineTool({ id: 'billing', name: 'Billing', package: '@myapp/billing' })
const team = defineTool({ id: 'team', name: 'Team', package: '@myapp/team' })

export const scopeTree = defineScope({
  type: 'workspace',
  label: 'Workspace',
  urlPrefix: '/w/$scopeId',
  includes: [contacts, billing, team],
  children: [
    defineScope({
      type: 'project',
      label: 'Project',
      urlPrefix: '/p/$scopeId',
      includes: [contacts, team],
    }),
  ],
})
```

### Toolkit Primitives

| Primitive | What | Example |
|---|---|---|
| **Tools** | `defineTool` + `defineClient` + `defineServer` — business features | Contacts, billing, team — each a self-contained package |
| **Scopes** | `defineScope` — organizational hierarchy and routing | Workspace > Company > Project |
| **Scope Utilities** | Hierarchy queries and chain traversal | `getScopeHierarchy`, `resolveLowestFirst`, `buildScopeChain` |

### Tools

Each tool is a package that exports what it contributes to the server and client:

```ts
// tools/contacts/server.ts
import { defineServer } from '@ydtb/anvil-toolkit/core'
import { Hono } from 'hono'
import { getLayer } from '@ydtb/anvil-server'

const router = new Hono()
router.get('/list', async (c) => {
  const { db } = getLayer('database')
  const contacts = await db.select().from(contactsTable)
  return c.json({ contacts })
})

export default defineServer({ router })
```

```ts
// tools/contacts/client.ts
import { defineClient } from '@ydtb/anvil-toolkit/core'

export default defineClient({
  routes: [
    { path: 'contacts', component: () => import('./pages/list'), layout: 'workspace' },
    { path: 'contacts/:id', component: () => import('./pages/detail'), layout: 'workspace' },
  ],
  navigation: [
    { label: 'Contacts', path: 'contacts', icon: 'Users' },
  ],
})
```

### Toolkit Server

`createToolServer` extends the framework's `createServer` with tool surface processing — it collects hooks, mounts routers, gathers extension contributions, and auto-wires jobs:

```ts
import { createToolServer } from '@ydtb/anvil-toolkit/server'

const server = createToolServer({
  config: composeConfig,
  tools: [{ id: 'contacts', module: { default: contactsServer } }],
  middleware: [
    { id: 'auth', handler: authMiddleware(), priority: 10 },
  ],
  routes: { auth: authApp },
})

await server.start()
```

### Toolkit Client

`createAnvilApp` assembles the context stack (scope, layers, contributions, providers) around your routing. Bring your own router — the framework provides context, you own routing:

```tsx
import { createAnvilApp } from '@ydtb/anvil-toolkit/client'
import { RouterProvider } from '@tanstack/react-router'

const { App, contributions, routes } = createAnvilApp({
  scopeTree,
  tools: toolClientSurfaces,
  providers: [queryProvider, authProvider],
  router: <RouterProvider router={myRouter} />,
})

createRoot(document.getElementById('app')!).render(<App />)
```

Tools inject into the app shell via portals (`HeaderPortal`, `SidebarPortal` from `@ydtb/anvil-toolkit/client`), backed by the framework's generic slot system (`PortalProvider`, `PortalSlot` from `@ydtb/anvil-client`).

---

## Layers

Swap infrastructure with one line. Same app, different layers:

```ts
// Production
database: postgres({ url: process.env.DATABASE_URL!, pool: 20 }),

// Development
database: postgres({ url: 'postgresql://localhost:5432/dev', pool: 5 }),

// Tests
database: testPostgres({ url: process.env.TEST_DATABASE_URL! }),
```

Every layer has a production variant and a dev/test variant. Same contract, swap one line.

| Package | Layer Key | Production | Dev/Test |
|---|---|---|---|
| `@ydtb/anvil-layer-postgres` | `database` | `postgres()` | `testPostgres()` |
| `@ydtb/anvil-layer-redis` | `cache` | `redis()` | `memory()` |
| `@ydtb/anvil-layer-pino` | `logging` | `pino()` | `silent()` |
| `@ydtb/anvil-layer-auth` | `auth` | `betterAuth()` | `mockAuth()` |
| `@ydtb/anvil-layer-bullmq` | `jobs` | `bullmq()` | `memoryJobs()` |
| `@ydtb/anvil-layer-resend` | `email` | `resend()` | `consoleEmail()` |
| `@ydtb/anvil-layer-s3` | `storage` | `s3()` | `memoryStorage()` |
| `@ydtb/anvil-layer-sentry` | `errors` | `sentry()` | `noopErrors()` |

### Creating Your Own Layer

```ts
import { Effect, Layer } from 'effect'
import { createLayerConfig, getLayerTag } from '@ydtb/anvil-server'

export interface RealtimeLayer {
  readonly broadcast: (channel: string, data: unknown) => Promise<void>
}

declare module '@ydtb/anvil' {
  interface LayerMap {
    realtime: RealtimeLayer
  }
}

const tag = getLayerTag<RealtimeLayer>('realtime')

export function pusher(config: { appId: string }): LayerConfig<'realtime'> {
  return createLayerConfig('realtime', Layer.succeed(tag, {
    broadcast: async (channel, data) => { /* ... */ },
  }))
}
```

---

## Build & Dev

```ts
// vite.config.ts
import { createViteConfig } from '@ydtb/anvil-build/vite'
import { toolkitModules } from '@ydtb/anvil-toolkit/build'

export default createViteConfig({
  appConfig: config,
  serverPort: 3001,
  virtualModules: toolkitModules(config),
})
```

Single-process dev with Vite HMR (including WebSocket proxy for reverse proxies):

```ts
import { createDevMiddleware } from '@ydtb/anvil-build'

const dev = await createDevMiddleware({ root: process.cwd() })

const server = createToolServer({
  config,
  tools,
  middleware: [dev],
})

await server.start()

Bun.serve({
  port: 3000,
  fetch(req, srv) {
    if (dev.handleUpgrade(req, srv)) return  // HMR WebSocket
    return server.app.fetch(req)
  },
  websocket: dev.websocket,
})
```

---

## Packages

### Core Framework

| Package | What |
|---|---|
| `@ydtb/anvil` | Core types — `defineApp`, `defineExtension`, `LayerMap`, `ClientContributions`, `ServerContributions` |
| `@ydtb/anvil-server` | Server runtime — `createServer`, `createWorker`, `getLayer`, `getHooks`, `fromOrpc`, request context, health checks, SPA handler, `onExtensionBoot`/`onExtensionShutdown` |
| `@ydtb/anvil-hooks` | Hook system — actions, broadcasts, filters, typed wrappers, side-channels |
| `@ydtb/anvil-build` | Build system — Vite/Rollup plugin, `createDevMiddleware` (HMR + WebSocket proxy), Vite config helper |
| `@ydtb/anvil-client` | Client runtime — `defineGuard`, `defineRouteLayout`, `defineContextProvider`, `ContextProviderStack`, `useLayer`, `useScope`, `PortalProvider`, `PortalSlot`, `Portal` |

### Scope Toolkit

| Package | What |
|---|---|
| `@ydtb/anvil-toolkit/core` | Universal — `defineTool`, `defineScope`, `defineClient`, `defineServer`, scope hierarchy utilities, chain traversal |
| `@ydtb/anvil-toolkit/client` | React — `createAnvilApp`, `assembleRoutes`, `HeaderPortal`, `SidebarPortal`, scope client utilities |
| `@ydtb/anvil-toolkit/server` | Server — `createToolServer`, `createToolWorker`, tool surface processing |
| `@ydtb/anvil-toolkit/build` | Build — `toolkitModules` (virtual module generators for tool discovery) |

---

## Key Design Decisions

- **Effect is internal.** Tool authors write plain `async/await` TypeScript. Effect manages layer lifecycle (acquire/release, dependency graphs, shutdown) behind the scenes.
- **Framework ships empty.** No hardcoded layers, no hardcoded extensions. Everything comes from packages via TypeScript declaration merging.
- **Surfaces for structure, hooks for runtime.** Tool surfaces declare what a tool IS (routes, navigation, permissions). Hooks handle what HAPPENS (events, reactions, data transformation).
- **Hono for HTTP.** Lightweight, Web Standard API, runtime portable (Node/Bun/Deno/edge).
- **Edge compatible by design.** The framework avoids Node-only patterns. Layer implementations determine runtime compatibility — swap `postgres()` for `neon-http()` and deploy to the edge.
- **Type safety is a principle.** No `any` in public interfaces. Framework APIs should never require casts to use correctly.

## Testing

Every layer has a dev/test variant. No mocking framework needed:

```ts
import { silent } from '@ydtb/anvil-layer-pino/silent'
import { memory } from '@ydtb/anvil-layer-redis/memory'
import { mockAuth } from '@ydtb/anvil-layer-auth/mock'

defineApp({
  layers: {
    logging: silent(),
    cache: memory(),
    auth: mockAuth({ users: [{ id: 'usr_1', email: 'test@test.com', name: 'Test' }] }),
  },
})
```

Run all tests: `bun run test` (uses Turborepo across all packages).

## Documentation

- **[Getting Started](docs/GETTING_STARTED.md)** — build an Anvil app from scratch
- **[API Reference](docs/API_REFERENCE.md)** — every exported function and type
- **[Design Document](docs/DESIGN.md)** — full architecture and rationale
- **[Lifecycle](docs/LIFECYCLE.md)** — server, client, and extension lifecycle phases
- **[Packaging Model](docs/PACKAGING.md)** — three-layer model (framework, domain, app)
- **[Toolkit Separation](docs/TOOLKIT_REFACTOR.md)** — framework vs toolkit boundary

## Status

14 packages, 166+ tests, production-ready foundation. The [YDTB](https://github.com/yourdigitaltoolbox) project is the first consumer, actively migrating to Anvil.

## License

MIT
