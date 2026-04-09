# Anvil — Framework Design

A composable full-stack plugin framework where tools, scopes, layers, and extensions are first-class primitives. Effect powers the server runtime internally; tool authors write plain TypeScript. The framework core ships empty — all concrete functionality comes from packages that extend it through a universal declaration merging pattern.

**Package namespace:** `@ydtb/anvil-*` (published under the `@ydtb` npm org)

---

## Core Primitives

Anvil has five primitives. Everything else — HTTP, React, database, jobs, onboarding, search, notifications — is provided by layers, extensions, or tools.

```
┌──────────────────────────────────────────────────────────────────┐
│                       COMPOSITION ROOT                           │
│                     compose.config.ts                             │
│                                                                  │
│  Brand · Layers · Scope Tree · Tool Includes · Extensions        │
└──────────────────────┬───────────────────────────────────────────┘
                       │
     ┌─────────────────┼──────────────────────┐
     │                 │                      │
┌────▼─────┐   ┌──────▼──────┐   ┌───────────▼───────────┐
│  TOOLS   │   │  SCOPES     │   │  EXTENSIONS           │
│          │   │             │   │                       │
│ Client + │   │ Nested      │   │ App-level systems     │
│ Server   │   │ hierarchy   │   │ that define contracts │
│ surfaces │   │ with tool   │   │ for tool contributions│
│          │   │ opt-in      │   │                       │
└────┬─────┘   └──────┬──────┘   └───────────┬───────────┘
     │                │                       │
     │    ┌───────────▼───────────┐           │
     │    │  LAYERS               │           │
     │    │  Swappable infra      │           │
     │    │  (empty by default)   │           │
     │    └───────────┬───────────┘           │
     │                │                       │
┌────▼────────────────▼───────────────────────▼──────┐
│                   HOOK SYSTEM                       │
│       Cross-tool communication bus                  │
│       Actions · Broadcasts · Filters                │
└────────────────────────────────────────────────────┘
```

### 1. Composition

The composition root (`compose.config.ts`) is the single source of truth for what the app is made of. Brand identity, scope hierarchy, tool includes, layer providers, and extensions — all declared in one file.

### 2. Tools

The unit of business functionality. Each tool is a package that exports a client surface (routes, navigation, permissions) and a server surface (schema, router, hooks, jobs). Tools also contribute to installed extensions (dashboard cards, search providers, onboarding steps, etc.). Tools don't know about each other — they communicate through hooks.

### 3. Layers

Swappable infrastructure. The framework ships with **no hardcoded layer contracts** — `LayerMap` is an empty interface augmented by layer packages via declaration merging. Installing `@ydtb/anvil-layer-postgres` adds a `database` key. Installing `@ydtb/anvil-layer-redis` adds a `cache` key. Each layer has a contract (TypeScript interface) with pluggable implementations. Swap one line in the composition root to change the implementation. Effect manages lifecycle internally.

### 4. Hooks

The cross-tool communication bus. Actions (request/response, exactly one handler), broadcasts (fire-and-forget, N listeners), filters (value transformation pipeline). Late-bound, dynamic, string-keyed — with optional typed wrappers for compile-time safety. Side-channels are generic and registered by the consuming app.

### 5. Extensions

App-level systems that define contracts for tools to contribute to. Extensions are not tools (not business features), not layers (not infrastructure), not hooks (not communication). They're platform-level systems that orchestrate cross-cutting concerns — onboarding wizards, search, dashboard cards, notifications, credential management, activity logging.

Each extension is a package that defines a contract via declaration merging on `ClientContributions` / `ServerContributions`. Installing the extension package makes its contribution fields available on `defineClient` / `defineServer`. The framework collects contributions and delivers them to the owning extension. Adding a new extension doesn't touch the framework.

---

## Composition Root

