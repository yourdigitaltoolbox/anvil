# Anvil — Framework Design

A composable full-stack plugin framework where tools, scopes, and layers are first-class primitives. Effect powers the server runtime internally; tool authors write plain TypeScript.

**Package namespace:** `@ydtb/anvil-*` (published under the `@ydtb` npm org)

---

## Core Primitives

Anvil has four primitives. Everything else — HTTP, React, database, jobs — is an implementation detail provided by layers or tools.

```
┌─────────────────────────────────────────────────────────┐
│                    COMPOSITION ROOT                      │
│                  compose.config.ts                        │
│                                                          │
│  Brand · Scope Tree · Tool Includes · Layer Providers    │
└──────────────────────┬───────────────────────────────────┘
                       │
        ┌──────────────┼──────────────────┐
        │              │                  │
   ┌────▼─────┐  ┌────▼──────┐   ┌──────▼──────┐
   │  TOOLS   │  │  LAYERS   │   │  SCOPES     │
   │          │  │           │   │             │
   │ Client + │  │ Swappable │   │ Nested      │
   │ Server   │  │ infra     │   │ hierarchy   │
   │ surfaces │  │ contracts │   │ with tool   │
   │          │  │           │   │ opt-in      │
   └────┬─────┘  └─────┬─────┘   └──────┬──────┘
        │              │                 │
   ┌────▼──────────────▼─────────────────▼──────┐
   │              HOOK SYSTEM                     │
   │    Cross-tool communication bus              │
   │    Actions · Broadcasts · Filters            │
   └──────────────────────────────────────────────┘
```

### 1. Composition

The composition root (`compose.config.ts`) is the single source of truth for what the app is made of. Brand identity, scope hierarchy, tool includes, and layer providers — all declared in one file.

### 2. Tools

The unit of functionality. Each tool is a package that exports a client surface (routes, nav, permissions, cards, settings) and a server surface (schema, router, hooks, jobs, resources). Tools don't know about each other — they communicate through hooks.

### 3. Layers

Swappable infrastructure. Database, cache, jobs, email, logging, error reporting, storage — each is a contract with pluggable implementations. Swap one line in the composition root to change the implementation. Effect manages lifecycle internally.

### 4. Hooks

The cross-tool communication bus. Actions (request/response, exactly one handler), broadcasts (fire-and-forget, N listeners), filters (value transformation pipeline). Late-bound, dynamic, string-keyed — with optional typed wrappers for compile-time safety.

---

## Composition Root

```ts
// compose.config.ts
import { defineApp, defineTool, scope } from '@ydtb/anvil'
import { postgres } from '@ydtb/anvil-layer-postgres'
import { redis } from '@ydtb/anvil-layer-redis'
import { bullmq } from '@ydtb/anvil-layer-bullmq'
import { pino } from '@ydtb/anvil-layer-pino'
import { sentry } from '@ydtb/anvil-layer-sentry'
import { resend } from '@ydtb/anvil-layer-resend'
import { s3 } from '@ydtb/anvil-layer-s3'

// Tools
import { dashboard } from '@myapp/dashboard'
import { billing } from '@myapp/billing'
import { contacts } from '@myapp/contacts'
import { team } from '@myapp/team'
import { offers } from '@myapp/offers'

export default defineApp({
  brand: { name: 'My App' },

  // Infrastructure — swap any line to change the implementation
  layers: {
    database: postgres({ url: env.DATABASE_URL, pool: 10 }),
    cache: redis({ url: env.REDIS_URL }),
    jobs: bullmq({ redis: env.REDIS_URL }),
    logging: pino({ level: 'info' }),
    errors: sentry({ dsn: env.SENTRY_DSN }),
    email: resend({ apiKey: env.RESEND_API_KEY }),
    storage: s3({ bucket: env.S3_BUCKET }),
  },

  // Scope hierarchy — each level opts into tools
  scopes: scope({
    type: 'system', label: 'System', urlPrefix: '/s',
    includes: [dashboard],
    children: [
      scope({
        type: 'company', label: 'Company', urlPrefix: '/c/$scopeId',
        includes: [dashboard, billing, team],
        children: [
          scope({
            type: 'location', label: 'Location', urlPrefix: '/l/$scopeId',
            includes: [dashboard, billing, contacts, team, offers],
          }),
        ],
      }),
    ],
  }),
})
```

