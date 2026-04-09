# Handoff

## Project

Anvil — composable full-stack plugin framework.
Repo: https://github.com/yourdigitaltoolbox/anvil
Branch: `main`

## Philosophy

YDTB is already running in production. There is no rush. Anvil is not about shipping fast — it's about building the next generation right from the lessons learned the first time. Every design decision should prioritize the clean approach over the quick approach, even if it takes more time and effort. We are starting from scratch THE RIGHT WAY.

This means:
- **Don't half-bake.** If a concept needs a proper extensibility mechanism, build the extensibility mechanism. Don't work around it with hooks and revisit later.
- **Don't copy from YDTB.** YDTB is the reference for what problems need solving and what patterns emerged organically. Anvil solves the same problems but designs them properly from scratch — clean APIs, correct separation of concerns, no accumulated shortcuts.
- **Don't optimize for YDTB's migration.** Anvil is a standalone framework. Decisions that make YDTB's migration easier but compromise the framework's design are wrong decisions.
- **Get the foundation right.** Core types, surface contracts, and extension mechanisms must be solid before building the server on top of them. Retrofitting is what we're trying to avoid.

## Reference Implementation

YDTB at `/Users/john/projects/ydtb` is the first consumer. Read the YDTB codebase for proven patterns — Anvil extracts and formalizes what YDTB built organically. Key YDTB docs:
- `docs/server-infrastructure-design.md` — Nitro replacement plan (YDTB-specific migration)
- `docs/anvil-framework-design.md` — original framework design (being superseded by `docs/DESIGN.md` here)
- `CLAUDE.md` — full codebase guide with conventions and architecture

## Current State

**Core framework complete.** Eight packages built. 76 tests passing. Example app running end-to-end.

### `@ydtb/anvil` (core types) — ✅ DONE
- Five primitives: `defineApp`, `defineTool`, `scope`, `defineClient`/`defineServer`, `defineExtension`
- Universal extensibility: `LayerMap`, `ClientContributions`, `ServerContributions` — all empty, augmented via declaration merging
- `LayerConfig`, `RequiredLayers` — derive from `LayerMap`, no hardcoded layer contracts
- `ClientCore` / `ServerCore` — framework-owned surface fields, separate from extension contributions
- Zero runtime dependencies, zero Effect dependency

### `@ydtb/anvil-hooks` — ✅ DONE (27 tests)
- `HookSystem` class — actions, broadcasts, filters
- `createTypedHooks()` — compile-time safe wrappers
- `setHookErrorHandler()` — pluggable error handler
- `registerSideChannel()` — generic side-channel mechanism
- Zero dependencies, framework-agnostic

### `@ydtb/anvil-server` — ✅ FUNCTIONAL (7 tests)
- `createServer(config)` — Hono app, middleware, health endpoints, boot sequence, shutdown
- `getLayer(key)` — synchronous layer access via Effect ManagedRuntime
- `getHooks()` — hook system access, module-level singleton
- `getContributions(extensionId)` — typed accessor for extension contributions
- `getRequestContext()` / `getLogger()` — per-request state, console fallback → LogLayer once booted
- Lifecycle manager — Effect layer composition, `_effectLayer: { tag, layer }` contract, health checks, graceful shutdown
- Surface processor — registers hooks, extracts routers, collects extension contributions
- Route mounting — Hono sub-apps at `/api/{toolId}/*`
- `fromOrpc()` — wraps oRPC handlers for framework-agnostic mounting
- `createLayerConfig()` — enforced layer authoring helper
- `toolEntry()` — convenience helper for manual tool wiring
- `/healthz` (liveness) + `/readyz` (layer health checks with latency)
- `ServerConfig` accepts middleware array and app-level routes

### `@ydtb/anvil-build` — ✅ DONE (16 tests)
- `anvilPlugin(config)` — Vite/Rollup plugin generating virtual modules
- Virtual modules: `virtual:anvil/server-tools`, `virtual:anvil/client-tools`, `virtual:anvil/schema`, `virtual:anvil/scope-tree`, `virtual:anvil/permissions`, `virtual:anvil/extensions`
- `collectTools()` / `collectToolsWithScopes()` — scope tree traversal with deduplication
- Type declarations for all virtual modules (`virtual.d.ts`)
- Works with both Vite (client) and Rollup (server) builds

### `@ydtb/anvil-layer-pino` — ✅ DONE (7 tests)
- `pino()` factory — JSON in production, pretty in dev
- `silent()` factory — no-op logger for tests
- Defines `LoggingLayer` contract, augments `LayerMap`
- Integrated with `getLogger()` — request context loggers use pino after boot

