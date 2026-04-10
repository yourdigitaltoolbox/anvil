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

## Key Documentation

- `docs/DESIGN.md` — Full framework architecture
- `docs/LIFECYCLE.md` — Complete lifecycle model (server 8 phases, client 6 phases, extension 6 phases)
- `docs/PACKAGING.md` — Three-layer packaging model (framework → domain → app)
- `docs/TOOLKIT_REFACTOR.md` — Rationale for framework/toolkit separation
- `docs/API_REFERENCE.md` — API reference
- `docs/GETTING_STARTED.md` — Getting started guide

## Reference Implementation

YDTB at `/Users/john/projects/ydtb` is the first consumer. Migration in progress — communication via `~/projects/ydtb/migration/FRAMEWORK_TEAM.md`. Key YDTB docs:
- `docs/server-infrastructure-design.md` — Nitro replacement plan (YDTB-specific migration)
- `CLAUDE.md` — full codebase guide with conventions and architecture

## Current State

**Core framework complete. Toolkit layer built. All layer packages done. YDTB consuming via bun link.** Fourteen packages built (framework + toolkit + 8 layers + client + build). YDTB migration underway in `~/projects/ydtb/` with active communication channel via `~/projects/ydtb/migration/FRAMEWORK_TEAM.md`.

### `@ydtb/anvil` (core types) — ✅ DONE
- Four framework primitives: `defineApp`, `defineExtension`, layers (`LayerMap`), hooks
- Universal extensibility: `LayerMap`, `ClientContributions`, `ServerContributions` — all empty, augmented via declaration merging
- `LayerConfig`, `RequiredLayers` — derive from `LayerMap`, no hardcoded layer contracts
- `ClientCore` / `ServerCore` — framework-owned surface fields, separate from extension contributions
- `AppConfig` extensible via index signature — toolkit augments with `scopes`, `tools`, etc.
- `Extension` type with `client`/`server` as `unknown` — toolkit narrows these
- Zero runtime dependencies, zero Effect dependency
- **Key separation:** `defineTool`, `defineScope`, `defineClient`, `defineServer` are toolkit concepts, NOT framework. Framework ships generic.

### `@ydtb/anvil-hooks` — ✅ DONE (27 tests)
- `HookSystem` class — actions, broadcasts, filters
- `createTypedHooks()` — compile-time safe wrappers
- `setHookErrorHandler()` — pluggable error handler
- `registerSideChannel()` — generic side-channel mechanism
- Zero dependencies, framework-agnostic

### `@ydtb/anvil-server` — ✅ DONE (21 tests)
- `createServer(config)` — Hono app, middleware, health endpoints, boot sequence, shutdown
- `createWorker(config)` — same boot, no HTTP. Accepts pluggable `processSurfaces` callback.
- `createSpaHandler({ routes, renderShell })` — flat route matching, loader execution, app renders HTML
- `getLayer(key)` — synchronous layer access via Effect ManagedRuntime (v0.2: AsyncLocalStorage with module-level fallback, `withLayers()` for test isolation)
- `getHooks()` — hook system access, module-level singleton
- `getContributions(extensionId)` — typed accessor for extension contributions
- `getRequestContext()` / `getLogger()` — per-request state, console fallback → LogLayer once booted
- `onExtensionBoot(id, fn)` — post-collection boot hooks for extensions
- `onExtensionShutdown(id, fn)` — symmetric teardown, runs BEFORE layers tear down
- Lifecycle manager — Effect layer composition, `_effectLayer: { tag, layer }` contract, health checks, graceful shutdown
- Shared boot sequence (`boot.ts`) — accepts pluggable `processSurfaces` callback. Runs extension boot hooks after contribution collection.
- Surface processor — registers hooks, extracts routers, collects extension contributions
- Route mounting — Hono sub-apps at `/api/{toolId}/*`
- Error handling — Hono `onError` catches unhandled errors, reports to ErrorLayer, returns clean JSON
- `fromOrpc()` — wraps oRPC handlers for framework-agnostic mounting
- `createLayerConfig()` — enforced layer authoring helper
- `/healthz` (liveness) + `/readyz` (layer health checks with latency)
- `ServerConfig` accepts middleware array and app-level routes
- Duck-type Hono check — fixes `instanceof` failure across bun link boundaries