### Compile-Time Verification

`defineApp` requires all layer keys. Omit one and TypeScript errors:

```ts
// Level 1: Required fields — miss a layer, get a compile error
interface RequiredLayers {
  database: LayerConfig<'database'>
  cache: LayerConfig<'cache'>
  jobs: LayerConfig<'jobs'>
  logging: LayerConfig<'logging'>
  errors: LayerConfig<'errors'>
  email: LayerConfig<'email'>
  storage: LayerConfig<'storage'>
}

function defineApp(config: {
  brand: BrandConfig
  layers: RequiredLayers    // ← omit any key → compile error
  scopes: ScopeTree
}): AppConfig
```

```ts
// Level 2 (future): Tools declare their requirements
export default defineServer({
  requires: ['database', 'email'] as const,
  // ...
})
// The virtual module plugin collects all requires from all tools.
// If a tool needs 'storage' but compose.config doesn't provide it → compile error.
```

### Swap for Testing

```ts
// test/test-app.config.ts
import { testPostgres } from '@ydtb/anvil-layer-postgres/test'
import { memory as memoryCache } from '@ydtb/anvil-layer-redis/memory'
import { console as consoleJobs } from '@ydtb/anvil-layer-bullmq/console'
import { silent } from '@ydtb/anvil-layer-pino/silent'
import { noop as noopErrors } from '@ydtb/anvil-layer-sentry/noop'
import { console as consoleEmail } from '@ydtb/anvil-layer-resend/console'
import { memory as memoryStorage } from '@ydtb/anvil-layer-s3/memory'

export default defineApp({
  brand: { name: 'Test' },
  layers: {
    database: testPostgres(),
    cache: memoryCache(),
    jobs: consoleJobs(),
    logging: silent(),
    errors: noopErrors(),
    email: consoleEmail(),     // logs emails instead of sending
    storage: memoryStorage(),  // in-memory file storage
  },
  scopes: scope({ /* ... */ }),
})
```

One import swap per layer. No `vi.mock()`. No patching globals.

---

## Where Effect Lives

Effect powers the server runtime internally. Tool authors never touch it unless they choose to.

```
                            ┌─────────────────────────┐
                            │   Tool Code (plain TS)   │
                            │                          │
                            │  async/await             │
                            │  getLayer('database')    │
                            │  doAction('billing:x')   │
                            │  broadcast('event', {})  │
                            └────────────┬─────────────┘
                                         │
                                         │  getLayer() reads from
                                         │  ManagedRuntime context
                                         │
┌────────────────────────────────────────▼──────────────────────────────────────┐
│                        @ydtb/anvil-server (Effect inside)                        │
│                                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Layer.scoped │  │ acquireRelease│  │ ManagedRuntime│  │ Layer.mergeAll│     │
│  │ (lifecycle)  │  │ (cleanup)    │  │ (DI container)│  │ (composition) │     │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                                               │
│  Resolves dependency graph · Acquires resources in order · Guarantees cleanup  │
│  Health checks from layer registry · Shutdown in reverse order                │
└───────────────────────────────────────────────────────────────────────────────┘
```

### What Effect Gives Us (that we can't easily build)

- **`Layer.mergeAll`** resolves the dependency graph. If `BullMQLayer` depends on `RedisLayer`, Effect figures out boot order.
- **`acquireRelease`** guarantees cleanup even on interruption — not just `try/finally` but fiber-safe.
- **`ManagedRuntime.dispose()`** tears down everything in reverse order. One call. No manual cleanup registry.
- **Typed errors** available to tool authors who opt in.
- **Retry/timeout/concurrency** combinators for tool business logic (opt-in).

### What We Don't Expose

- No `Effect<A, E, R>` in tool code (unless the tool opts in)
- No `pipe`, `flatMap`, `gen` required
- No `Context.Tag` in tool code
- Tools write normal `async/await` TypeScript

### Opt-In Effect for Tool Authors

A tool author who WANTS typed errors and Effect composition can use it directly:

```ts
// A tool that opts into Effect for its own business logic
import { Effect } from 'effect'
import { Database } from '@ydtb/anvil-layer-postgres'

export const deductWallet = (input: DeductInput) =>
  Effect.gen(function* () {
    const { db } = yield* Database
    const wallet = yield* lockWalletForUpdate(db, input.walletId)

    if (wallet.status !== 'active')
      return yield* Effect.fail(new InactiveWalletError({ walletId: input.walletId }))

    if (newBalance < floor)
      return yield* Effect.fail(new InsufficientBalanceError({ ... }))

    yield* updateBalance(db, input.walletId, newBalance)
    return wallet
  })
// Type: Effect<Wallet, InactiveWalletError | InsufficientBalanceError, Database>
```

Both styles coexist. The framework doesn't force either.

---

## Layer System

### Layer Contract

Each layer is defined by a TypeScript interface (the contract) and one or more factory functions (implementations):

```ts
// @ydtb/anvil — layer contract types

export interface DatabaseLayer {
  readonly db: DrizzleClient
}

export interface CacheLayer {
  readonly get: (key: string) => Promise<string | null>
  readonly set: (key: string, value: string, ttlSeconds?: number) => Promise<void>
  readonly del: (key: string) => Promise<void>
}

export interface JobLayer {
  readonly registerCron: (job: JobDefinition) => void
  readonly executeJob: (job: JobDefinition) => Promise<void>
}

export interface LogLayer {
  readonly logger: Logger
}

export interface ErrorLayer {
  readonly capture: (err: Error, context?: Record<string, unknown>) => void
}

export interface EmailLayer {
  readonly send: (msg: EmailMessage) => Promise<void>
}

export interface StorageLayer {
  readonly put: (key: string, data: Buffer | ReadableStream) => Promise<string>
  readonly get: (key: string) => Promise<Buffer | null>
  readonly delete: (key: string) => Promise<void>
  readonly getUrl: (key: string) => string
}
```

### Layer Implementation (Effect Inside, Plain Outside)

Each layer package exports a factory function. Internally it builds an Effect Layer with `acquireRelease` for lifecycle management. Externally it returns a plain config object:

```ts
// @ydtb/anvil-layer-postgres
import { Layer, Effect, Context } from 'effect'
import type { DatabaseLayer } from '@ydtb/anvil'

// Effect service tag (internal — not exported to consumers)
export class Database extends Context.Tag("@ydtb/anvil/Database")<Database, DatabaseLayer>() {}

// What the user calls
export function postgres(config: { url: string; pool?: number }): LayerConfig<'database'> {
  const effectLayer = Layer.scoped(Database,
    Effect.gen(function* () {
      const connection = yield* Effect.acquireRelease(
        Effect.sync(() => pgConnect(config.url, { max: config.pool ?? 10 })),
        (conn) => Effect.promise(() => conn.end())
      )
      const db = drizzle(connection)
      return { db }
    })
  )

  return {
    id: 'database',
    _effectLayer: effectLayer,
    // Health check — runs inside the managed runtime
    _healthCheck: Effect.gen(function* () {
      const { db } = yield* Database
      const start = Date.now()
      yield* Effect.tryPromise(() => db.execute(sql`SELECT 1`))
      return { status: 'ok' as const, latencyMs: Date.now() - start }
    }),
  }
}
```

```ts
// @ydtb/anvil-layer-postgres/test — test implementation
export function testPostgres(): LayerConfig<'database'> {
  const effectLayer = Layer.scoped(Database,
    Effect.gen(function* () {
      const connection = yield* Effect.acquireRelease(
        Effect.sync(() => pgConnect(testDatabaseUrl, { max: 3 })),
        (conn) => Effect.promise(() => conn.end())
      )
      return { db: drizzle(connection) }
    })
  )
  return { id: 'database', _effectLayer: effectLayer }
}
```

```ts
// @ydtb/anvil-layer-redis/memory — dev/test implementation
export function memory(): LayerConfig<'cache'> {
  const store = new Map<string, { value: string; expiresAt?: number }>()
  const effectLayer = Layer.succeed(Cache, {
    get: async (key) => store.get(key)?.value ?? null,
    set: async (key, value, ttl) => { store.set(key, { value, expiresAt: ttl ? Date.now() + ttl * 1000 : undefined }) },
    del: async (key) => { store.delete(key) },
  })
  return { id: 'cache', _effectLayer: effectLayer }
}
```

