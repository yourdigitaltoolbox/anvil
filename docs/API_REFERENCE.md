# Anvil API Reference

## `@ydtb/anvil` — Core Types

### Functions

| Function | Signature | Description |
|---|---|---|
| `defineApp` | `(config: AppConfig) => AppConfig` | Define the composition root |
| `defineTool` | `(descriptor: ToolDescriptor) => ToolDescriptor` | Declare a tool's identity |
| `scope` | `(definition: ScopeDefinition) => ScopeDefinition` | Define a scope in the hierarchy |
| `defineClient` | `(definition: Client) => Client` | Define a tool's client surface |
| `defineServer` | `(definition: Server) => Server` | Define a tool's server surface |
| `defineExtension` | `(config: Extension) => Extension` | Define an extension |

### Types

**`AppConfig`** — Composition root configuration
- `brand: BrandConfig` — name, logo, primaryColor
- `layers: RequiredLayers` — infrastructure layer configs (derived from installed packages)
- `scopes: ScopeTree` — nested scope hierarchy
- `extensions?: Extension[]` — registered extensions

**`ToolDescriptor`** — Tool identity
- `id: string` — unique identifier
- `name: string` — display name
- `package: string` — package name for import resolution

**`ScopeDefinition`** — Scope in the hierarchy
- `type: string` — scope type identifier
- `label: string` — display label
- `urlPrefix: string` — URL pattern (supports `$scopeId` dynamic segments)
- `includes?: ToolDescriptor[]` — tools available at this scope level
- `children?: ScopeDefinition[]` — child scope types

**`Client`** = `ClientCore & ClientContributions` — Full client surface type
- `routes?: RouteEntry[]` — scoped routes
- `navigation?: NavigationEntry[]` — sidebar entries
- `permissions?: PermissionGroup[]` — permission declarations
- `publicRoutes?: RouteEntry[]` — no auth required
- `fullscreenRoutes?: RouteEntry[]` — no scope chrome
- `authenticatedRoutes?: RouteEntry[]` — auth required, no scope
- `setup?: (ctx) => void` — escape hatch
- Plus any fields from `ClientContributions` (augmented by extensions)

**`Server`** = `ServerCore & ServerContributions` — Full server surface type
- `schema?: Record<string, unknown>` — Drizzle table definitions
- `router?: Hono` — Hono sub-app (or use `fromOrpc()`)
- `hooks?: ServerHooks` — actions, broadcasts, filters
- `jobs?: JobDefinition[]` — background job definitions
- `requires?: readonly string[]` — required layer keys
- `setup?: (ctx) => void` — escape hatch
- Plus any fields from `ServerContributions` (augmented by extensions)

**`Extension`** — Extension definition
- `id: string` — unique identifier
- `name: string` — display name
- `client?: Client` — extension's own client surface
- `server?: Server` — extension's own server surface

### Extensible Interfaces (empty by default, augmented via declaration merging)

| Interface | Augmented by | Purpose |
|---|---|---|
| `LayerMap` | Layer packages | Define infrastructure contracts |
| `ClientContributions` | Extension packages | Tool client contribution fields |
| `ServerContributions` | Extension packages | Tool server contribution fields |

---

## `@ydtb/anvil-server` — Server Runtime

### Functions

| Function | Description |
|---|---|
| `createServer(config: ServerConfig)` | Create an HTTP server (Hono app + lifecycle) |
| `createWorker(config: WorkerConfig)` | Create a job worker (same boot, no HTTP) |
| `createSpaHandler(config: SpaHandlerConfig)` | Create a catch-all SPA handler with route matching + loaders |
| `getLayer(key)` | Access an infrastructure layer (synchronous) |
| `getHooks()` | Access the HookSystem instance |
| `getContributions(extensionId)` | Access collected extension contributions |
| `getRequestContext()` | Access per-request state (requestId, userId, scopeId, logger) |
| `getLogger()` | Get the current logger (request context → LogLayer → console fallback) |
| `getLayerTag(key)` | Get/create a shared Effect tag for inter-layer dependencies |
| `createLayerConfig(id, layer, opts?)` | Create a typed LayerConfig (for layer authors) |
| `toolEntry(id, surface)` | Convenience helper for manual tool wiring |
| `fromOrpc(router)` | Wrap an oRPC handler in a Hono sub-app |
| `provideLayerResolver(resolver)` | Test helper: swap layer resolver |
| `provideHookSystem(hooks)` | Test helper: swap hook system |
| `provideContributions(contributions)` | Test helper: swap contributions |
| `provideLoggingLayerResolver(resolver)` | Test helper: swap logging resolver |