```ts
// compose.config.ts
import { defineApp } from '@ydtb/anvil'
import { defineTool, defineScope } from '@ydtb/anvil-toolkit/core'
import { postgres } from '@ydtb/anvil-layer-postgres'
import { redis } from '@ydtb/anvil-layer-redis'
import { bullmq } from '@ydtb/anvil-layer-bullmq'
import { pino } from '@ydtb/anvil-layer-pino'
import { sentry } from '@ydtb/anvil-layer-sentry'
import { resend } from '@ydtb/anvil-layer-resend'
import { s3 } from '@ydtb/anvil-layer-s3'

// Extensions
import { onboarding } from '@myapp/ext-onboarding'
import { search } from '@myapp/ext-search'
import { dashboard as dashboardExt } from '@myapp/ext-dashboard'
import { notifications } from '@myapp/ext-notifications'

// Tools
import { dashboardTool } from '@myapp/dashboard'
import { billing } from '@myapp/billing'
import { contacts } from '@myapp/contacts'
import { team } from '@myapp/team'
import { offers } from '@myapp/offers'

export default defineApp({
  brand: { name: 'My App' },

  // Infrastructure — swap any line to change the implementation
  // Only the layers you install are required — no hardcoded set
  layers: {
    database: postgres({ url: env.DATABASE_URL, pool: 10 }),
    cache: redis({ url: env.REDIS_URL }),
    jobs: bullmq({ redis: env.REDIS_URL }),
    logging: pino({ level: 'info' }),
    errors: sentry({ dsn: env.SENTRY_DSN }),
    email: resend({ apiKey: env.RESEND_API_KEY }),
    storage: s3({ bucket: env.S3_BUCKET }),
  },

  // Extensions — app-level systems with tool contribution contracts
  extensions: [onboarding, search, dashboardExt, notifications],

  // Scope hierarchy — each level opts into tools
  scopes: defineScope({
    type: 'system', label: 'System', urlPrefix: '/s',
    includes: [dashboardTool],
    children: [
      defineScope({
        type: 'company', label: 'Company', urlPrefix: '/c/$scopeId',
        includes: [dashboardTool, billing, team],
        children: [
          defineScope({
            type: 'location', label: 'Location', urlPrefix: '/l/$scopeId',
            includes: [dashboardTool, billing, contacts, team, offers],
          }),
        ],
      }),
    ],
  }),
})
```

### Compile-Time Verification

`defineApp` requires all layer keys declared by installed layer packages. The framework ships with an empty `LayerMap` — layer packages augment it via declaration merging:

```ts
// Framework core — ships empty
interface LayerMap {}

// @ydtb/anvil-layer-postgres augments when installed:
declare module '@ydtb/anvil' {
  interface LayerMap {
    database: DatabaseLayer
  }
}

// @ydtb/anvil-layer-redis augments when installed:
declare module '@ydtb/anvil' {
  interface LayerMap {
    cache: CacheLayer
  }
}

// RequiredLayers derives from LayerMap:
type RequiredLayers = { [K in keyof LayerMap]: LayerConfig<K> }

// Result: defineApp requires exactly { database, cache } — nothing more, nothing less
// Omit one → compile error. Add a layer package → it appears in the requirement.
```

The same declaration merging pattern applies to tool surface extensions:

```ts
// Framework core — ships empty
interface ClientContributions {}
interface ServerContributions {}

// @myapp/ext-search augments when installed:
declare module '@ydtb/anvil' {
  interface ClientContributions {
    search?: { provider: SearchProvider }
  }
}

// Now defineClient accepts a `search` field — typed and autocompleted
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
  scopes: defineScope({ /* ... */ }),
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

Each layer is defined by a TypeScript interface (the contract) and one or more factory functions (implementations). **Layer contracts live in layer packages, not in the framework core.** The framework ships with an empty `LayerMap`.

```ts
// @ydtb/anvil-layer-postgres — defines the contract AND augments LayerMap

export interface DatabaseLayer {
  readonly db: DrizzleClient
}

declare module '@ydtb/anvil' {
  interface LayerMap {
    database: DatabaseLayer
  }
}
```

```ts
// @ydtb/anvil-layer-redis
export interface CacheLayer {
  readonly get: (key: string) => Promise<string | null>
  readonly set: (key: string, value: string, ttlSeconds?: number) => Promise<void>
  readonly del: (key: string) => Promise<void>
}

declare module '@ydtb/anvil' {
  interface LayerMap {
    cache: CacheLayer
  }
}
```

Any consuming app can define its own layer contracts for domain-specific infrastructure:

```ts
// @myapp/layer-realtime — a custom layer
export interface RealtimeLayer {
  readonly broadcast: (channel: string, data: unknown) => Promise<void>
  readonly subscribe: (channel: string, handler: (data: unknown) => void) => () => void
}