### Accessing Layers in Tool Code

Tools use a plain accessor. No Effect knowledge needed:

```ts
// In any tool's server code
import { getLayer } from '@ydtb/anvil-server'

export async function createContact(input: CreateContactInput) {
  const { db } = getLayer('database')
  const { logger } = getLayer('logging')
  const { send } = getLayer('email')

  logger.info({ input }, 'Creating contact')

  const [contact] = await db.insert(contacts).values(input).returning()

  await send({
    to: input.email,
    subject: 'Welcome',
    body: `Welcome, ${input.name}!`,
  })

  return contact
}
```

Under the hood, `getLayer` reads from the `ManagedRuntime` context. The tool author doesn't know or care.

```ts
// @ydtb/anvil-server — getLayer implementation
import { ManagedRuntime } from 'effect'

let _runtime: ManagedRuntime.ManagedRuntime<AppLayers, never> | null = null

export function provideRuntime(runtime: typeof _runtime): void {
  _runtime = runtime
}

export function getLayer<K extends keyof LayerMap>(key: K): LayerMap[K] {
  if (!_runtime) throw new Error('Server not started — layers not available')
  // Reads the service from the managed runtime synchronously
  // (resources are already acquired during boot)
  return _runtime.runSync(Effect.service(layerTags[key]))
}
```

---

## Tool Contract

Each tool is a package with three exports:

| Export | File | Purpose |
|--------|------|---------|
| `./client` | `src/client.ts` | `Client` — routes, nav, permissions, settings, cards |
| `./server` | `src/server.ts` | `Server` — schema, router, hooks, jobs, resources |
| `./types` | `src/types.ts` | Action interfaces, permission constants, event types |

### Tool Descriptor

```ts
// tools/contacts/src/index.ts
import { defineTool } from '@ydtb/anvil'

export const contacts = defineTool({
  id: 'contacts',
  name: 'Contacts',
  package: '@myapp/contacts',
})
```

### Client Surface

Declarative object — routes, navigation, cards, permissions, settings, etc. Scoped features are auto-wired per scope that includes the tool. Non-scoped features are registered globally.

```ts
// tools/contacts/src/client.ts
import { createApiClient } from '@ydtb/anvil/client'
import type { ContactsRouter } from './api/router'
import type { Client } from '@ydtb/anvil/client'

export const contactsApi = createApiClient<ContactsRouter>('contacts')

const surface: Client = {
  // Scoped (auto-wired per including scope)
  routes: [
    {
      path: 'contacts',
      component: () => import('./routes/contacts-page'),
      loader: async ({ scopeChain }) => {
        // Server-side data loading (Tier 3 — wired up when streaming SSR is ready)
      },
    },
    { path: 'contacts/:id', component: () => import('./routes/contact-detail') },
  ],
  navigation: [
    { label: 'Contacts', path: 'contacts', icon: 'Users' },
  ],
  permissions: [
    {
      feature: 'contacts',
      label: 'Contacts',
      actions: [
        { key: 'contacts.view', label: 'View contacts', category: 'read' },
        { key: 'contacts.manage', label: 'Create and edit contacts', category: 'write' },
        { key: 'contacts.delete', label: 'Delete contacts', category: 'admin' },
      ],
    },
  ],
}

export default surface
```

### Server Surface

```ts
// tools/contacts/src/server.ts
import type { Server } from '@ydtb/anvil/server'
import { contacts, contactNotes } from './db/schema'
import { contactsRouter } from './api/router'

const surface: Server = {
  schema: { contacts, contactNotes },
  router: contactsRouter,

  hooks: {
    actions: {
      'contacts:get': getContactHandler,
      'contacts:search': searchContactsHandler,
    },
    broadcasts: {
      'scope:entity_deleted': onScopeDeleted,
    },
  },

  jobs: [
    {
      id: 'contacts-cleanup',
      label: 'Purge soft-deleted contacts older than 90 days',
      schedule: '0 3 * * *',
      handler: purgeDeletedContacts,
    },
  ],

  // Optional — declares external resources this tool needs
  requires: ['database', 'email'] as const,
}

export default surface
```

