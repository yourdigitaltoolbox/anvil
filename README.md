# Anvil

A composable full-stack framework for building extensible applications with swappable infrastructure and pluggable module systems. Anvil provides the generic foundation -- toolkits define the module patterns on top of it.

## What It Does

Anvil lets you compose an application from independent pieces:

```ts
// compose.config.ts — one file declares your entire app
import { defineApp } from '@ydtb/anvil'
import { scope } from '@ydtb/anvil-toolkit'
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

  scopes: scope({
    type: 'workspace',
    label: 'Workspace',
    urlPrefix: '/w/$scopeId',
    includes: [contacts, billing, team],
  }),
})
```

Tools are self-contained business features defined via `@ydtb/anvil-toolkit`. Each exports what it contributes to the server and client:

```ts
// tools/contacts/server.ts
import { defineServer } from '@ydtb/anvil-toolkit'
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

Swap infrastructure with one line. Same app, different layers:

```ts
// Production
database: postgres({ url: process.env.DATABASE_URL!, pool: 20 }),

// Development
database: postgres({ url: 'postgresql://localhost:5432/dev', pool: 5 }),

// Tests
database: testPostgres({ url: process.env.TEST_DATABASE_URL! }),
```

## Core Primitives

| Primitive | What | Example |
|---|---|---|
| **Composition** | `defineApp` + `defineExtension` — the application root | Brand, layers, extensions |
| **Layers** | Swappable infrastructure behind `getLayer()` | Database, cache, email, storage, auth, logging, errors, jobs |
| **Hooks** | Cross-module runtime communication | Actions (request/response), broadcasts (events), filters (pipelines) |
| **Extensions** | App-level systems modules contribute to | Onboarding, search, dashboard, notifications |

### Toolkits

Toolkits define module systems on top of the generic framework. `@ydtb/anvil-toolkit` provides the **tool/scope pattern** -- a module system where self-contained business features (tools) are organized into a scope hierarchy:

| Toolkit Primitive | What | Example |
|---|---|---|
| **Tools** | `defineTool` + `defineClient` + `defineServer` — business features | Contacts, billing, team -- each a self-contained package |
| **Scopes** | `scope` — organizational hierarchy and routing | Workspace > Company > Project |

## Framework Ships Empty

Anvil has no opinions about your infrastructure. `LayerMap` is an empty interface — installing a layer package fills it in:

```ts
// Install @ydtb/anvil-layer-postgres → LayerMap gains 'database'
// Install @ydtb/anvil-layer-redis → LayerMap gains 'cache'
// Install @ydtb/anvil-layer-auth → LayerMap gains 'auth'
// Miss one in defineApp → TypeScript error at compile time
```

Same pattern for tool surfaces. Extensions augment `ClientContributions` and `ServerContributions` — tools get autocomplete for fields defined by installed extensions.

## Packages

### Core Framework

| Package | What |
|---|---|
| `@ydtb/anvil` | Core types -- `defineApp`, `defineExtension`, `LayerMap`, `ClientContributions`, `ServerContributions` |
| `@ydtb/anvil-server` | Server runtime -- `createServer`, `createWorker`, `getLayer`, `getHooks`, request context, health checks, SPA handler |
| `@ydtb/anvil-hooks` | Hook system -- actions, broadcasts, filters, typed wrappers, side-channels |
| `@ydtb/anvil-build` | Build system -- Vite/Rollup plugin, dev server, Vite config helper |
| `@ydtb/anvil-client` | Client runtime -- `useLayer`, `useScope`, `useAuth`, `LayerProvider`, `AuthProvider` |

### Toolkits

| Package | What |
|---|---|
| `@ydtb/anvil-toolkit` | Tool/scope module system -- `defineTool`, `scope`, `defineClient`, `defineServer`, `createToolServer`, `toolEntry`, `assembleRoutes`, `createAnvilApp` |
| `@ydtb/anvil-toolkit/build` | Build integration -- `toolkitModules` (virtual module generators for tool discovery) |

### Layer Packages

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

## How It Works

### Server (framework)

```ts
import { createServer } from '@ydtb/anvil-server'

const server = createServer({
  config: composeConfig,
  middleware: [
    { id: 'auth', handler: authMiddleware(), priority: 10 },
    { id: 'scope', handler: scopeMiddleware(), priority: 20 },
  ],
  routes: { auth: authApp },
})

await server.start()
```

`createServer` boots layers via Effect (dependency graph resolved automatically), creates a Hono app, mounts routes, and installs health checks at `/healthz` and `/readyz`.

### Server (with toolkit)

When using `@ydtb/anvil-toolkit`, `createToolServer` extends `createServer` with tool surface processing:

```ts
import { createToolServer, toolEntry } from '@ydtb/anvil-toolkit'

const server = createToolServer({
  config: composeConfig,
  tools: [toolEntry('contacts', contactsServer)],
  middleware: [
    { id: 'auth', handler: authMiddleware(), priority: 10 },
    { id: 'scope', handler: scopeMiddleware(), priority: 20 },
  ],
  routes: { auth: authApp },
})

await server.start()
```

### Client (with toolkit)

```tsx
import { createAnvilApp } from '@ydtb/anvil-toolkit'

const { App } = createAnvilApp({
  scopeTree,
  tools: toolClientSurfaces,
  auth: { loginPath: '/login' },
  layers: { analytics: posthog({ apiKey: '...' }) },
})

createRoot(document.getElementById('app')!).render(<App />)
```

### Build

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

The toolkit build integration auto-discovers tools from your scope tree and generates `virtual:anvil/server-tools`, `virtual:anvil/schema`, `virtual:anvil/scope-tree`, and more.

### Dev Server

```ts
import { createDevServer } from '@ydtb/anvil-build'

createDevServer({
  serverEntry: './server/index.ts',
  clientEntry: './client/main.tsx',
  serverPort: 3001,
  clientPort: 3000,
})
```

One command starts Bun with file watching for the server and Vite with HMR for the client.

## Key Design Decisions

- **Effect is internal.** Tool authors write plain `async/await` TypeScript. Effect manages layer lifecycle (acquire/release, dependency graphs, shutdown) behind the scenes.
- **Framework ships empty.** No hardcoded layers, no hardcoded extensions. Everything comes from packages via TypeScript declaration merging.
- **Surfaces for structure, hooks for runtime.** Tool surfaces declare what a tool IS (routes, navigation, permissions). Hooks handle what HAPPENS (events, reactions, data transformation).
- **Hono for HTTP.** Lightweight, Web Standard API, runtime portable (Node/Bun/Deno/edge).
- **Edge compatible by design.** The framework avoids Node-only patterns. Layer implementations determine runtime compatibility — swap `postgres()` for `neon-http()` and deploy to the edge.

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

## Status

13 packages, 145+ tests, production-ready foundation. The [YDTB](https://github.com/yourdigitaltoolbox) project is the first consumer, actively migrating to Anvil.

## License

MIT