declare module '@ydtb/anvil' {
  interface LayerMap {
    realtime: RealtimeLayer
  }
}
```

### Layer Implementation (Effect Inside, Plain Outside)

Each layer package exports a factory function. Internally it builds an Effect Layer with `acquireRelease` for lifecycle management. Externally it returns a plain config object:

```ts
// @ydtb/anvil-layer-postgres
import { Layer, Effect, Context } from 'effect'

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
| `./client` | `src/client.ts` | `Client` — core fields (routes, nav, permissions) + extension contributions |
| `./server` | `src/server.ts` | `Server` — core fields (schema, router, hooks, jobs) + extension contributions |
| `./types` | `src/types.ts` | Action interfaces, permission constants, event types |

The `Client` and `Server` types are composed of **core fields** (processed by the framework) and **contributions** (collected and delivered to extensions). Core fields are always available. Contribution fields appear via declaration merging when extension packages are installed.

### Tool Descriptor

```ts
// tools/contacts/src/index.ts
import { defineTool } from '@ydtb/anvil-toolkit/core'

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
import { defineClient, createApiClient } from '@ydtb/anvil-toolkit/core'
import type { ContactsRouter } from './api/router'

export const contactsApi = createApiClient<ContactsRouter>('contacts')

export default defineClient({
  // --- Core fields (framework processes these) ---
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

  // --- Extension contributions (available when extension packages are installed) ---
  search: { provider: contactSearchProvider },
  onboarding: { steps: [{ id: 'import-contacts', component: ImportContactsStep, order: 30 }] },
  dashboard: { cards: [{ id: 'recent-contacts', component: RecentContactsCard, order: 20 }] },
})
```

### Server Surface

```ts
// tools/contacts/src/server.ts
import { defineServer } from '@ydtb/anvil-toolkit/core'
import { contacts, contactNotes } from './db/schema'
import { contactsRouter } from './api/router'

export default defineServer({
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
})
```

---

## Extensions

Extensions are app-level systems that define contracts for tools to contribute to. They're the mechanism for platform-wide features that span multiple tools — onboarding, search, dashboard, notifications, credentials, activity logging.

### Defining an Extension

An extension is a package that:
1. Defines a contract (what tools can contribute) via declaration merging
2. Provides its own client/server surfaces (routes, hooks, etc.)
3. Is registered in `defineApp({ extensions: [...] })`

```ts
// @myapp/ext-search — a search extension package
import { defineExtension } from '@ydtb/anvil-toolkit/core'
import type { SearchProvider } from './types'

// 1. Define the extension
export const search = defineExtension({
  id: 'search',
  name: 'Search',
  client: {
    routes: [{ path: 'search', component: () => import('./search-page') }],
  },
  server: {
    router: searchRouter,
    hooks: {
      actions: {
        'search:query': searchQueryHandler,
      },
    },
  },
})

// 2. Augment surface types — tools can now contribute search providers
declare module '@ydtb/anvil' {
  interface ClientContributions {
    search?: { provider: SearchProvider }
  }
}
```

### How Extensions Work at Runtime

1. `createServer` reads `config.extensions` and processes each extension's server surface (routers, hooks, jobs) — same as tools
2. `createServer` collects all tool contributions for each extension and makes them available
3. The extension's own code (hooks, routers) can access the collected contributions to build its functionality
4. On the client, the same collection happens — the extension's client surface orchestrates the contributed data

### Why Not Just Use Hooks?

Hooks are for runtime cross-tool communication. Extension contributions are structural — they're collected at boot time and define what the app is made of. A search provider declaration is not a runtime message; it's a structural registration that says "this tool contributes search capability." Structural data deserves proper type support, not string-keyed dynamic registration.

### Extension Examples (YDTB)

| Extension | Contract | Extension Provides |
|---|---|---|
| Onboarding | Steps (component, priority, gate, level) | Setup wizard page, step navigation, completion validation |
| Search | Search providers (query function) | Global search UI, query aggregation across providers |
| Dashboard | Cards (component, order) | Dashboard layout, card grid rendering |
| Notifications | Notification providers | Notification panel, preferences, delivery engine |
| Credentials | OAuth provider configs | Credential management UI, OAuth callback routes, vault |
| Activity | — (uses broadcast side-channels) | Activity feed UI, activity log storage |