---

## Server Runtime

### createServer

```ts
// apps/main/server/index.ts
import { createServer } from '@ydtb/anvil-server'
import { tools } from 'virtual:app/server-tools'
import composeConfig from '../compose.config'

const server = createServer({
  config: composeConfig,
  tools,
  port: Number(process.env.PORT) || 3000,
})

server.start()
```

Internally, `createServer`:

1. **Composes Effect layers** — `Layer.mergeAll(...config.layers.map(l => l._effectLayer))`, resolving dependency graph
2. **Creates ManagedRuntime** — acquires all resources in dependency order
3. **Installs request context** — `AsyncLocalStorage<RequestContext>` with `requestId`, `userId`, `scopeId`, child logger
4. **Runs infrastructure boot** — scope registry, permissions, activity, notifications
5. **Processes tool server surfaces** — routers, hooks, jobs, schema
6. **Mounts HTTP routes** — RPC at `/api/rpc/{toolId}/*`, auth at `/api/auth/**`
7. **Mounts health checks** — `/healthz` (liveness), `/readyz` (auto-derived from layer health checks)
8. **Boots background jobs** — cron scheduler + trigger listeners
9. **Scope-aware SPA handler** — parses scope from URL, returns branded HTML shell (streaming SSR-ready)
10. **Installs shutdown hooks** — `SIGTERM`/`SIGINT` → `ManagedRuntime.dispose()` → all resources released in reverse order

### createWorker

Same tool surfaces, no HTTP. Separate entry point, separate process:

```ts
// apps/main/server/worker.ts
import { createWorker } from '@ydtb/anvil-server/worker'
import { tools } from 'virtual:app/server-tools'
import composeConfig from '../compose.config'

const worker = createWorker({
  config: composeConfig,
  tools,
})

worker.start()
```

### Request Context

Every request is wrapped in `AsyncLocalStorage`. Available everywhere — inside handlers, hooks, broadcasts, database queries:

```ts
import { getRequestContext, getLogger } from '@ydtb/anvil-server'

// In any server-side code
const ctx = getRequestContext()
ctx?.requestId  // 'abc-123'
ctx?.userId     // 'usr_456'
ctx?.scopeId    // 'loc_789'

const logger = getLogger()  // child logger with requestId, userId, scopeId baked in
logger.info('Processing request')
// → {"requestId":"abc-123","userId":"usr_456","scopeId":"loc_789","msg":"Processing request"}
```

---

## Scope-Aware Rendering

The SPA handler is a real server function with database access. Three tiers, designed from day one to support all three:

### Tier 1: Scope-Branded Shell (implement now)

Server parses URL, looks up scope brand data (name, logo, color), returns branded HTML before JS loads. Each scope gets its own loading screen.

```
GET /c/co_abc123/contacts

1. Parse URL → scopeId = co_abc123
2. Query scope brand data (~5ms)
3. Return HTML with branded loading screen (logo, brand color)
4. JS downloads in background
5. React hydrates, takes over
```

### Tier 2: Streaming SSR Shell (backlog)

React `renderToReadableStream`. Layout (header, sidebar, skeletons) flushes immediately. Content streams in as data loads server-side.

### Tier 3: Per-Route Server Loaders (backlog)

Tools opt into server-side data loading via `RouteEntry.loader`. Pages with loaders render with real data on first paint — no client-side spinner.

### Architectural Requirements

The Tier 1 handler must be built so Tiers 2 and 3 are enhancements, not rewrites:

1. SPA handler is a real function (not static file serve) with DB access
2. Scope extraction from URL is a shared utility using the scope tree from compose.config
3. Brand lookup is cached in request context (queried once, reused)
4. Handler returns `Response` object (swappable to `ReadableStream` for Tier 2)
5. Route definitions available on the server (virtual module) for Tier 3 URL matching
6. `RouteEntry.loader` stays in the type and is wired up when Tier 3 is implemented

---

## Hook System

