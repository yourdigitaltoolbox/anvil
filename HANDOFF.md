# Handoff

## Project

Anvil — composable full-stack plugin framework.
Repo: https://github.com/yourdigitaltoolbox/anvil
Branch: `main`

## Reference Implementation

YDTB at `/Users/john/projects/ydtb` is the first consumer. Read the YDTB codebase for proven patterns — Anvil extracts and formalizes what YDTB built organically. Key YDTB docs:
- `docs/server-infrastructure-design.md` — Nitro replacement plan (YDTB-specific migration)
- `docs/anvil-framework-design.md` — original framework design (being superseded by `docs/DESIGN.md` here)
- `CLAUDE.md` — full codebase guide with conventions and architecture

## Current State

Two packages are committed:

### `@ydtb/anvil` (core types) — done
- `defineApp`, `defineTool`, `scope` — composition root primitives
- `defineClient`, `defineServer` — tool surface definitions
- `LayerConfig`, `RequiredLayers`, `LayerMap` — layer contracts (DatabaseLayer, CacheLayer, JobLayer, LogLayer, ErrorLayer, EmailLayer, StorageLayer)
- No implementation logic yet — just types and identity functions

### `@ydtb/anvil-hooks` — done
- `HookSystem` class — full hook engine extracted from YDTB `packages/plugin-sdk/src/hook-system.ts`
- Three primitives: actions (1:1 request/response), broadcasts (1:N fire-and-forget), filters (N-stage waterfall)
- `createTypedHooks()` in `@ydtb/anvil-hooks/typed` — compile-time safe wrappers (NEW — YDTB doesn't have this yet)
- `setHookErrorHandler()` — pluggable error handler (replaces hardcoded console.error)
- 23 tests, all passing
- Zero dependencies, framework-agnostic

## What's Next

**`@ydtb/anvil-server`** — the server runtime. This is the biggest package. It replaces Nitro in YDTB and provides:

1. **Lifecycle manager** — resource registry with health checks and shutdown derived automatically
2. **`createServer(config)`** — boots HTTP server (Hono), mounts RPC handlers, registers tool surfaces
3. **`createWorker(config)`** — same tool surfaces, job processing only, no HTTP
4. **`getLayer(key)`** — access layers provided by the composition root
5. **Request context** — `AsyncLocalStorage<RequestContext>` wrapping every request with requestId, userId, scopeId, child logger
6. **Structured logging** — pino, JSON in production, pretty in dev
7. **Scope-aware SPA handler** — parses scope from URL, returns branded HTML shell (streaming SSR-ready for future tiers)
8. **Error reporting** — Sentry integration

Reference YDTB files for patterns:
- `packages/app/src/server/infra-boot.ts` — infrastructure boot sequence
- `packages/app/src/server/routes/rpc-handler.ts` — oRPC handler mounting
- `packages/app/src/server/routes/spa-fallback-route.ts` — current SPA fallback (to be replaced with scope-aware version)
- `packages/app/src/server/plugins/jobs.ts` — current Nitro plugin (to be replaced with lifecycle hook)
- `packages/app/src/server/lib/rate-limiter.ts` — current in-memory rate limiter (to be made pluggable)
- `packages/compose/src/server-boot.ts` — tool surface processing
- `packages/compose/src/composition-router.ts` — auto-assembled oRPC router

After server, the build order is:
- `@ydtb/anvil-build` — virtual module plugin + workspace resolver (kills 158-alias file in YDTB)
- `@ydtb/anvil-client` — client surface registration + useLayer + API client factory
- Layer packages — postgres, pino, sentry first

## Key Design Decisions

- **Effect is internal to `@ydtb/anvil-server`** — tools never touch Effect unless they opt in. The framework API is plain TypeScript (async/await). Effect manages layer composition, resource lifecycle (acquireRelease), and shutdown guarantees.
- **Layers are compile-time verified** — `defineApp` requires all layer keys. Miss one → TypeScript error.
- **Hook system stays plain** — late-bound, dynamic, string-keyed. Typed wrappers are compile-time only. Effect doesn't replace hooks.
- **`defineClient` / `defineServer`** replace `ClientSurface` / `ServerSurface` naming.
- **Scope-aware rendering** — 3 tiers: branded shell (implement now), streaming SSR (backlog), per-route loaders (backlog). Tier 1 handler must be built to not block Tiers 2 and 3.
- **Worker separation** — `createWorker()` is a separate entry point from `createServer()`. Same config, same tools, different runtime profile.

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

Checks are **on-demand only** — triggered by `GET /readyz`. No polling interval. The lifecycle manager runs all registered health checks in parallel with a per-check timeout (500ms default). The aggregate result is `ok` if all pass, `degraded` if any fail.

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

Auth and scope population is **pluggable via middleware**, not hardcoded. Anvil provides a `requestContext` AsyncLocalStorage instance and a `getRequestContext()` accessor. The consuming app's auth middleware (better-auth in YDTB's case) populates `userId`. The scope middleware (oRPC scope middleware in YDTB) populates `scopeId`. Anvil doesn't know about better-auth or oRPC — it just provides the storage mechanism.

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
5. Structured logging (pino)

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
- **h3 standalone (without Nitro)** — viable alternative to Hono. h3 is what YDTB currently uses under Nitro. Switching from h3-under-Nitro to h3-standalone would minimize handler migration. Decision: **either is fine** — h3 if we want to minimize YDTB migration churn, Hono if we want the cleanest foundation. Not a blocker — decide during implementation.
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