### `@ydtb/anvil-layer-postgres` — ✅ DONE (4 tests)
- `postgres()` factory — connection pool via postgres.js + Drizzle ORM
- `testPostgres()` — small pool, short timeouts for test suites
- Effect `acquireRelease` manages pool creation/teardown
- Health check runs `SELECT 1` with latency measurement
- Defines `DatabaseLayer` contract (`{ db: PostgresJsDatabase, sql: Sql }`), augments `LayerMap`

### `@ydtb/anvil-client` — ✅ DONE (15 tests)
- `assembleRoutes(scopeTree, tools)` — pure function: scope tree + tool surfaces → scope-grouped route structure
- `createApiClient(toolId)` — URL + headers builder with automatic scope injection
- `configureApiClients()` — lazy global config, called once at boot
- `useLayer(key)` / `LayerProvider` — client-side swappable services via React context
- `ClientLayerMap` — empty interface, augmented via declaration merging (same pattern as server)
- `useScope()` / `ScopeProvider` — current scope context from URL params
- `getCurrentScope()` — module-level ref for non-React access (API headers)
- Framework provides data + hooks, app owns the React rendering (TanStack Router setup, provider hierarchy)

### Example App — ✅ RUNNING
- `examples/minimal/` — compose.config + layer + extension + tool + server entry
- Demonstrates all five primitives working together
- Runnable with `bun run examples/minimal/server.ts`, curlable endpoints

## Surfaces vs Hooks (Client Communication)

Tools use two complementary mechanisms for communication:

| Concern | Mechanism | When |
|---|---|---|
| What a tool contributes (routes, nav, cards, search providers) | Surfaces + Extensions | Boot time, declarative, typed |
| What happens when X occurs (events, reactions) | Hooks (broadcasts) | Runtime, event-driven |
| Ask another tool to do something | Hooks (actions) | Runtime, request/response |
| Transform data flowing through the system | Hooks (filters) | Runtime, pipeline |

Surfaces handle **structural** communication (what a tool IS). Hooks handle **runtime** communication (what happens when something OCCURS). This replaces YDTB's "everything through hooks" pattern — hooks were being abused for collecting static data. Now each mechanism does what it's good at.

## What's Next

**The core framework is complete.** All five packages are built, tested, and pushed. Remaining work is incremental.

### Priority 1: Server v0.2 enhancements
- `createWorker(config)` — job processing without HTTP
- Scope-aware SPA handler — branded HTML shell from URL parsing (Tier 1)
- Sentry / error reporting — ErrorLayer integration

### Priority 2: More layer packages
Pattern is proven. Build as needed:
- `@ydtb/anvil-layer-redis` — CacheLayer
- `@ydtb/anvil-layer-bullmq` — JobLayer
- `@ydtb/anvil-layer-sentry` — ErrorLayer
- `@ydtb/anvil-layer-resend` — EmailLayer
- `@ydtb/anvil-layer-s3` — StorageLayer

### Priority 3: Extension packages (YDTB-specific)
Build during YDTB migration phase:
- `@myapp/ext-onboarding`, `@myapp/ext-search`, `@myapp/ext-dashboard`
- `@myapp/ext-notifications`, `@myapp/ext-credentials`, `@myapp/ext-activity`

## Key Design Decisions

- **Five primitives** — Composition, Tools, Layers, Hooks, Extensions. Extensions are the fifth primitive for app-level systems (onboarding, search, dashboard, etc.).
- **Framework ships empty** — `LayerMap`, `ClientContributions`, `ServerContributions` are empty interfaces. All concrete functionality comes from packages via declaration merging.
- **Effect is internal to `@ydtb/anvil-server`** — tools never touch Effect unless they opt in. Effect manages layer composition, resource lifecycle (acquireRelease), and shutdown guarantees.
- **`_effectLayer` contract** — must be `{ tag: Context.Tag, layer: Layer.Layer }`. Layer packages provide both. The lifecycle manager resolves services via the tag after ManagedRuntime acquires resources.
- **Hono** for HTTP — lightweight, Web Standard API, runtime portable (Node/Bun/Deno/edge).
- **Tool routers are Hono sub-apps** — mounted at `/api/{toolId}/*`. `fromOrpc()` helper wraps oRPC for the common case. Framework has no oRPC dependency.
- **Logging is a layer** — `getLogger()` returns console during boot, LogLayer logger once available. No pino dependency in the server package.
- **Edge compatibility** is a design constraint — avoid Node-only patterns. Layer implementations determine runtime compatibility (postgres → neon-http for edge).
- **`createServer` accepts middleware array** — app-level middleware (CORS, auth, rate limiting). Tools don't add middleware.
- **App-level routes on `createServer`** — non-tool routes (settings, API keys) via `routes` config.
- **Scope-aware rendering** — 3 tiers: branded shell (backlog), streaming SSR (backlog), per-route loaders (backlog). Tier 1 handler must not block Tiers 2 and 3.
- **Worker separation** — `createWorker()` is a separate entry point (v0.2).