### `ServerConfig`

```ts
{
  config: AppConfig        // from defineApp()
  tools: ToolEntry[]       // tool server surfaces
  middleware?: MiddlewareHandler[]  // Hono middleware
  routes?: Record<string, Hono>    // app-level routes
  port?: number            // default: 3000
}
```

### `WorkerConfig`

```ts
{
  config: AppConfig
  tools: ToolEntry[]
  onJob?: (job: JobDefinition) => Promise<void>
}
```

### `SpaHandlerConfig`

```ts
{
  routes: RegisteredRoute[]  // flat list of all routes with full URL patterns
  renderShell: (match: RouteMatch) => Promise<string | Response>
  skipPrefixes?: string[]    // default: ['/assets', '/favicon', '/_']
  apiPrefix?: string         // default: '/api'
}
```

### `RouteMatch`

```ts
{
  matched: RegisteredRoute | null  // which route matched
  params: Record<string, string>   // URL parameters
  loaderData: unknown | undefined  // data from route's loader
  path: string                     // raw request path
}
```

### `RequestContext`

```ts
{
  requestId: string     // crypto.randomUUID()
  userId?: string       // set by auth middleware
  scopeId?: string      // set by scope middleware
  scopeType?: string    // set by scope middleware
  logger: Logger        // child logger with context bound
  startedAt: number     // performance.now()
}
```

---

## `@ydtb/anvil-hooks` — Hook System

### `HookSystem` class (implements `HookAPI`)

| Method | Description |
|---|---|
| `addAction(name, handler)` | Register a request/response handler (exactly one per name) |
| `doAction(name, input)` | Dispatch an action, returns result (throws if no handler) |
| `tryAction(name, input)` | Dispatch an action, returns null if no handler |
| `onBroadcast(name, callback, priority?)` | Register a broadcast listener |
| `broadcast(name, payload, options?)` | Fire broadcast to all listeners |
| `broadcastSync(name, payload)` | Fire broadcast synchronously |
| `addFilter(hookName, callback, priorityOrOptions?)` | Register a filter callback |
| `applyFilter(hookName, initialValue, options?)` | Apply all filters (async) |
| `applyFilterSync(hookName, initialValue, options?)` | Apply all filters (sync) |
| `registerSideChannel(optionKey, config)` | Register a generic side-channel |
| `registerHook(hookName)` | Declare a hook point |
| `createScopedAPI(pluginId)` | Create scoped API tagged with tool ID |
| `removePluginRegistrations(pluginId)` | Remove all registrations for a tool |

### `createTypedHooks<TEvents, TActions>(hooks)`

Returns typed wrappers with compile-time checked event names and payload shapes.

---

## `@ydtb/anvil-build` — Build System

### Functions

| Function | Description |
|---|---|
| `anvilPlugin(config, options?)` | Vite/Rollup plugin for virtual modules |
| `createDevServer(config)` | Start dev server (Bun --watch + Vite) |
| `createViteConfig(options)` | Pre-configured Vite config with Anvil plugin + proxy |
| `collectTools(config)` | Extract deduplicated tool list from scope tree |
| `collectToolsWithScopes(config)` | Tools with their scope type memberships |

### Virtual Modules

| Module | Exports | Description |
|---|---|---|
| `virtual:anvil/server-tools` | `tools: ToolEntry[]` | All tool server surfaces |
| `virtual:anvil/client-tools` | `tools: ClientToolEntry[]` | All tool client surfaces |
| `virtual:anvil/schema` | `schema: Record<string, unknown>` | Merged schema for drizzle-kit |
| `virtual:anvil/scope-tree` | `scopeTree: VirtualScopeNode` | Serialized scope hierarchy |
| `virtual:anvil/permissions` | `permissions: PermissionGroup[]` | All tool permissions |
| `virtual:anvil/extensions` | `extensions: { id, name }[]` | Extension metadata |

---

## `@ydtb/anvil-client` — Client Runtime

### Functions

| Function | Description |
|---|---|
| `assembleRoutes(scopeTree, tools)` | Build scope-grouped route structure |
| `createApiClient(toolId)` | Create URL + headers builder for a tool's API |
| `configureApiClients(config)` | Set global API client config (call once at boot) |
| `createAnvilApp(config)` | Assemble a mountable React app |
| `getCurrentScope()` | Get current scope outside React (for API headers) |

### React Hooks & Components