A different Anvil consumer might have none of these, or completely different ones. The framework doesn't know or care.

---

## Server Runtime

### createServer

```ts
// apps/main/server/index.ts
import { createServer } from '@ydtb/anvil-server'
import { tools } from 'virtual:app/server-tools'
import composeConfig from '../compose.config'
import { cors } from 'hono/cors'
import { authMiddleware } from './middleware/auth'

const server = createServer({
  config: composeConfig,
  tools,
  middleware: [cors(), authMiddleware()],
  routes: {
    // App-level routes (not tool routes, not extension routes)
    settings: settingsRouter,
    apiKeys: apiKeyRouter,
  },
  port: Number(process.env.PORT) || 3000,
})

server.start()
```

Internally, `createServer`:

1. **Composes Effect layers** — `Layer.mergeAll(...)`, resolving dependency graph
2. **Creates ManagedRuntime** — acquires all resources in dependency order
3. **Creates Hono app** — installs middleware from config
4. **Installs request context** — `AsyncLocalStorage<RequestContext>` with `requestId`, `userId`, `scopeId`, child logger
5. **Processes extension server surfaces** — routers, hooks, jobs from each registered extension
6. **Processes tool server surfaces** — routers, hooks, jobs, schema; collects extension contributions
7. **Mounts HTTP routes** — tool RPC at `/api/rpc/{toolId}/*`, extension routes, app-level routes
8. **Mounts health checks** — `/healthz` (liveness), `/readyz` (auto-derived from layer health checks)
9. **Boots background jobs** — cron scheduler + trigger listeners
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
| **Filter** | `addFilter` | `applyFilter` / `applyFilterSync` | 0-N in pipeline | Value transformation |

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
import { createTypedHooks } from '@ydtb/anvil-hooks/typed'
import type { BillingActions, BillingEvents } from '@myapp/billing/types'

const hooks = createTypedHooks<BillingEvents, BillingActions>(hookSystem)

// Typed — compiler checks event name + payload shape
hooks.broadcast('wallet:depleted', { walletId, scopeId })
//                                  ^^^^^^^^^^^^^^^^^^^^^^^^
//                                  TypeScript enforces this shape

// Typed — compiler checks action name + input/output
const result = await hooks.doAction('billing:deduct', { walletId, amount, description })
//     ^? { transactionId: string; newBalance: number }

// Access untyped API for filters and advanced usage
hooks.raw.applyFilter('contacts:list', contacts)
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
| `@ydtb/anvil` | `defineApp`, `defineTool`, `scope`, `defineClient`, `defineServer`, `defineExtension`, empty extensible interfaces (`LayerMap`, `ClientContributions`, `ServerContributions`) | No |
| `@ydtb/anvil-server` | `createServer`, `createWorker`, lifecycle, `getLayer`, `getHooks`, `getLogger`, request context | Yes (internally) |
| `@ydtb/anvil-hooks` | HookSystem, actions, broadcasts, filters, side-channels, typed wrappers | No |
| `@ydtb/anvil-build` | Virtual module plugin, workspace resolver, dev server, production build | No |
| `@ydtb/anvil-client` | Client surface registration, `useLayer`, routing, API client factory | No |

### Layer Packages

Each layer package defines its contract, augments `LayerMap`, and exports production + dev/test factories:

| Package | Contract | Augments `LayerMap` | Production | Dev/Test |
|---------|----------|-------------------|------------|----------|
| `@ydtb/anvil-layer-postgres` | `DatabaseLayer` | `database` | `postgres({ url, pool })` | `testPostgres()` |
| `@ydtb/anvil-layer-redis` | `CacheLayer` | `cache` | `redis({ url })` | `memory()` |
| `@ydtb/anvil-layer-bullmq` | `JobLayer` | `jobs` | `bullmq({ redis })` | `console()` |
| `@ydtb/anvil-layer-pino` | `LogLayer` | `logging` | `pino({ level })` | `silent()` |
| `@ydtb/anvil-layer-sentry` | `ErrorLayer` | `errors` | `sentry({ dsn })` | `noop()` |
| `@ydtb/anvil-layer-resend` | `EmailLayer` | `email` | `resend({ apiKey })` | `console()` |
| `@ydtb/anvil-layer-s3` | `StorageLayer` | `storage` | `s3({ bucket })` | `memory()` |