### `@ydtb/anvil-build` — ✅ DONE (16 tests)
- `anvilPlugin(config)` — Vite/Rollup plugin generating virtual modules. Extensible: accepts `modules` map from toolkits.
- Virtual modules: `virtual:anvil/server-tools`, `virtual:anvil/client-tools`, `virtual:anvil/schema`, `virtual:anvil/scope-tree`, `virtual:anvil/permissions`, `virtual:anvil/extensions`
- `collectTools()` / `collectToolsWithScopes()` — scope tree traversal with deduplication
- `createDevMiddleware({ viteConfig })` — Vite middleware mode via internal Node.js http server. Embeds Vite inside Hono for single-server dev (no second port).
- Type declarations for all virtual modules (`virtual.d.ts`)
- Works with both Vite (client) and Rollup (server) builds
- Upgraded to Vite 8

### `@ydtb/anvil-toolkit` — ✅ DONE (NEW — Session 3)

YDTB's module system built on top of the generic framework. Three entry points — no server deps leak to client.

**`@ydtb/anvil-toolkit/core`** — Universal exports (no server, no React):
- `defineTool(descriptor)` — tool identity (id, name, package)
- `defineScope(definition)` — scope hierarchy node (type, label, urlPrefix, includes, children)
- `defineClient(definition)` — what a tool contributes to the browser
- `defineServer(definition)` — what a tool contributes to the server
- `defineExtension(definition)` — app-level system with contribution contracts
- `collectTools(scopeTree)` — scope tree traversal with deduplication
- **Rich ScopeDefinition** — icon, defaultRoute, selfCreate, createPage, onboarding, labelPlural, server.postCreate, index signature
- **Scope hierarchy utilities** — `getScopeHierarchy()`, `getChildTypes()`, `isRootScope()`, `isLeafScope()`, `getAncestorTypes()`, `getRootScopeType()`, `getAllScopeTypes()`, `isDescendantType()`, `getPrimaryChildType()`
- **Chain traversal helpers** — `resolveLowestFirst()`, `resolveHighestFirst()`, `collectAcrossChain()`, `resolveWithLock()` — generic mechanics, no cascade policy
- **Server-side chain builder** — `buildScopeChain(scopeId, resolver)` with app-provided `ScopeEntityResolver`

**`@ydtb/anvil-toolkit/client`** — Core + React helpers:
- `createAnvilApp({ scopeTree, tools, layouts, providers, layers })` — assembles routes, guard pipelines, context providers, client contributions
- `useContributions<T>(extensionId)` hook + `ContributionProvider`
- Routes have `layout` field matching `defineRouteLayout` id — no more publicRoutes/authenticatedRoutes/fullscreenRoutes

**`@ydtb/anvil-toolkit/server`** — Server wrappers:
- `createToolServer(config)` — wraps `createServer` with tool surface processing
- `createToolWorker(config)` — wraps `createWorker` with auto-wiring: registers handlers, schedules crons, wires trigger-based jobs to broadcast listeners
- `processSurfaces()` — tool-specific surface processor
- **Tailwind auto-discovery** — `tailwindSourcesPlugin()` for Vite, `writeTailwindSources()` for build scripts. Generates `@source` directives from scope tree.

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
- `drizzle-orm` is a **peerDependency** (not direct) — prevents duplicate version conflicts via bun link
- `augment.d.ts` + `env.d.ts` import pattern for LayerMap visibility through bun link

### `@ydtb/anvil-layer-sentry` — ✅ DONE (3 tests)
- `sentry()` factory — initializes Sentry SDK, captures with context
- `noopErrors()` — logs to console or silent for tests
- `ErrorLayer` contract: `capture`, `setUser`, `addBreadcrumb`
- Effect acquireRelease — flushes pending events on shutdown
- Integrated with server error handler — unhandled route errors auto-reported