Cross-tool communication. Late-bound, dynamic, string-keyed. Three primitives:

| Primitive | Registration | Dispatch | Cardinality | Use Case |
|-----------|-------------|----------|-------------|----------|
| **Action** | `addAction` | `doAction` / `tryAction` | Exactly 1 handler | Cross-tool RPC with return value |
| **Broadcast** | `onBroadcast` | `broadcast` | 0-N listeners | Fire-and-forget notifications |
| **Filter** | `addFilter` | `applyFilterSync` | 0-N in pipeline | Value transformation |

### Typed Wrappers (compile-time safety)

Each tool exports event types from `./types`. Typed wrappers catch typos and payload mismatches at compile time:

```ts
// tools/billing/src/types.ts
export interface BillingEvents {
  'wallet:depleted': { walletId: string; scopeId: string }
  'wallet:credited': { walletId: string; amount: number; scopeId: string }
}

export interface BillingActions {
  'billing:deduct': {
    input: { walletId: string; amount: number; description: string }
    output: { transactionId: string; newBalance: number }
  }
}
```

```ts
// Usage — typed, compile-time checked
import { typedBroadcast } from '@ydtb/anvil-hooks'
typedBroadcast('wallet:depleted', { walletId, scopeId })
//                                 ^^^^^^^^^^^^^^^^^^^^^^^^
//                                 TypeScript enforces this shape

import { typedAction } from '@ydtb/anvil-hooks'
const result = await typedAction<BillingActions>('billing:deduct', { walletId, amount, description })
//     ^? { transactionId: string; newBalance: number }
```

Underlying hook system unchanged. Typed wrappers are compile-time only.

---

## Client Runtime

### Client Layers via React Context

```ts
// compose.config.ts
export default defineApp({
  layers: { /* server layers */ },

  clientLayers: {
    analytics: posthog({ apiKey: env.VITE_POSTHOG_KEY }),
    // Swap for a white-label deploy:
    // analytics: plausible({ domain: 'client.example.com' }),
  },
})
```

```ts
// In any component
import { useLayer } from '@ydtb/anvil-client'

function MyComponent() {
  const analytics = useLayer('analytics')
  analytics.track('page_view', { page: 'contacts' })
}
```

Storybook / component tests:

```tsx
<LayerProvider layers={{
  analytics: noopAnalytics(),
  api: mockApi({ fixtures }),
}}>
  <Story />
</LayerProvider>
```

### Per-Tool API Clients

Each tool gets a typed API client scoped to its router:

```ts
import { contactsApi } from '@myapp/contacts/client'
const { data } = useQuery(contactsApi.getContact.queryOptions({ input: { id } }))
```

Cross-tool API calls:

```ts
import { billingApi } from '@myapp/billing/client'
const { data } = useQuery(billingApi.getWallet.queryOptions({ input: { scopeId } }))
```

---

## Build System

### `@ydtb/anvil-build`

Workspace-aware build tool. Vite for client, custom for server. No manual aliases.

```ts
// apps/main/build.config.ts
import { defineBuild } from '@ydtb/anvil-build'
import composeConfig from './compose.config'

export default defineBuild({
  config: composeConfig,

  client: {
    framework: 'react',
    entry: './client/main.tsx',
  },

  server: {
    entry: './server/index.ts',
    workerEntry: './server/worker.ts',
    // No manual aliases — resolved from workspace package.json exports
  },
})
```

### What it does

1. Scans the monorepo workspace for all packages
2. Reads each `package.json` exports map to resolve aliases automatically
3. Passes virtual module plugin to both client and server builds
4. Client build: Vite (HMR, code splitting, tree shaking)
5. Server build: tsup/esbuild (fast, workspace-aware)
6. Outputs `dist/client/` (SPA) + `dist/server.mjs` + `dist/worker.mjs`

### Dev Server

In development:
- Vite dev server for the client (HMR)
- Server process with watch mode (restarts on server file changes)
- Proxy from Vite to the server for `/api/*` routes

No "Nitro embedded in Vite" — clean separation.

---

## Package Map

### Core Framework