## Concept Model

Anvil has five primitives. The framework core is deliberately empty — all concrete functionality comes from packages that extend the framework through a universal declaration merging pattern.

### 1. Composition (App + Scopes)

**App** — the top-level container. One per deployment. Declares brand identity, layers, scope hierarchy, tool includes, extensions, app-level routes, and middleware. In YDTB, `apps/main`, `apps/rr`, and `apps/gym` are three different Apps using the same tools with different configurations. A whitelabel deploy is just another App.

**Scopes** — nested hierarchy. Each scope is a data isolation + permission + routing boundary. Scopes can have children scopes. Each scope opts into which tools are available. Scopes define their own URL prefix, creation rules, and lifecycle hooks (e.g., seed roles on creation).

Example: System → Company → Location. A company scope includes billing and team tools. A location scope includes those plus contacts, offers, and notifications.

The App also owns **app-level routes** — pages that exist outside any scope (`/profile`, `/onboarding`, auth pages, context selection). These are not tools and not scoped. They're part of the application shell.

### 2. Tools

The unit of business functionality. Self-contained packages that export standardized surfaces:
- **Client surface** — core fields (routes, navigation, permissions) plus contributions to installed extensions
- **Server surface** — core fields (router, hooks, jobs, requires) plus contributions to installed extensions
- **Types** — action interfaces, event types, permission constants

Tools don't know about each other. They communicate through hooks. Tools contribute to extensions but don't depend on them — if an extension isn't installed, the contribution is ignored.

### 3. Layers

Swappable infrastructure contracts. **The framework ships with no hardcoded layers.** `LayerMap` is an empty interface. Layer packages augment it via declaration merging:

```ts
// @ydtb/anvil — core (ships empty)
export interface LayerMap {}

// @ydtb/anvil-layer-postgres — augments when installed
declare module '@ydtb/anvil' {
  interface LayerMap {
    database: DatabaseLayer
  }
}

// @ydtb/anvil-layer-redis — augments when installed
declare module '@ydtb/anvil' {
  interface LayerMap {
    cache: CacheLayer
  }
}
```

`RequiredLayers` derives from `LayerMap` — so `defineApp` requires exactly the layers declared by installed packages. Install postgres and redis → must provide `database` and `cache`. Install a custom `RealtimeLayer` → must provide `realtime`. The consuming app defines what infrastructure it needs.

The 7 layer contracts currently in the core package (`DatabaseLayer`, `CacheLayer`, `JobLayer`, `LogLayer`, `ErrorLayer`, `EmailLayer`, `StorageLayer`) move out to their respective layer packages.

### 4. Hooks

Cross-tool communication bus. Actions (request/response), broadcasts (fire-and-forget), filters (value transformation pipeline). The only runtime coupling between tools.

### 5. Extensions

**App-level systems that define contracts for tools to contribute to.** Extensions are the fifth primitive — they're not tools (not business features), not layers (not infrastructure), not hooks (not communication). They're platform-level systems that orchestrate cross-cutting concerns.

Each Extension is a package that:
- Has an identity (id, name)
- Defines a **contract** — what tools can contribute (client and/or server)
- **Collects** contributions from all tools that opt in
- Has its own **client surface** (optional — UI for orchestration, e.g., onboarding wizard, search UI)
- Has its own **server surface** (optional — server-side processing, e.g., notification delivery engine)
- Augments tool surface types via declaration merging — installing the extension package makes its contribution fields available on `defineClient`/`defineServer`

YDTB extensions (examples):

| Extension | Contract (what tools contribute) | Extension provides |
|---|---|---|
| Onboarding | Steps (component, priority, gate, level) | Setup wizard page, step navigation, completion validation |
| Search | Search provider (query function) | Global search UI, query aggregation |
| Dashboard | Cards (component, order) | Dashboard layout, card grid |
| Notifications | Providers (delivery config) | Notification panel, preferences, delivery engine |
| Credentials | Provider configs (OAuth flows) | Credential management UI, OAuth routes, credential vault |
| Activity | — (via broadcast side-channels) | Activity feed UI, activity log storage |
| Tokens | Token providers (resolution functions) | Template token resolution engine |