### `@ydtb/anvil-layer-redis` — ✅ DONE (8 tests)
- `redis()` factory — ioredis with connection lifecycle, key prefix, health check
- `memory()` factory — in-memory Map with TTL expiration for dev/test
- `CacheLayer` contract: `get`, `set`, `del`, `has`, `getMany`, `delPattern`
- TTL support on set, periodic cleanup in memory variant
- Both variants implement identical contract — swap one line in compose.config

### `@ydtb/anvil-layer-bullmq` — ✅ DONE (10 tests)
- `bullmq()` factory — Queue + Worker lifecycle via Effect acquireRelease
- `memoryJobs()` — in-memory queue for dev/test, sync handler dispatch
- `JobLayer` contract: `enqueue`, `registerHandler`, `registerCron`, `getJob`
- `registerCron(name, schedule, handler)` — cron scheduling support (uses BullMQ's `upsertJobScheduler()`)
- Job status tracking (waiting, completed, failed)

### `@ydtb/anvil-layer-resend` — ✅ DONE (8 tests)
- `resend()` factory — Resend SDK, stateless HTTP
- `consoleEmail()` — logs to console, silent mode for tests
- `EmailLayer` contract: `send` → `{ id }`

### `@ydtb/anvil-layer-s3` — ✅ DONE (13 tests)
- `s3()` factory — S3Client lifecycle, supports MinIO/R2 endpoints
- `memoryStorage()` — Map<string, Buffer>, seed data support
- `StorageLayer` contract: `put`, `get`, `del`, `exists`, `getUrl`

### `@ydtb/anvil-layer-auth` — ✅ DONE (12 tests)
- `betterAuth()` factory — wraps better-auth with plugin system
- `mockAuth()` — predefined users, Bearer token auth for tests
- `AuthLayer` contract: `getSession`, `getUser`, `handler`, `instance`
- `authMiddleware()` — Hono middleware, populates RequestContext.userId
- `authRoutes()` — mounts better-auth's built-in routes
- Plugin helpers: `apiKeys()`, `twoFactor()`, `oAuth()`, `organization()`, `emailVerification()`
- Auth is a fat layer — better-auth plugins are config, not Anvil extensions

### `@ydtb/anvil-client` — ✅ DONE (15 tests)
- `assembleRoutes(scopeTree, tools)` — pure function: scope tree + tool surfaces → scope-grouped route structure
- `createApiClient(toolId)` — URL + headers builder with automatic scope injection
- `configureApiClients()` — lazy global config, called once at boot
- `useLayer(key)` / `LayerProvider` — client-side swappable services via React context
- `ClientLayerMap` — empty interface, augmented via declaration merging (same pattern as server)
- `useScope()` / `ScopeProvider` — current scope context from URL params
- `getCurrentScope()` — module-level ref for non-React access (API headers)
- **Guards:** `defineGuard({ id, check })` — composable route access checks with cascading context. `runGuardPipeline(guards, ctx)` executes sequentially, each guard can pass, redirect, or render.
- **Route Layouts:** `defineRouteLayout({ id, layout, guards, urlPrefix?, priority? })` — containers with guard pipelines. Replaces hardcoded route tiers (public/authenticated/fullscreen).
- **Context Providers:** `defineContextProvider({ id, provider, priority? })` + `ContextProviderStack` — tools contribute React providers, nested by priority
- Framework provides data + hooks, app owns the React rendering (TanStack Router setup, provider hierarchy)

### Example App — ✅ RUNNING
- `examples/minimal/` — compose.config + layer + extension + tool + server entry
- Demonstrates framework primitives working together
- Runnable with `bun run examples/minimal/server.ts`, curlable endpoints

### YDTB Migration (`~/projects/ydtb/`) — ✅ ACTIVE
The main YDTB project is being migrated in-place to consume Anvil packages via `bun link`. A separate migration agent handles the YDTB side; communication happens via `~/projects/ydtb/migration/FRAMEWORK_TEAM.md`.

**Communication pattern:** Migration agent writes requests to FRAMEWORK_TEAM.md → Framework team responds with changes + resolution details → Migration agent pulls latest framework via `bun link`.

**All requests resolved so far:**
- Toolkit client layout/guard integration
- Client extension contribution collection
- Extension post-collection boot phase
- Monorepo packaging mental model
- Scope hierarchy/chain-walking conveniences
- Scope membership layer design (decision: stays as extension, not toolkit)
- Lifecycle model clarity and symmetric teardown
- Richer ScopeDefinition
- App-level module abstraction for non-tool APIs
- Client contribution access primitive
- Job execution plumbing gap
- Drizzle type incompatibility with linked packages

**For bun link consumers:** Create `env.d.ts` importing each layer package to make `declare module` augmentations visible. See `packages/anvil/src/layer-augments.d.ts` for details.

**Key decision:** YDTB-specific code does NOT live in the Anvil repo. Extensions and tools are built in YDTB, consuming Anvil as a regular dependency. This keeps the framework generic.

## Surfaces vs Hooks (Client Communication)

Tools use two complementary mechanisms for communication:

| Concern | Mechanism | When |
|---|---|---|
| What a tool contributes (routes, nav, cards, search providers) | Surfaces + Extensions | Boot time, declarative, typed |
| What happens when X occurs (events, reactions) | Hooks (broadcasts) | Runtime, event-driven |
| Ask another tool to do something | Hooks (actions) | Runtime, request/response |
| Transform data flowing through the system | Hooks (filters) | Runtime, pipeline |

Surfaces handle **structural** communication (what a tool IS). Hooks handle **runtime** communication (what happens when something OCCURS). This replaces YDTB's "everything through hooks" pattern — hooks were being abused for collecting static data. Now each mechanism does what it's good at.

## YDTB Migration Plan

Migration from YDTB v1 to ydtb-anvil. Built in `~/projects/ydtb-anvil/`, consuming Anvil as a dependency. Uses the existing YDTB database and tables — change as little as possible.

### Key Principles
- **Bottom-up** — foundation first, but with visual feedback at every phase
- **Scopes are an extension, not framework or auth** — extracted from better-auth into a proper extension
- **Auth stays clean** — just users, sessions, API keys. No scope concepts.
- **Keep existing tables** — migrate schema definitions, not data
- **Every phase produces something visible** — no "backend-only" phases

### Phase 1: Foundation + Minimal Client
Build the bedrock and a visible shell to verify it works.

**Server:**
- Port 20 platform database tables to Drizzle schema in ydtb-anvil
- Auth layer — real better-auth (no scope plugin, just auth)
- Scope extension — port scope CRUD, membership, invites from the better-auth plugin into a proper extension with its own Hono routes
- Scope middleware — validates membership, populates RequestContext.scopeId

**Client:**
- Basic app shell — login page, scope selection, empty dashboard layout
- Scope-aware routing — navigate into scopes, see the chrome
- Auth gate — redirect to login if not authenticated

**Validates:** Sign in → see scopes → navigate into a scope → see an empty page with sidebar

### Phase 2: Permissions + Team Tool
First real tool on the platform.

- Port permissions system (RBAC with hierarchical scope resolution)
- Permission middleware for oRPC endpoints
- Team tool — member list, invites, role management (uses platform tables, no tool tables)

**Validates:** Sign in → enter scope → manage team → verify permissions block unauthorized actions

### Phase 3: Platform Extensions
Enrich the shell with cross-cutting features.

- Activity logging (extension — listens to broadcasts, stores audit log)
- Notifications (extension — delivery engine, notification panel UI)
- Settings/Preferences (extension — key-value CRUD per scope/user)
- Onboarding (extension — step wizard, tool-contributed steps)
- Search (extension — aggregates tool search providers)
- Credentials/Integrations (extension — OAuth vault, provider registry)

**Validates:** Does the extension model work for real YDTB features?

### Phase 4: Simple Tools
Prove the tool pattern works.

- Dashboard (1 table, low complexity)
- Settings UI, Join Codes, Notifications UI
- These are quick wins that fill out the app

### Phase 5: Complex Tools
The heavy hitters, migrated once patterns are proven.

- Contacts (7 tables, custom field engine, views)
- Billing (wallet, Stripe, cascade checks)
- Offers (location targeting, redemption conditions)
- GMB (Google API sync)
- AI Service

### YDTB Audit Summary

| Category | Items | Complexity |
|---|---|---|
| Platform tables | 20 | Low-Medium |
| Tool tables | 25 across 6 tools | Varies |
| Auth system | better-auth + 1800-line scope plugin | High |
| Permissions | RBAC + cascading resolution | High |
| Platform infra | Activity, notifications, tokens, settings, onboarding, search, jobs | Medium-High |
| Tools | 12 tools, ~380 files | Low to Very High |
| Integrations | Google, PostHog, Resend | Medium |
| Client shell | Contexts, auth, routing, ~180 files | Medium |
| Shared packages | UI, lib, env, test harness | Low |

Total: ~720 TypeScript files (excluding tests and node_modules)

## What's Next (Anvil Framework)

**Core framework + toolkit + all layers complete. YDTB migration actively consuming.** 14 packages, all pushed.

### Priority 1: Support YDTB migration
Framework improvements driven by migration needs — add features to Anvil only when the YDTB migration agent reveals a gap. Monitor `~/projects/ydtb/migration/FRAMEWORK_TEAM.md` for new requests.

### Priority 2: Documentation
- API reference documentation for all packages
- Getting started guide
- HANDOFF.md kept current as source of truth

### Priority 3: Dev experience
- `turbo run test` from root wired up
- npm publishing setup
- Cache helpers (SPA shell caching, loader caching middleware)

### Completed since Session 2 (formerly "next"):
- ✅ `getLayer` v0.2 — AsyncLocalStorage-based with module-level fallback, `withLayers()` for test isolation
- ✅ Dev middleware — Vite middleware mode via internal Node.js http server (single-server dev)
- ✅ Toolkit package — defineTool, defineScope, defineClient, defineServer, processSurfaces
- ✅ Guards + route layouts + context providers
- ✅ Extension lifecycle (onExtensionBoot/onExtensionShutdown)
- ✅ Scope hierarchy utilities + chain traversal
- ✅ Tailwind auto-discovery
- ✅ createToolWorker auto-wiring (cron + triggers)
- ✅ Three-layer packaging model documented

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
- **SPA handler is flat route matching** — no scope-URL parsing assumptions. Routes are a flat list with full URL patterns. Framework matches URL → runs loader if present → calls app's renderShell. App owns the HTML completely. Supports Tier 1 (static shell), Tier 2 (streaming SSR), Tier 3 (per-route loaders) — app chooses, framework doesn't decide.
- **Caching is a layer, not a framework feature** — CacheLayer provides get/set/del/has/getMany/delPattern. Framework could provide cache helpers (SPA shell caching, loader caching, API middleware) that use the CacheLayer — but caching policy is always the app's decision.
- **Worker separation** — `createWorker()` shares boot sequence with `createServer()` via `boot.ts`. Same layers, hooks, surfaces. No HTTP.
- **Framework vs Toolkit separation** — The framework (`@ydtb/anvil`, `@ydtb/anvil-server`, `@ydtb/anvil-client`) is generic. Tools, scopes, and the module system are YDTB's toolkit (`@ydtb/anvil-toolkit`). `defineTool`/`defineScope`/`defineClient`/`defineServer` live in the toolkit, not the framework. Another Anvil consumer would build their own toolkit with different module shapes.
- **Guards and route layouts are framework** — `defineGuard()`, `defineRouteLayout()`, `defineContextProvider()` live in `@ydtb/anvil-client`. They're generic enough for any Anvil app. Route layouts replace hardcoded tiers (public/authenticated/fullscreen) with composable, guard-protected containers.
- **Three-layer packaging model** — Framework/Toolkit Core (generic, any Anvil consumer) → Domain Packages (opinionated, reusable within org) → App Composition (deployment-specific wiring). See `docs/PACKAGING.md`.
- **Extension lifecycle** — `onExtensionBoot(id, fn)` runs after all surfaces are collected. `onExtensionShutdown(id, fn)` runs BEFORE layers tear down. Symmetric, predictable.
- **Scope hierarchy is toolkit, not framework** — Pure functions for static queries and chain traversal. No DB, no routes. App provides `ScopeEntityResolver` for server-side chain building. Toolkit owns mechanics, app owns policy.
- **Membership stays as extension, not toolkit** — Too opinionated for toolkit core. Requires persistence, routes, business logic. YDTB's scope extension owns membership, invitations, roles.

## Concept Model

The framework core is deliberately empty — all concrete functionality comes from packages that extend the framework through a universal declaration merging pattern. The framework provides four primitives. Toolkits (like `@ydtb/anvil-toolkit`) add module systems on top.

### 1. Composition (App)

**App** — the top-level container. One per deployment. `AppConfig` is extensible via index signature — toolkits augment with their own fields (`scopes`, `tools`, etc.). Framework only knows about `brand`, `layers`, `extensions`, and `middleware`.

The App also owns **app-level routes** — pages that exist outside tool surfaces (`/profile`, `/onboarding`, auth pages). Passed via `routes` config on `createServer`.

### 2. Extensions

**App-level systems that define contracts for modules to contribute to.** Each Extension has an identity, collects contributions, and optionally has its own client/server surface.

### 3. Tools (Toolkit concept — NOT framework)

In YDTB's toolkit, the unit of business functionality is a **Tool** — a self-contained package that exports standardized surfaces via `defineClient()`/`defineServer()`. Tools communicate through hooks. Tools contribute to extensions.

Another Anvil consumer would define their own module shape — "widgets", "plugins", "features" — whatever makes sense for their domain. The framework doesn't know about tools.

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

### 4. Extensions

**App-level systems that define contracts for modules to contribute to.** Extensions are platform-level systems that orchestrate cross-cutting concerns. Each Extension has an identity, collects contributions, and optionally has its own client/server surface.

Extension lifecycle:
- `onExtensionBoot(id, fn)` — runs after all surfaces are collected (materializing registries, starting listeners)
- `onExtensionShutdown(id, fn)` — runs BEFORE layers tear down (cleanup, unsubscribe)

YDTB extensions (examples):

| Extension | Contract (what tools contribute) | Extension provides |
|---|---|---|
| Onboarding | Steps (component, priority, gate, level) | Setup wizard page, step navigation, completion validation |
| Search | Search provider (query function) | Global search UI, query aggregation |
| Dashboard | Cards (component, order) | Dashboard layout, card grid |
| Notifications | Providers (delivery config) | Notification panel, preferences, delivery engine |
| Activity | — (via broadcast side-channels) | Activity feed UI, activity log storage |

In code:

```ts
// @ydtb/ext-onboarding — an extension package
import { defineExtension } from '@ydtb/anvil-toolkit/core'

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
import { defineApp } from '@ydtb/anvil'
import { defineScope } from '@ydtb/anvil-toolkit/core'

export default defineApp({
  brand: { name: 'YDTB' },
  layers: { ... },
  scopes: defineScope({ ... }),   // toolkit augments AppConfig with `scopes`
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

### Scope System (Toolkit concept, NOT framework)

**Key architectural decision (Sessions 2 & 3):** Scopes are a TOOLKIT feature (`@ydtb/anvil-toolkit`), not framework core. The framework doesn't know about scopes. The toolkit provides `defineScope()`, scope hierarchy utilities, and chain traversal helpers.

**What the toolkit owns (structural mechanics):**
- `ScopeDefinition` type with rich fields (icon, defaultRoute, selfCreate, server.postCreate, etc.)
- Static hierarchy queries (`getScopeHierarchy`, `getChildTypes`, `isLeafScope`, etc.)
- Chain traversal helpers (`resolveLowestFirst`, `resolveHighestFirst`, `collectAcrossChain`, `resolveWithLock`)
- Server-side `buildScopeChain()` with app-provided `ScopeEntityResolver`

**What the app owns (domain behavior):**
- **Scope extension** — manages scope entities, membership, hierarchy, invitations, join codes. Has its own database tables, routes, and UI.
- **Scope middleware** — app-provided Hono middleware that reads `x-scope-id`, validates membership, populates `RequestContext.scopeId`.
- **Permissions** — RBAC, cascade, role templates. Part of the scope extension.
- **Domain events** — `scope:created`, `member:joined`, etc. Dispatched by the scope extension via `getHooks().broadcast()`.

Another Anvil app might not have scopes at all, or might implement multi-tenancy completely differently. The framework doesn't care. Even the toolkit's scope system is optional — an Anvil toolkit consumer could ignore scopes entirely.

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

~~All shipped.~~ v0.1 AND v0.2 both complete. Server, worker, SPA handler, error reporting, all layers, toolkit.

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
- ~~**How the virtual module plugin moves**~~ — **RESOLVED (Session 2).** Built `@ydtb/anvil-build` with `anvilPlugin(config)`. Extensible plugin accepts `modules` map from toolkits.
- ~~**Client-side layer delivery**~~ — **RESOLVED (Session 2).** Built `useLayer(key)` + `LayerProvider` in `@ydtb/anvil-client`.
- ~~**Dev server story**~~ — **RESOLVED (Session 3).** `createDevMiddleware()` embeds Vite inside Hono via internal Node.js http server. Single-server dev, no second port.
- **How tool `requires` field gets verified at compile time (Level 2)** — Not designed yet. Low priority — runtime checks catch missing layers on boot.

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

**Continued — server v0.2 + layer packages:**
- **`createWorker`** — shared boot.ts, no HTTP, collects jobs. 2 tests.
- **Error handling** — Hono onError, reports to ErrorLayer, clean JSON responses. 1 test.
- **`@ydtb/anvil-layer-sentry`** — sentry() + noopErrors(). Effect acquireRelease for flush. 3 tests.
- **SPA handler** — flat route matching (not scope-URL parsing). Loader execution. App-owned renderShell. Framework-agnostic. 8 tests.
- **`@ydtb/anvil-layer-redis`** — redis() + memory(). Full CacheLayer contract with TTL, getMany, delPattern. 8 tests.
- **Caching architecture** — one CacheLayer, framework provides helpers, app decides policy.
- **Surfaces vs hooks** — structural (surfaces) vs runtime (hooks) clarified.

**Completed all layer packages:**
- **`@ydtb/anvil-layer-bullmq`** — Queue + Worker lifecycle, memory variant for tests. 10 tests.
- **`@ydtb/anvil-layer-resend`** — Resend SDK, console variant for tests. 8 tests.
- **`@ydtb/anvil-layer-s3`** — S3Client lifecycle, memory variant for tests. 13 tests.

**Layer dependency system + auth layer:**
- **Shared tag registry** (`getLayerTag()`) — enables inter-layer dependencies. Effect resolves boot order.
- **`Layer.provideMerge`** in lifecycle manager — dependency graph resolution.
- **`createLayerConfig(id, layer, opts)`** — simplified API, tag auto-derived.
- **`@ydtb/anvil-layer-auth`** — better-auth integration with plugin system, mock variant, auth middleware. 12 tests.
- **Duck-type Hono check** — fixes `instanceof` failure across bun link boundaries.
- Updated all 8 layer packages to use `getLayerTag()`.

**YDTB consuming project:**
- **Scaffolded `~/projects/ydtb-anvil/`** — separate project consuming Anvil via bun link.
- compose.config.ts with all 8 layers (dev variants). Server boots, health checks pass, mock auth works.
- YDTB-specific extensions and tools will be built here, not in the Anvil repo.

**Session 2 totals:** 13 packages, 141 tests, ~12,000+ lines, 19 commits pushed to remote. Core framework + server v0.2 + all 8 layer packages + YDTB consuming project complete.

### Session 3 (2026-04-09)

**Major architectural refactor: separated generic framework from YDTB-specific toolkit.**

**Decisions made:**
- **Framework vs toolkit boundary** — `defineTool`, `defineScope`, `defineClient`, `defineServer` are YDTB toolkit concepts, NOT framework primitives. The framework provides composition (`defineApp`), extensions (`defineExtension`), layers, hooks, server/client runtime. Another Anvil consumer would build their own module system.
- **Guards and route layouts are framework** — generic enough for any Anvil app. Replace hardcoded route tiers.
- **Membership is NOT toolkit** — too opinionated. Stays as YDTB's scope extension.
- **Three-layer packaging model** — framework/toolkit → domain packages → app composition.
- **Single-server dev** — Vite middleware mode (internal Node.js http server), no second port.
- **Client route model reworked** — Routes have `layout` field matching `defineRouteLayout` id, replacing publicRoutes/authenticatedRoutes/fullscreenRoutes.
- **`defineScope` not `scope()`** — consistent with `define*` naming convention.
- **drizzle-orm as peer dep** — prevents duplicate version conflicts via bun link.

**Work completed:**
- **`@ydtb/anvil-toolkit`** — three entry points (core/client/server). defineTool, defineScope, defineClient, defineServer, processSurfaces, collectTools, createAnvilApp, createToolServer, createToolWorker.
- **Guards** (`@ydtb/anvil-client`) — `defineGuard()`, `runGuardPipeline()` with cascading context.
- **Route layouts** (`@ydtb/anvil-client`) — `defineRouteLayout()` — containers with guard pipelines, priority ordering.
- **Context providers** (`@ydtb/anvil-client`) — `defineContextProvider()`, `ContextProviderStack`.
- **Extension lifecycle** (`@ydtb/anvil-server`) — `onExtensionBoot()`, `onExtensionShutdown()`. Symmetric teardown.
- **Scope hierarchy utilities** (`@ydtb/anvil-toolkit/core`) — `getScopeHierarchy()`, `getChildTypes()`, `isLeafScope()`, `getAncestorTypes()`, etc. Plus chain traversal: `resolveLowestFirst()`, `resolveHighestFirst()`, `collectAcrossChain()`, `resolveWithLock()`. Plus server-side `buildScopeChain()` with `ScopeEntityResolver`.
- **Rich ScopeDefinition** — icon, defaultRoute, selfCreate, createPage, onboarding, labelPlural, server.postCreate, index signature.
- **useContributions hook** — `useContributions<T>(extensionId)` + `ContributionProvider`.
- **createToolWorker auto-wiring** — registers handlers, schedules crons via `registerCron()`, wires trigger jobs to `onBroadcast`.
- **JobLayer contract** — added `registerCron(name, schedule, handler)`.
- **Tailwind auto-discovery** — `tailwindSourcesPlugin()` generates `@source` directives from scope tree.
- **Dev middleware** — `createDevMiddleware()` embeds Vite inside Hono via internal Node.js http server.
- **Vite 8 upgrade** in build package.
- **Framework generalization** — `AppConfig` extensible via index signature, `Extension.client`/`server` as `unknown`, boot.ts accepts pluggable `processSurfaces`.
- **Drizzle peer dep fix** — prevents duplicate drizzle-orm versions through bun link.
- **LayerMap augmentation guidance** — `env.d.ts` import pattern for bun link consumers.
- **Documentation** — `LIFECYCLE.md` (server 8 phases, client 6 phases, extension 6 phases), `PACKAGING.md` (three-layer model).
- **YDTB migration support** — 12 framework requests resolved via FRAMEWORK_TEAM.md.

### Session 1 (2026-04-08)
- Reviewed Effect-TS as potential infrastructure layer — decided to use internally in server, not expose to tools
- Audited YDTB codebase for production readiness gaps (10 issues found, all critical/high)
- Researched Vendure, Medusa v2, Backstage, NestJS for patterns
- Designed server infrastructure replacement for Nitro
- Designed Anvil as standalone framework extracted from YDTB patterns
- Named the framework, created repo at github.com/yourdigitaltoolbox/anvil
- Built `@ydtb/anvil` (core types) and `@ydtb/anvil-hooks` (hook system with typed wrappers, 23 tests)
