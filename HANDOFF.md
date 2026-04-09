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

## Session Notes

### Session 1 (2026-04-08)
- Reviewed Effect-TS as potential infrastructure layer — decided to use internally in server, not expose to tools
- Audited YDTB codebase for production readiness gaps (10 issues found, all critical/high)
- Researched Vendure, Medusa v2, Backstage, NestJS for patterns
- Designed server infrastructure replacement for Nitro
- Designed Anvil as standalone framework extracted from YDTB patterns
- Named the framework, created repo at github.com/yourdigitaltoolbox/anvil
- Built `@ydtb/anvil` (core types) and `@ydtb/anvil-hooks` (hook system with typed wrappers, 23 tests)