In code:

```ts
// @ydtb/ext-onboarding — an extension package
import { defineExtension } from '@ydtb/anvil'

export const onboarding = defineExtension({
  id: 'onboarding',
  name: 'Onboarding',
  client: {
    routes: [{ path: 'setup-wizard', component: SetupWizard }],
  },
  server: {
    router: onboardingRouter,
  },
})

// The package also augments surface types:
declare module '@ydtb/anvil' {
  interface ClientContributions {
    onboarding?: { steps: OnboardingStep[] }
  }
  interface ServerContributions {
    onboarding?: { validators: OnboardingValidator[] }
  }
}
```

```ts
// compose.config.ts — the app registers its extensions
export default defineApp({
  brand: { name: 'YDTB' },
  layers: { ... },
  scopes: scope({ ... }),
  extensions: [onboarding, search, notifications, dashboard],
})
```

```ts
// tools/contacts/client.ts — tool contributes to extensions
export default defineClient({
  routes: [...],                          // core framework
  permissions: [...],                     // core framework
  search: { provider: contactSearch },    // contributing to search extension
  onboarding: { steps: [...] },           // contributing to onboarding extension
})
```

### Universal Extensibility Pattern

All three extensible interfaces use the same declaration merging pattern:

| Interface | Augmented by | Purpose |
|---|---|---|
| `LayerMap` | Layer packages (`@ydtb/anvil-layer-*`) | Define infrastructure contracts |
| `ClientContributions` | Extension packages (`@ydtb/ext-*`) | Define what tools can contribute to client |
| `ServerContributions` | Extension packages (`@ydtb/ext-*`) | Define what tools can contribute to server |

The framework core ships with all three interfaces empty. Installing packages fills them in. This means:
- **Adding a new layer contract** doesn't touch the framework
- **Adding a new extension** doesn't touch the framework
- **Removing an extension is safe** — tool contributions to a missing extension are silently ignored
- **Different Anvil apps can have completely different extensions and layers**
- **The framework is truly generic** — it provides primitives and plumbing, never policy

### Integrations

External service connections (Google, Stripe, SendGrid, n8n). A distinct concept from tools and layers:
- Have their own OAuth flows and credential storage
- Defined in the app config via `defineIntegration()`
- Tools consume integrations (e.g., GMB tool uses Google integration)
- Not the same as layers — layers are framework infrastructure (database, cache), integrations are external service connections that tools use for business logic
- The **Credentials extension** provides the UI and vault for managing integration credentials

### Impact on Build Order

The core types package (`@ydtb/anvil`) needs significant rework before `anvil-server`:

1. **Remove hardcoded layer contracts** — `LayerMap` becomes empty, contracts move to layer packages
2. **Split surface types** — separate core fields from `ClientContributions`/`ServerContributions`
3. **Add `defineExtension`** — new primitive function and `Extension` type
4. **Add `extensions` field to `defineApp`**
5. **Add app-level route and middleware slots to `defineApp`**

This is foundation work. Getting it right means everything built on top — server, build, client — works with the extensibility model from day one.

## Clarifications (Q&A)

### Architecture (anvil-server)

**Q: How does `getLayer(key)` work at runtime?**

Effect's `ManagedRuntime` is the container. During `createServer()` boot, all layers from `config.layers` are composed via `Layer.mergeAll()` and a `ManagedRuntime` is created — this acquires all resources (DB connections, Redis, BullMQ workers) in dependency order. The runtime is stored in a module-level variable. `getLayer('database')` reads from that runtime synchronously (resources are already acquired).

From a tool author's perspective:
```ts
import { getLayer } from '@ydtb/anvil-server'

const { db } = getLayer('database')
const { logger } = getLayer('logging')

// That's it. Normal async/await from here.
const [contact] = await db.select().from(contacts).where(eq(contacts.id, id))
```

No Effect, no providers, no injection decorators. The tool just calls `getLayer` and gets back the concrete implementation that was configured in `compose.config.ts`. The ManagedRuntime is an implementation detail — if we ever wanted to swap Effect out for a simpler container, the `getLayer` API wouldn't change.

**Q: Follow-up — does a module-level runtime create problems for tests (two servers in one process)?**

