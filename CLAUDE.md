# Anvil Framework

Anvil is a composable full-stack plugin framework. Tools, scopes, and layers are first-class primitives. Effect powers the server runtime internally; tool authors write plain TypeScript.

**Package namespace:** `@ydtb/anvil-*` (published under the `@ydtb` npm org)

## Reference Implementation

The YDTB project at `/Users/john/projects/ydtb` is the reference implementation and first consumer of Anvil. Many patterns in this framework are extracted from YDTB's battle-tested codebase.

When building Anvil packages, reference these YDTB files for proven patterns:

| Anvil Package | YDTB Reference |
|---|---|
| `@ydtb/anvil` (core types) | `packages/compose/src/` — defineApp, defineTool, scope, surfaces |
| `@ydtb/anvil-hooks` | `packages/plugin-sdk/src/hook-system.ts` — already extracted and cleaned up |
| `@ydtb/anvil-server` | `packages/app/src/server/` — infra-boot, routes, middleware, plugins |
| `@ydtb/anvil-build` | `packages/compose/src/build-utils/virtual-tools-plugin.ts` — virtual module generation |
| `@ydtb/anvil-client` | `packages/compose/src/registry.ts` + `packages/compose/src/client.ts` — surface registration, API client factory |
| Layer: postgres | `packages/db/src/db.ts` — connection pool, drizzle setup |
| Layer: bullmq | `packages/app/src/server/jobs/providers/bullmq.ts` — queue/worker creation |
| Layer: pino | Not yet in YDTB (60+ console.log calls to replace) |

## Key Design Documents

- `docs/DESIGN.md` — Full framework architecture (read this first)
- `/Users/john/projects/ydtb/docs/server-infrastructure-design.md` — YDTB-specific Nitro replacement plan
- `/Users/john/projects/ydtb/docs/anvil-framework-design.md` — Original design doc (in YDTB repo, being superseded by docs/DESIGN.md here)

## Architecture — Four Primitives

### 1. Composition (`@ydtb/anvil`)
- `defineApp(config)` — the composition root (brand, layers, scopes)
- `defineTool(descriptor)` — tool identity (id, name, package)
- `scope(definition)` — scope hierarchy node (type, label, urlPrefix, includes, children)
- `defineClient(definition)` — what a tool contributes to the browser (routes, nav, permissions)
- `defineServer(definition)` — what a tool contributes to the server (schema, router, hooks, jobs)

### 2. Hooks (`@ydtb/anvil-hooks`) — DONE
- `HookSystem` — the engine (actions, broadcasts, filters)
- `createTypedHooks()` — compile-time safe wrappers (`@ydtb/anvil-hooks/typed`)
- `setHookErrorHandler()` — pluggable error handler for logging integration

### 3. Layers (not yet built)
- Contracts defined in `packages/anvil/src/layers.ts` (DatabaseLayer, CacheLayer, etc.)
- Each layer: factory function returns `LayerConfig` with Effect Layer inside
- Effect manages lifecycle internally (acquire/release, health, shutdown)
- Tool authors call `getLayer('database')` — never touch Effect

### 4. Server (`@ydtb/anvil-server`, not yet built)
- `createServer(config)` — HTTP server + lifecycle + health + shutdown
- `createWorker(config)` — job processing, no HTTP
- Request context via AsyncLocalStorage
- Structured logging via pino
- Scope-aware SPA handler (branded shell HTML, streaming SSR-ready)

## Build Order (what's next)

1. ~~Core types (`@ydtb/anvil`)~~ — done
2. ~~Hooks (`@ydtb/anvil-hooks`)~~ — done, 23 tests passing
3. **Server (`@ydtb/anvil-server`)** — lifecycle manager, createServer, getLayer, request context, logging ← NEXT
4. **Build (`@ydtb/anvil-build`)** — virtual module plugin, workspace alias resolver, dev server
5. **Client (`@ydtb/anvil-client`)** — surface registration, useLayer, routing
6. **Layers** — postgres, pino, sentry first (most immediately needed)

## Conventions

- Use `bun` as the package manager (not npm/pnpm)
- Use `bunx` instead of `npx`
- Avoid chaining bash commands — keep them as single commands
- Never use command substitution in bash (backticks or `$()`)
- This is a Turborepo monorepo with bun workspaces
- Packages are at `packages/*` and `packages/layers/*`
- Tests use vitest
- TypeScript strict mode

## What Anvil Is NOT

- Not a CMS — no content types, no admin UI generator
- Not e-commerce-specific — domain-agnostic
- Not opinionated about UI components — uses React + TanStack, but doesn't generate pages
- Not a PaaS — runs on your infrastructure
- Not coupled to YDTB — YDTB is just the first consumer