| Export | Description |
|---|---|
| `useLayer(key)` | Access a client layer |
| `LayerProvider` | Provide client layers to component tree |
| `useScope()` | Access current scope (scopeId, scopeType) |
| `ScopeProvider` | Provide scope context |
| `useAuth()` | Access auth state (user, loading, signOut) |
| `AuthProvider` | Fetch session on mount, provide auth state |
| `AuthGate` | Render children only if authenticated |

### `ClientLayerMap` (extensible)

Empty by default. Client layer packages augment via declaration merging:

```ts
declare module '@ydtb/anvil-client' {
  interface ClientLayerMap {
    analytics: { track: (event: string, props?: Record<string, unknown>) => void }
  }
}
```

---

## Layer Packages

### `@ydtb/anvil-layer-auth`

| Export | Path | Description |
|---|---|---|
| `betterAuth(config)` | `@ydtb/anvil-layer-auth` | Production: better-auth with plugin system |
| `mockAuth(config?)` | `@ydtb/anvil-layer-auth/mock` | Test: predefined users, Bearer token auth |
| `authMiddleware(config?)` | `@ydtb/anvil-layer-auth/middleware` | Hono middleware: session → RequestContext.userId |
| `authRoutes()` | `@ydtb/anvil-layer-auth/middleware` | Hono handler: mount better-auth routes |
| `wrapPlugin(id, plugin)` | `@ydtb/anvil-layer-auth/plugins` | Wrap raw better-auth plugin |
| `apiKeys()` | `@ydtb/anvil-layer-auth/plugins` | API key plugin |
| `twoFactor(config?)` | `@ydtb/anvil-layer-auth/plugins` | TOTP 2FA plugin |
| `oAuth(providers)` | `@ydtb/anvil-layer-auth/plugins` | OAuth provider plugin |
| `organization(config?)` | `@ydtb/anvil-layer-auth/plugins` | Organization plugin |
| `emailVerification(config?)` | `@ydtb/anvil-layer-auth/plugins` | Email verification plugin |

### `@ydtb/anvil-layer-postgres`

| Export | Path | Description |
|---|---|---|
| `postgres(config)` | `@ydtb/anvil-layer-postgres` | Production: postgres.js + Drizzle ORM |
| `testPostgres(config)` | `@ydtb/anvil-layer-postgres/test` | Test: small pool, short timeouts |

**`DatabaseLayer`**: `{ db: PostgresJsDatabase, sql: Sql }`

### `@ydtb/anvil-layer-pino`

| Export | Path | Description |
|---|---|---|
| `pino(config?)` | `@ydtb/anvil-layer-pino` | Production: JSON/pretty logging |
| `silent()` | `@ydtb/anvil-layer-pino/silent` | Test: no-op logger |

**`LoggingLayer`**: `{ logger: Logger }`

### `@ydtb/anvil-layer-redis`

| Export | Path | Description |
|---|---|---|
| `redis(config)` | `@ydtb/anvil-layer-redis` | Production: ioredis |
| `memory(config?)` | `@ydtb/anvil-layer-redis/memory` | Test: in-memory Map with TTL |

**`CacheLayer`**: `{ get, set, del, has, getMany, delPattern }`

### `@ydtb/anvil-layer-bullmq`

| Export | Path | Description |
|---|---|---|
| `bullmq(config)` | `@ydtb/anvil-layer-bullmq` | Production: BullMQ Queue + Worker |
| `memoryJobs()` | `@ydtb/anvil-layer-bullmq/memory` | Test: in-memory queue |

**`JobLayer`**: `{ enqueue, registerHandler, getJob }`

### `@ydtb/anvil-layer-resend`

| Export | Path | Description |
|---|---|---|
| `resend(config)` | `@ydtb/anvil-layer-resend` | Production: Resend SDK |
| `consoleEmail(config?)` | `@ydtb/anvil-layer-resend/console` | Test: logs to console |

**`EmailLayer`**: `{ send: (message) => Promise<{ id }> }`

### `@ydtb/anvil-layer-s3`

| Export | Path | Description |
|---|---|---|
| `s3(config)` | `@ydtb/anvil-layer-s3` | Production: AWS S3 / MinIO / R2 |
| `memoryStorage(config?)` | `@ydtb/anvil-layer-s3/memory` | Test: in-memory Map |

**`StorageLayer`**: `{ put, get, del, exists, getUrl }`

### `@ydtb/anvil-layer-sentry`

| Export | Path | Description |
|---|---|---|
| `sentry(config)` | `@ydtb/anvil-layer-sentry` | Production: Sentry SDK |
| `noopErrors(config?)` | `@ydtb/anvil-layer-sentry/noop` | Test: logs or silent |

**`ErrorLayer`**: `{ capture, setUser, addBreadcrumb }`