Yes, this is a real concern. Module-level singletons work for production (one server per process) but tests are the pain point. YDTB already has this problem — `import { db } from '@ydtb/db'` returns the same singleton in every test file.

**v0.1: Module-level singleton + test helper (ship this)**
```ts
// Production: one server, one runtime, module-level
const server = createServer(config)
server.start()

// Tests: swap the runtime before each suite
import { provideRuntime } from '@ydtb/anvil-server'
beforeAll(() => provideRuntime(testRuntime))
afterAll(() => provideRuntime(null))
```

**v0.2: Context-based with module-level fallback (upgrade path)**
```ts
// getLayer checks AsyncLocalStorage first, falls back to module-level
export function getLayer<K extends keyof LayerMap>(key: K): LayerMap[K] {
  const scoped = layerContext.getStore()
  if (scoped) return scoped[key]
  return globalRuntime.get(key)  // production path — zero overhead
}

// Tests wrap in a context scope:
import { withLayers } from '@ydtb/anvil-server/test'
it('creates a contact', async () => {
  await withLayers(testLayers, async () => {
    // getLayer('database') returns test DB inside this scope
    const result = await createContact({ name: 'John' })
    expect(result.name).toBe('John')
  })
})
```

The v0.2 approach also enables two servers in the same process — each wraps its request handling in its own `layerContext.run()`, resolving to the right runtime without global mutation.

**Decision:** Build v0.1 (module-level). Design the `getLayer` function signature so it can be upgraded to v0.2 without changing any call sites — the API is the same, only internal resolution changes.

**Q: What's the health-check contract for layers?**

Each `LayerConfig` has an optional `_healthCheck` that returns a status object:
```ts
interface HealthStatus {
  status: 'ok' | 'error'
  message?: string    // human-readable, only on error
  latencyMs?: number  // how long the check took
}
```

Checks are **on-demand only** — triggered by `GET /readyz`. No polling interval. A separate `GET /healthz` returns 200 unconditionally (liveness probe — is the process alive?). `/readyz` answers "is the server ready to take traffic?" by running layer health checks. The lifecycle manager runs all registered health checks in parallel with a per-check timeout (500ms default). The aggregate result is `ok` if all pass, `degraded` if any fail.

Layer authors provide the check in their factory function:
```ts
export function postgres(config): LayerConfig<'database'> {
  return {
    id: 'database',
    _effectLayer: /* ... */,
    _healthCheck: Effect.gen(function* () {
      const { db } = yield* Database
      const start = Date.now()
      yield* Effect.tryPromise(() => db.execute(sql`SELECT 1`))
      return { status: 'ok', latencyMs: Date.now() - start }
    }),
  }
}
```

**Q: How does RequestContext get populated?**

`RequestContext` is created in HTTP middleware and enriched as requests flow through the pipeline:

```ts
interface RequestContext {
  requestId: string     // set immediately on request entry (crypto.randomUUID())
  userId?: string       // set by auth middleware after session/API key validation
  scopeId?: string      // set by scope middleware after x-scope-id header extraction
  scopeType?: string    // set by scope middleware
  logger: Logger        // child logger — rebinds with each new field added
  startedAt: number     // performance tracking
}
```

Auth and scope population is **pluggable via middleware**, not hardcoded. Anvil provides a `requestContext` AsyncLocalStorage instance, a `getRequestContext()` accessor, and a `getLogger()` convenience shorthand that returns `getRequestContext().logger` (falls back to root pino instance if called outside a request, e.g., during boot or in a job). The consuming app's auth middleware (better-auth in YDTB's case) populates `userId`. The scope middleware (oRPC scope middleware in YDTB) populates `scopeId`. Anvil doesn't know about better-auth or oRPC — it just provides the storage mechanism.

The context enrichment looks like:
```ts
// In auth middleware (app-specific, not Anvil)
const ctx = getRequestContext()
if (ctx) {
  ctx.userId = user.id
  ctx.logger = ctx.logger.child({ userId: user.id })
}
```

**Q: Priority cut for v0.1 of anvil-server?**

**Must ship (v0.1):**
1. Lifecycle manager (resource registry, shutdown, health)
2. `createServer(config)` — HTTP server, tool surface processing, route mounting
3. `getLayer(key)` — layer access from tool code
4. Request context (AsyncLocalStorage)
5. `getLogger()` accessor — console fallback during boot, `LogLayer` logger once layers are ready (logging is a regular layer, not a framework dependency — pino ships as `@ydtb/anvil-layer-pino`)