| Package | Purpose | Uses Effect? |
|---------|---------|-------------|
| `@ydtb/anvil` | `defineApp`, `defineTool`, `scope`, surface types, virtual module plugin | No |
| `@ydtb/anvil-server` | `createServer`, `createWorker`, lifecycle, `getLayer`, request context, logging | Yes (internally) |
| `@ydtb/anvil-hooks` | HookSystem, actions, broadcasts, filters, typed wrappers | No |
| `@ydtb/anvil-build` | Workspace resolver, dev server, production build | No |
| `@ydtb/anvil-client` | Client surface registration, `useLayer`, routing, API client factory | No |

### Layer Packages

Each layer package exports a production factory + dev/test factory:

| Package | Contract | Production | Dev/Test |
|---------|----------|------------|----------|
| `@ydtb/anvil-layer-postgres` | `DatabaseLayer` | `postgres({ url, pool })` | `testPostgres()` |
| `@ydtb/anvil-layer-redis` | `CacheLayer` | `redis({ url })` | `memory()` |
| `@ydtb/anvil-layer-bullmq` | `JobLayer` | `bullmq({ redis })` | `console()` |
| `@ydtb/anvil-layer-pino` | `LogLayer` | `pino({ level })` | `silent()` |
| `@ydtb/anvil-layer-sentry` | `ErrorLayer` | `sentry({ dsn })` | `noop()` |
| `@ydtb/anvil-layer-resend` | `EmailLayer` | `resend({ apiKey })` | `console()` |
| `@ydtb/anvil-layer-s3` | `StorageLayer` | `s3({ bucket })` | `memory()` |

### Size Estimate

| Component | Lines |
|-----------|-------|
| Core framework (`compose` + `server` + `hooks` + `build` + `client`) | ~5,000-6,000 |
| Layer implementations (7 layers, ~400 lines each) | ~3,000 |
| **Total minimum viable framework** | **~8,000-9,000** |

---

## Migration Path from YDTB

Anvil is an extraction and formalization of patterns that already exist in the YDTB codebase. The migration is a re-housing:

| YDTB Package | Anvil Package | Change |
|---|---|---|
| `@ydtb/compose` | `@ydtb/anvil` | Rename + add `layers` field to `defineApp` |
| `@ydtb/plugin-sdk` (hook system) | `@ydtb/anvil-hooks` | Extract + add typed wrappers |
| `@ydtb/app/server/*` (infra boot, routes, middleware) | `@ydtb/anvil-server` | Replace Nitro with purpose-built runtime |
| `@ydtb/db` (singleton) | `@ydtb/anvil-layer-postgres` | Wrap in Effect Layer with lifecycle |
| Job providers (`console`, `bullmq`, `vercel-cron`) | `@ydtb/anvil-layer-bullmq` | Already pluggable — wrap in Effect Layer |
| `packages/app/src/vite.ts` (158 aliases) | `@ydtb/anvil-build` | Delete aliases, workspace-aware resolution |
| `apps/main/vite.config.ts` (Nitro block) | `@ydtb/anvil-build` | Delete Nitro, clean build config |
| `console.log` (60+ calls) | `@ydtb/anvil-layer-pino` | Replace with `getLogger()` |
| None (missing) | `@ydtb/anvil-layer-sentry` | New — error reporting |
| None (missing) | `@ydtb/anvil-layer-redis` | New — shared cache |
| None (missing) | `@ydtb/anvil-layer-s3` | New — file storage |

Tools (`@ydtb/contacts`, `@ydtb/billing`, etc.) don't change. Their `Client` and `Server` exports are the same. The infrastructure underneath them changes.

---

## What Anvil Is Not

- **Not a CMS** — no content types, no admin UI generator. Tools build their own UI.
- **Not an e-commerce platform** — no opinions about products, carts, or checkout. Domain-agnostic.
- **Not opinionated about UI** — uses React + TanStack Router, but the framework doesn't generate pages.
- **Not a PaaS** — runs on your own infrastructure. Deploy however you want.
- **Not a monolith** — tools are independent packages. The scope tree and hook system are the only coupling.

Anvil is a **composable full-stack plugin framework** — the infrastructure layer that lets you build multi-tenant, scope-aware applications from independent tool packages with swappable infrastructure.