### Extension Packages (YDTB examples)

Each extension package defines its contract, augments `ClientContributions` / `ServerContributions`, and provides its own surfaces:

| Package | Augments | Extension Provides |
|---------|----------|-------------------|
| `@myapp/ext-onboarding` | `ClientContributions.onboarding` | Setup wizard, step navigation |
| `@myapp/ext-search` | `ClientContributions.search` | Global search UI, query aggregation |
| `@myapp/ext-dashboard` | `ClientContributions.dashboard` | Dashboard layout, card grid |
| `@myapp/ext-notifications` | `ClientContributions.notifications`, `ServerContributions.notifications` | Notification panel, delivery engine |
| `@myapp/ext-credentials` | `ClientContributions.credentials`, `ServerContributions.credentials` | OAuth UI, credential vault |

---

## Migration Path from YDTB

Anvil is a clean redesign informed by patterns in YDTB. The migration re-houses existing functionality into the new architecture:

| YDTB Package | Anvil Package | Change |
|---|---|---|
| `@ydtb/compose` | `@ydtb/anvil` | Rename + add `layers`, `extensions` to `defineApp` |
| `@ydtb/plugin-sdk` (hook system) | `@ydtb/anvil-hooks` | Extract + add typed wrappers + generic side-channels |
| `@ydtb/app/server/*` (infra boot, routes, middleware) | `@ydtb/anvil-server` | Replace Nitro with Hono-based runtime |
| `@ydtb/db` (singleton) | `@ydtb/anvil-layer-postgres` | Wrap in Effect Layer with lifecycle |
| Job providers (`console`, `bullmq`, `vercel-cron`) | `@ydtb/anvil-layer-bullmq` | Already pluggable — wrap in Effect Layer |
| `packages/app/src/vite.ts` (158 aliases) | `@ydtb/anvil-build` | Delete aliases, workspace-aware resolution |
| `apps/main/vite.config.ts` (Nitro block) | `@ydtb/anvil-build` | Delete Nitro, clean build config |
| `console.log` (60+ calls) | `@ydtb/anvil-layer-pino` | Replace with `getLogger()` |
| `@ydtb/app/onboarding` (wizard) | `@myapp/ext-onboarding` | Extract as extension |
| `@ydtb/app/server/search` | `@myapp/ext-search` | Extract as extension |
| `@ydtb/app/server/notifications` | `@myapp/ext-notifications` | Extract as extension |
| `@ydtb/credentials` (OAuth vault) | `@myapp/ext-credentials` | Extract as extension |
| `@ydtb/app/server/activity` | `@myapp/ext-activity` | Extract as extension |
| Dashboard cards (scattered) | `@myapp/ext-dashboard` | Consolidate as extension |
| None (missing) | `@ydtb/anvil-layer-sentry` | New — error reporting |
| None (missing) | `@ydtb/anvil-layer-redis` | New — shared cache |
| None (missing) | `@ydtb/anvil-layer-s3` | New — file storage |

Tools (`@ydtb/contacts`, `@ydtb/billing`, etc.) need updates: their `Client` and `Server` surfaces split into core fields (same as before) plus extension contributions (new declaration merging fields). The business logic inside tools doesn't change.

---

## What Anvil Is Not

- **Not a CMS** — no content types, no admin UI generator. Tools build their own UI.
- **Not an e-commerce platform** — no opinions about products, carts, or checkout. Domain-agnostic.
- **Not opinionated about UI** — uses React + TanStack Router, but the framework doesn't generate pages.
- **Not a PaaS** — runs on your own infrastructure. Deploy however you want.
- **Not a monolith** — tools are independent packages. The scope tree and hook system are the only coupling.
- **Not opinionated about infrastructure** — ships with no hardcoded layers. Install what you need.
- **Not opinionated about platform features** — ships with no hardcoded extensions. Onboarding, search, notifications, dashboard cards — these are all extension packages, not framework features.

Anvil is a **composable full-stack plugin framework** — the infrastructure layer that lets you build multi-tenant, scope-aware applications from independent tool packages with swappable infrastructure and extensible platform systems. The framework core is deliberately empty — it provides primitives and plumbing, never policy.