**Fast follow (v0.2):**
6. Scope-aware SPA handler (Tier 1 branded shell)
7. `createWorker(config)` — separate entry point
8. Error reporting (Sentry)

Rationale: v0.1 must be able to boot, serve requests, and shut down cleanly. The SPA handler, worker mode, and Sentry are meaningful but don't block the core lifecycle loop. The scope-aware SPA handler requires the server to work first, and worker mode requires the lifecycle manager to be proven before splitting into a second entry point.

### Build / Dev Experience

**Q: How to run the test suite?**

Per-package: `cd packages/hooks && bunx vitest run`
From root (once turbo is wired): `bun run test` (runs `turbo run test`)

No Docker or external services needed for hook tests — they're pure in-memory. When we add layer tests (postgres, redis, bullmq), those will need Docker containers. We'll add a `docker-compose.test.yml` when we get there, similar to YDTB's pattern (`bun run db:start:test`).

**Q: Dev workflow for testing anvil packages against YDTB locally?**

Not wired yet — this is a decision to make. Options:
- **Option A: `file:` references** — YDTB's `package.json` points to `file:../../anvil/packages/hooks` etc. Simple but brittle, no version tracking.
- **Option B: `bun link`** — `cd ~/projects/anvil/packages/hooks && bun link` then `cd ~/projects/ydtb && bun link @ydtb/anvil-hooks`. Better for development.
- **Option C: Publish to npm and consume normally** — cleanest but slowest iteration loop.

Recommendation: **Option B (`bun link`)** during active development, switch to **Option C** once packages stabilize. Don't start consuming Anvil packages from YDTB until `anvil-server` exists — YDTB still runs on Nitro and its own plugin-sdk. The migration is a future phase.

### Design Decisions

**Q: Alternatives considered and rejected for the server?**

- **Fastify** — considered, rejected. Heavier than needed, plugin system overlaps with Anvil's own composition model. Would be fighting two plugin systems.
- **Express** — considered, rejected. No modern standards (Request/Response API), middleware model is dated.
- **Hono** — selected. Lightweight, Web Standard API (Request/Response), works on Node/Bun/Deno/edge, minimal surface area. We just need a router and middleware chain — Hono does exactly that.
- **h3 standalone (without Nitro)** — was a viable alternative to Hono. Would minimize YDTB handler migration. **Rejected** — optimizing for one consumer's migration bakes in assumptions. YDTB's direct h3 surface is small (most handlers are behind oRPC), so migration cost is bounded.
- **Replacing oRPC** — considered replacing oRPC with Effect RPC or Effect HttpApi. Rejected. oRPC works well for type-safe client-server calls, is mature (v1.0), and has first-class TanStack Query integration that Effect RPC lacks. oRPC stays as the RPC transport. Anvil's server wraps it, doesn't replace it.

**Q: Where exactly does plain TypeScript end and Effect begin?**

Effect is used in **two places only**:

1. **Layer lifecycle** — `Layer.scoped()` + `Effect.acquireRelease()` for resource creation/cleanup. `Layer.mergeAll()` for composing the dependency graph. `ManagedRuntime` as the DI container.

2. **Layer health checks** — `_healthCheck` on each `LayerConfig` is an Effect program (allows timeout, error handling, concurrent execution via Effect combinators).

