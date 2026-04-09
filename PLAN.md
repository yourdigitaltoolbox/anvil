# Anvil Framework — Work Plan

Tracks what needs to happen in the framework to support the ydtb-anvil migration.

## Status Legend
- ⬜ Not started
- 🔨 In progress
- ✅ Done
- 🚫 Blocked (with reason)

---

## Priority A: Prove Real Better-Auth (BLOCKER for Phase 1)

The `betterAuth()` factory has only been tested with `mockAuth()`. Before ydtb-anvil can depend on it, we need to prove it works against a real database.

### A1: ✅ Real better-auth integration test
- Boot `betterAuth()` against the local Supabase postgres (127.0.0.1:54322)
- Verify better-auth creates its tables (user, session, account, verification)
- Test: sign up a user via the auth handler
- Test: sign in and get a session
- Test: validate session via `getSession(request)`
- Test: invalid session returns null
- **File:** `packages/layers/auth/src/__tests__/real-auth.test.ts`
- **Depends on:** Running Supabase postgres

### A2: ✅ Verify Drizzle adapter mode works
- Test `betterAuth()` with `drizzleAdapter(db, { provider: 'pg', schema })` instead of URL string
- Verify it shares the database layer's connection pool
- Verify both `getLayer('database')` and `getLayer('auth')` work in the same server
- **File:** `packages/layers/auth/src/__tests__/real-auth.test.ts`

### A3: ✅ Verify plugin forwarding works
- Create a minimal test plugin (adds one endpoint)
- Pass it via `betterAuth({ plugins: [wrapPlugin('test', testPlugin)] })`
- Verify the plugin's endpoint is accessible through the auth handler
- **File:** `packages/layers/auth/src/__tests__/real-auth.test.ts`

---

## Priority B: Dev Server (HIGH VALUE for migration velocity)

Without a dev server, every change in ydtb-anvil requires manually restarting the server. This slows development significantly during migration.

### B1: ✅ Design dev server architecture
- Vite dev server for the client (HMR, React Fast Refresh)
- Server process with file watching (restart on change)
- Proxy from Vite to the server for `/api/*` routes
- Single `bun run dev` command starts both
- **File:** `packages/build/src/dev-server.ts`

### B2: ✅ Implement server file watcher
- Watch `server/`, `extensions/`, `tools/*/src/server.ts` for changes
- Restart the server process on change
- Preserve the Hono app port between restarts
- **Depends on:** B1 design

### B3: ✅ Implement Vite client dev server
- Vite config with React plugin + Anvil virtual module plugin
- Proxy `/api/*` and `/healthz` and `/readyz` to the server process
- HMR for client code
- **Depends on:** B1 design

### B4: ✅ `createDevServer()` API
- Single function that takes config and starts both processes
- Export from `@ydtb/anvil-build`
- Used by consuming apps: `bun run dev.ts` calls `createDevServer({ ... })`
- **Depends on:** B2, B3

---

## Priority C: Client App Helper (REDUCES BOILERPLATE for Phase 1)

Setting up TanStack Router with scope-aware routing, auth gate, and provider hierarchy from scratch is significant boilerplate. A helper that handles the 80% case saves time.

### C1: ✅ Design `createAnvilApp()` API
- Takes: compose config, tool client surfaces, options (auth, providers)
- Returns: mountable React app with TanStack Router wired up
- Scope-aware route assembly is automatic
- Auth gate redirects to login if not authenticated
- Provider hierarchy: QueryClient, LayerProvider, ScopeProvider, app-specific providers
- Customizable: app can add providers, override layout, add non-tool routes

### C2: ✅ Implement `createAnvilApp()`
- Assembles routes from scope tree + tool surfaces
- Creates TanStack Router with scope route layouts
- Wraps in provider hierarchy
- Auth gate component (checks session, redirects to login)
- **File:** `packages/client/src/create-app.tsx`
- **Depends on:** C1 design
- **Peer deps:** `@tanstack/react-router`, `@tanstack/react-query`

### C3: ✅ Auth client helpers
- `useAuth()` hook — current user, session, sign-out
- `AuthGate` component — renders children only if authenticated
- `LoginPage` component — basic login form (customizable)
- These need to talk to the auth layer's `/api/auth/*` routes
- **File:** `packages/client/src/auth.tsx`
- **Depends on:** C1 design

---

## Priority D: Framework Polish (NICE TO HAVE — not blocking migration)

### D1: ✅ `turbo run test` from root
- Wire up turborepo test script
- All packages run tests via single command
- CI-ready

### D2: ⬜ Middleware priority system
- Named middleware with priority ordering
- `createServer({ middleware: [{ id: 'auth', handler: authMiddleware(), priority: 10 }, { id: 'scope', handler: scopeMiddleware(), priority: 20 }] })`
- Ensures scope runs after auth without depending on array order
- Not blocking — array order works, just fragile

### D3: ⬜ `getLayer` v0.2 — AsyncLocalStorage resolution
- Check AsyncLocalStorage first, fall back to module-level
- Enables test isolation (two servers in one process)
- API doesn't change — internal resolution only
- Not blocking — `provideLayerResolver` test helper works

### D4: ⬜ Cache helpers
- SPA shell caching (check cache before calling renderShell)
- Loader data caching (cache by route + params)
- API response caching middleware
- All use `getLayer('cache')` — no-op if cache layer not installed

### D5: ⬜ npm publishing setup
- Package publishing workflow
- Version management
- Changesets or similar

### D6: ✅ Getting started guide
- How to create a new Anvil app from scratch
- compose.config.ts walkthrough
- Creating a tool
- Creating a layer
- Creating an extension

### D7: ✅ API reference documentation
- Auto-generated from JSDoc/TSDoc
- Published alongside getting started guide

---

## Completed Work

### Core Framework ✅
- `@ydtb/anvil` — core types, 5 primitives, extensibility via declaration merging
- `@ydtb/anvil-hooks` — HookSystem, actions/broadcasts/filters, typed wrappers, side-channels (27 tests)
- `@ydtb/anvil-server` — createServer, createWorker, createSpaHandler, getLayer, getHooks, getContributions, getRequestContext, getLogger, error handling, route mounting (21 tests)
- `@ydtb/anvil-build` — anvilPlugin, virtual modules, collectTools (16 tests)
- `@ydtb/anvil-client` — assembleRoutes, createApiClient, useLayer, useScope (15 tests)

### Layer Packages ✅
- `@ydtb/anvil-layer-pino` — logging (7 tests)
- `@ydtb/anvil-layer-postgres` — database with Drizzle + postgres.js (4 tests)
- `@ydtb/anvil-layer-sentry` — error reporting (3 tests)
- `@ydtb/anvil-layer-redis` — caching with ioredis + memory variant (8 tests)
- `@ydtb/anvil-layer-bullmq` — job queue + memory variant (10 tests)
- `@ydtb/anvil-layer-resend` — email + console variant (8 tests)
- `@ydtb/anvil-layer-s3` — storage + memory variant (13 tests)
- `@ydtb/anvil-layer-auth` — better-auth + mock variant + middleware (12 tests)

### Infrastructure ✅
- Shared layer tag registry (`getLayerTag`) — inter-layer dependencies
- Effect `Layer.provideMerge` — automatic dependency graph resolution
- Example app running all 5 primitives
- ydtb-anvil project scaffolded with bun link

### Total: 13 packages, 141 tests, ~12,000 lines