- **h3 vs Hono** — not decided yet (see above). Both work. Pick during implementation based on how much YDTB handler migration pain we want.
- **How the virtual module plugin moves** — it's currently a Vite/Rollup plugin in YDTB. It needs to work in the new `@ydtb/anvil-build` package. The plugin code itself is standard Rollup (resolveId + load hooks), so it should move cleanly — but the dev server story (Vite for client + separate server process) needs design work.
- **Client-side layer delivery** — `useLayer('analytics')` in React components needs a provider. We discussed React context, but haven't designed the provider hierarchy or how it interacts with SSR.
- **How tool `requires` field gets verified at compile time (Level 2)** — the virtual module plugin collects all tools' `requires` arrays. The union of all requirements must be a subset of the keys in `config.layers`. This needs type-level magic in the virtual module output. Not designed yet.

**Q: Known gotchas in YDTB that affect extraction?**

1. **YDTB's `serverHooks` is a module-level singleton** (`packages/plugin-sdk/src/hooks-instance.ts`). Anvil's `HookSystem` is a class you instantiate — but something needs to create the instance and make it available. In YDTB, tools import `serverHooks` directly. In Anvil, the server creates the instance during boot and tools access it via... what? `getHooks()`? Passed in context? This needs design.

2. **YDTB's `db` is a module-level singleton** (`packages/db/src/db.ts`). Tools do `import { db } from '@ydtb/db'`. With Anvil layers, tools call `getLayer('database').db`. This means every tool file that imports `db` needs to change when YDTB migrates to Anvil. That's ~100+ import sites. Plan for this.

3. **YDTB's oRPC middleware chain** (`packages/orpc/src/middleware.ts`) imports `auth` directly from `@ydtb/auth`. This is a hardcoded dependency, not a layer. In Anvil, auth would need to be either a layer or a configurable middleware. Not resolved yet.

4. **The `BroadcastOptions` type** has activity/notification side-channels baked into the hook system. These are YDTB-specific patterns (activity logging, notification creation). In Anvil's hooks package, we kept them for now but they should probably be moved to an extension point — the core hook system shouldn't know about "activity" or "notifications."

5. **YDTB's virtual module plugin reads `app.config.ts`** which uses YDTB-specific types (`AppConfig`). Anvil's version needs to read `compose.config.ts` which uses Anvil's `AppConfig` (from `defineApp`). The plugin logic is the same but the config shape differs. The plugin needs to be generic over the config type.

## Session Notes

### Session 1 (2026-04-08)
- Reviewed Effect-TS as potential infrastructure layer — decided to use internally in server, not expose to tools
- Audited YDTB codebase for production readiness gaps (10 issues found, all critical/high)
- Researched Vendure, Medusa v2, Backstage, NestJS for patterns
- Designed server infrastructure replacement for Nitro
- Designed Anvil as standalone framework extracted from YDTB patterns
- Named the framework, created repo at github.com/yourdigitaltoolbox/anvil
- Built `@ydtb/anvil` (core types) and `@ydtb/anvil-hooks` (hook system with typed wrappers, 23 tests)