Effect is **NOT** used for:
- HTTP request handling (that's Hono/h3)
- RPC dispatch (that's oRPC)
- Hook system (that's `@ydtb/anvil-hooks`)
- Request context (that's AsyncLocalStorage)
- Tool business logic (unless the tool opts in)
- Logging (that's pino)

The boundary is clean: Effect manages the lifecycle of infrastructure resources. Everything else is plain TypeScript. If a tool author imports `effect` in their own code, that's their choice — the framework doesn't require it.

### Open Questions

**Q: Unresolved questions we're still mulling over?**

- ~~**h3 vs Hono**~~ — **Decided: Hono.** Anvil is a standalone framework, not optimized for one consumer's migration. YDTB's direct h3 surface is small (SPA fallback, health endpoint, a few raw routes — most handlers are behind oRPC). Hono's Web Standard API, larger ecosystem, and runtime portability make it the cleaner foundation.
- ~~**How the virtual module plugin moves**~~ — **RESOLVED (Session 2).** Built `@ydtb/anvil-build` with `anvilPlugin(config)`. Standard Rollup resolveId + load hooks. Generates 6 virtual modules. 16 tests passing. Dev server story still needs design work.
- ~~**Client-side layer delivery**~~ — **RESOLVED (Session 2).** Built `useLayer(key)` + `LayerProvider` in `@ydtb/anvil-client`. React context with `ClientLayerMap` augmented via declaration merging. Same extensibility pattern as server layers.
- **How tool `requires` field gets verified at compile time (Level 2)** — the virtual module plugin collects all tools' `requires` arrays. The union of all requirements must be a subset of the keys in `config.layers`. This needs type-level magic in the virtual module output. Not designed yet.

**Q: Known gotchas in YDTB that affect extraction?**

1. **YDTB's `serverHooks` is a module-level singleton** (`packages/plugin-sdk/src/hooks-instance.ts`). Anvil's `HookSystem` is a class you instantiate — but something needs to create the instance and make it available. In YDTB, tools import `serverHooks` directly. **Decision: `getHooks()` accessor**, following the same pattern as `getLayer()` — module-level singleton set during `createServer()` boot, same AsyncLocalStorage upgrade path for v0.2.

2. **YDTB's `db` is a module-level singleton** (`packages/db/src/db.ts`). Tools do `import { db } from '@ydtb/db'`. With Anvil layers, tools call `getLayer('database').db`. This means every tool file that imports `db` needs to change when YDTB migrates to Anvil. That's ~100+ import sites. **Decision: YDTB migration concern, not Anvil design concern.** Anvil's API is `getLayer('database')`. When YDTB migrates, a codemod or find-and-replace handles the import changes.

3. **YDTB's oRPC middleware chain** (`packages/orpc/src/middleware.ts`) imports `auth` directly from `@ydtb/auth`. This is a hardcoded dependency, not a layer. **Decision: Auth is app-specific middleware, not a framework layer.** Anvil provides the RequestContext storage mechanism; the consuming app provides its own auth middleware that populates `userId`. When YDTB migrates, its oRPC middleware keeps importing `@ydtb/auth` — that's app code, not framework code.

4. ~~**The `BroadcastOptions` type**~~ — **RESOLVED (Session 2).** Removed hardcoded YDTB-specific activity/notification side-channels. Replaced with generic `registerSideChannel(optionKey, config)` mechanism. Side-channels are now app-defined, not framework-defined. 27 tests passing including side-channel error handling.

5. ~~**YDTB's virtual module plugin reads `app.config.ts`**~~ — **RESOLVED (Session 2).** Built `@ydtb/anvil-build` with `anvilPlugin(config)` that reads Anvil's `AppConfig` from `compose.config.ts`. Plugin is generic — reads scope tree, discovers tools, generates virtual modules. 16 tests passing.

## Prior Art Research

Frameworks reviewed during Session 1, ranked by architectural similarity:

| Framework | What's Similar | What We Took | What We Rejected |
|---|---|---|---|
| **Vendure** | Closest match. E-commerce on NestJS + TypeORM. Plugins declare entities, resolvers, services, admin UI via `@VendurePlugin({})`. Migrating admin UI to React + TanStack Router + shadcn + Vite (same stack as YDTB). | Plugin-as-package pattern, declarative surface registration | NestJS DI (too heavy, decorator-based). No scope hierarchy. |
| **Medusa v2** | Headless commerce with strict module isolation. 17 commerce modules, each independently replaceable. Workflows pattern (saga/orchestration with compensation/rollback). | Module isolation philosophy, replaceable infrastructure contracts | Workflow orchestration pattern (overkill for our cross-tool communication — hooks are simpler). No scope hierarchy. |
| **Backstage** (Spotify) | Internal dev portal. Plugins have frontend (React) + backend (Express). 89% market share in internal dev portals. | Plugin = frontend + backend surfaces concept | Plugins communicate over HTTP (network boundary). We use in-process hooks — faster, simpler, typed. |
| **Payload CMS 3** | Plugin system on Next.js App Router. Plugins add collections, lifecycle hooks, routes, admin UI. Config-transform pattern. | Lifecycle hooks pattern, config-driven composition | CMS-specific. Config-transform (plugin mutates config) vs our declarative surfaces. |
| **NestJS** | Module/DI system is closest server-side pattern. Modules declare controllers, services, entities, exports. Vendure is built on it. | Module boundary concepts | Decorator-heavy DI, no frontend story, too opinionated for a framework-of-frameworks. |

**What none of them do:** Configurable scope hierarchy + full-stack tool packages + per-scope tool opt-in + cross-tool hooks + virtual module discovery. That combination is what makes Anvil its own thing.

## Session Notes

### Session 2 (2026-04-08)

**Decisions made:**
- **Hono** over h3 for HTTP framework — Anvil is standalone, shouldn't optimize for one consumer's migration
- **`getHooks()` accessor** follows same pattern as `getLayer()` — module-level singleton, AsyncLocalStorage upgrade path
- **Auth is app middleware**, not a framework layer — Anvil provides RequestContext storage, app populates it
- **Logging is a layer**, not a framework dependency — `getLogger()` returns console during boot, LogLayer logger once layers are ready. Pino ships as `@ydtb/anvil-layer-pino`.
- **Edge compatibility** is a design constraint — avoid Node-only patterns where portable alternatives exist
- **Five primitives** — Composition, Tools, Layers, Hooks, Extensions. Extensions are the fifth primitive for app-level systems.
- **Universal extensibility** — `LayerMap`, `ClientContributions`, `ServerContributions` all ship empty, augmented via declaration merging by layer and extension packages
- **`createServer` accepts middleware array** for app-level middleware (CORS, auth, rate limiting). Tools don't add middleware in v0.1.
- **App-level routes on `createServer`** — non-tool routes (settings, API keys, profile) passed via `routes` config, not crammed into tools
- **`_effectLayer` contract** — must be `{ tag: Context.Tag, layer: Layer.Layer }`. Layer packages provide both the tag and layer. Lifecycle module resolves services via the tag after ManagedRuntime acquires resources.

**Work completed:**
- Completed BroadcastOptions cleanup — removed hardcoded YDTB-specific side-channels, replaced with generic `registerSideChannel()`. 27 hook tests passing.
- Aligned design doc (DESIGN.md) with handoff — fixed 7 discrepancies, added Extensions section, updated all code examples
- Deep review of YDTB codebase — mapped full concept model (App, Scopes, Tools, Extensions, Integrations, Layers, Hooks)
- **Reworked `@ydtb/anvil` core types** — empty LayerMap, ClientCore/ClientContributions split, ServerCore/ServerContributions split, defineExtension, extensions field on AppConfig. Zero dependencies. Compiles clean.
- **Scaffolded `@ydtb/anvil-server`** — 5 modules (request-context, accessors, lifecycle, surfaces, create-server). Hono app with request context middleware, health endpoints, Effect lifecycle manager, surface processor with extension contribution collection.
- **Integration test passing** — 4 tests proving full boot→request→shutdown cycle: Effect layer resolution, getLayer/getHooks/getRequestContext, health endpoints, tool hook registration, shutdown cleanup.
- Updated DESIGN.md to reflect five-primitive model, empty-by-default extensibility, extensions section, updated package map, migration path

**Continued building — completed all core framework packages:**
- **Route mounting** — Hono sub-apps at `/api/{toolId}/*`. `fromOrpc()` helper for oRPC.
- **DX helpers** — `getContributions()`, `createLayerConfig()`, `toolEntry()`
- **`@ydtb/anvil-layer-pino`** — first real layer. Pino factory + silent test variant. Integrated with getLogger(). 7 tests.
- **`@ydtb/anvil-layer-postgres`** — real database layer with Effect acquireRelease lifecycle. Connection pool + Drizzle ORM + health check. Tested against real Postgres. 4 tests.
- **Example app** — minimal compose.config + layer + extension + tool + server entry. All five primitives working, curlable.
- **`@ydtb/anvil-build`** — virtual module plugin. anvilPlugin(config) generates 6 virtual modules from compose.config. collectTools() with deduplication. 16 tests.
- **`@ydtb/anvil-client`** — client runtime. assembleRoutes(), createApiClient(), useLayer/LayerProvider, useScope/ScopeProvider. 15 tests.
- **Surfaces vs Hooks** clarified — surfaces for structural (what a tool IS), hooks for runtime (what happens when X OCCURS). Replaces YDTB's "everything through hooks" pattern.

**Session 2 totals:** 8 packages, 76 tests, ~6,200 lines, 8 commits pushed to remote. Core framework complete.

### Session 1 (2026-04-08)
- Reviewed Effect-TS as potential infrastructure layer — decided to use internally in server, not expose to tools
- Audited YDTB codebase for production readiness gaps (10 issues found, all critical/high)
- Researched Vendure, Medusa v2, Backstage, NestJS for patterns
- Designed server infrastructure replacement for Nitro
- Designed Anvil as standalone framework extracted from YDTB patterns
- Named the framework, created repo at github.com/yourdigitaltoolbox/anvil
- Built `@ydtb/anvil` (core types) and `@ydtb/anvil-hooks` (hook system with typed wrappers, 23 tests)
