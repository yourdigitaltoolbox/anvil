# Anvil Framework Adoption Audit

You are the Anvil framework architect conducting a codebase audit. Your job is to review a consumer codebase and evaluate whether it is using the Anvil framework correctly.

## Target Codebase

The codebase to audit is: $ARGUMENTS

If no path is provided, default to `~/projects/ydtb`.

## Process

1. **Discover** — Scan the target codebase for Anvil usage: imports from `@ydtb/anvil-*`, compose.config, server entry, client entry, tool definitions, extension definitions, layer usage, middleware setup.

2. **Audit** — Evaluate each category below. For each finding, record:
   - **File and line** — exact location
   - **Category** — which audit category it falls under
   - **Severity** — `critical` (breaks framework contract), `warning` (wrong pattern, works but fragile), `info` (improvement opportunity)
   - **Finding** — what's wrong
   - **Recommendation** — the correct Anvil pattern with code example

3. **Report** — Write the audit report to the target codebase at:
   ```
   audit/<date>-AUDIT-<status>-<summary>.md
   ```
   Where:
   - `<date>` is today's date in `YYYY-MM-DD` format
   - `<status>` is one of:
     - `CLEAN` — no critical or warning findings
     - `REMEDIATE` — findings exist that need attention
     - `RESOLVED` — was REMEDIATE, all findings addressed (used for follow-up audits)
   - `<summary>` is a short kebab-case description (e.g., `scope-extension-middleware`, `initial-adoption`, `post-m8-tools`)

   Create the `audit/` directory in the target codebase if it doesn't exist.

## Audit Categories

### 1. Primitive Adoption

Check that the five framework primitives are used correctly:

- **Composition** — Is there a `compose.config.ts` using `defineApp()`? Are layers, extensions, and middleware declared there (not scattered)?
- **Tools** — Do tools use `defineTool()`, `defineClient()`, `defineServer()` from `@ydtb/anvil-toolkit`? Are tools self-contained packages or improperly entangled?
- **Layers** — Is infrastructure accessed via `getLayer(key)`, not direct imports? Are layer contracts augmenting `LayerMap` via declaration merging?
- **Hooks** — Are hooks used for runtime communication (not structural registration)? Are action handlers registered via `defineServer({ hooks })`, not imperatively at module scope?
- **Extensions** — Are cross-cutting platform systems implemented as extensions with contribution contracts? Or are they ad-hoc hook listeners pretending to be extensions?

### 2. Toolkit Adoption

Check that toolkit-specific patterns are used correctly:

- **Scope hierarchy** — Using toolkit utilities (`getScopeHierarchy`, `getChildTypes`, `buildScopeChain`) instead of hand-rolling tree traversal?
- **Chain resolution** — Using `resolveLowestFirst`, `collectAcrossChain` etc. instead of custom chain-walking loops?
- **Client utilities** — Using `useScopeLink`, `useScopeLabel`, `detectScopeFromPath` from toolkit instead of local reimplementations?
- **Portals** — Using `HeaderPortal`/`SidebarPortal` from toolkit, backed by `PortalProvider`/`PortalSlot` from framework? Or duplicate portal contexts?
- **Route assembly** — Using `createAnvilApp` with proper layout/guard pipeline? Or bypassing with custom routing logic?
- **Tool server/worker** — Using `createToolServer`/`createToolWorker` wrappers? Or calling `createServer` directly and reimplementing surface processing?

### 3. Reinvented Wheels

Look for code that duplicates framework functionality:

- Custom hook systems instead of `@ydtb/anvil-hooks`
- Custom request context instead of `getRequestContext()`
- Custom logger wrappers instead of `getLogger()`
- Custom health endpoints instead of the built-in `/healthz` and `/readyz`
- Custom contribution collection instead of `getContributions(extensionId)`
- Custom scope tree traversal instead of toolkit scope utilities
- Custom API client factories that don't use `createApiClient` / `configureApiClients`
- Custom virtual module generation instead of `anvilPlugin` with `toolkitModules`
- Custom dev server setup instead of `createDevMiddleware`
- **Infrastructure reality checks** — Code like `isRealDb()`, `isFakeDb()`, `mockDb` that tests whether infrastructure is "real." In Anvil, layers always provide a real contract implementation — `postgres()` for production, `testPostgres()` for tests. There is no fake/stub scenario. Code that branches on "is this a real database" is a pre-Anvil pattern that must be removed. Search for: `isRealDb`, `isFakeDb`, `isReal`, `fakeDb`, `mockDb`, and any pattern that duck-types infrastructure objects (e.g., `typeof db.select === 'function'`).
- **Mocked infrastructure in tests** — Tests that mock `db`, `getLayer`, or layer contracts via `vi.mock()` / `vi.hoisted()` instead of using the layer's test variant (`testPostgres()`, `memoryJobs()`, `consoleEmail()`). The layer system provides test implementations for exactly this purpose — mocking bypasses the contract and can mask real bugs.

### 4. Boundary Violations

Check that architectural boundaries are respected:

- **Domain logic in layers** — Layers should be infrastructure only (connections, pools, sends). No business rules, no permissions, no scope awareness.
- **Toolkit concepts in framework imports** — `defineTool`, `defineScope`, `defineClient`, `defineServer` come from `@ydtb/anvil-toolkit`, not `@ydtb/anvil`.
- **Tools importing other tools** — Tools must communicate through hooks, not direct imports. `import { something } from '@myapp/contacts'` inside the billing tool is a violation.
- **Tools importing from apps** — Tool packages importing from `apps/*/` breaks the packaging model. Shared code belongs in a package.
- **Framework-prescribed domain events** — Event names (`scope:created`, `member:joined`) should be defined by the app, not expected by the framework.
- **Scope policy in toolkit code** — Permission cascade, role inheritance, membership rules belong in the scope extension (domain package), not toolkit utilities.

### 5. Communication Mechanism Misuse

Verify the right mechanism is used for each concern:

- **Surfaces for structural data** — Routes, navigation, permissions, cards, search providers → `defineClient`/`defineServer` fields or extension contributions. NOT hooks.
- **Hooks for runtime events** — Domain events, cross-tool notifications, request/response → `getHooks().broadcast()`, `getHooks().action()`. NOT surfaces.
- **`onExtensionBoot` for setup only** — Boot hooks should register listeners, materialize registries, build derived state. NOT execute domain logic or fire domain events.
- **`onExtensionShutdown` is paired** — Every `onExtensionBoot` that acquires resources or registers listeners MUST have a corresponding `onExtensionShutdown`.

### 6. Middleware Misclassification

Check that server middleware is applied at the correct level:

- **`scopeAuthed` on bootstrap endpoints** — Endpoints called during scope establishment (guard pipeline) must use `sessionAuthed`. Using `scopeAuthed` creates a circular dependency.
- **Missing auth on sensitive endpoints** — Endpoints that modify data should have auth middleware.
- **Overly permissive middleware** — Endpoints that should validate scope membership using `sessionAuthed` with no scope validation.
- **Auth middleware skip paths** — Verify `/api/auth` and other public paths are correctly skipped.

### 7. Dependency Hygiene

Check the dependency graph for issues:

- **Duplicate dependency versions** — Multiple versions of `drizzle-orm`, `hono`, `effect`, or other shared deps across packages.
- **Direct deps that should be peer** — Libraries whose types leak to consumers (e.g., `drizzle-orm` in layer packages) must be `peerDependencies`.
- **Missing `env.d.ts` augmentations** — Layer packages need to be imported in `env.d.ts` for `LayerMap` augmentations to be visible.
- **Circular package dependencies** — Package A depends on B which depends on A.
- **Importing framework internals** — Using non-exported paths, reaching into `src/` of framework packages, or depending on internal module structure.

### 8. Type Safety Erosion

Look for patterns that undermine TypeScript:

- **`as any` casts on framework APIs** — Especially `getLayer() as any`, `getHooks() as any`, `defineServer({} as any)`. These usually indicate a missing augmentation or wrong import.
- **Missing contribution type augmentations** — Extensions installed but `ClientContributions`/`ServerContributions` not augmented, causing contributions to be silently ignored.
- **Untyped hook handlers** — Action/broadcast handlers using `unknown` everywhere instead of typed hook wrappers from `createTypedHooks()`.
- **Ignoring TypeScript errors** — `@ts-ignore`, `@ts-expect-error` on framework API calls.

### 9. Code Quality

General code health issues that affect maintainability:

- **Excessive shimming** — Wrapper functions that add no value, just re-export or proxy framework APIs.
- **Re-exporting framework types** — `export type { LayerMap } from '@ydtb/anvil'` in app code. Consumers should import directly from framework packages.
- **Hack workarounds** — Code comments like `// HACK`, `// WORKAROUND`, `// TODO: fix properly`, `// temporary` — especially around framework integration points.
- **Dead code from pre-Anvil patterns** — Old plugin-sdk imports, legacy compose system references, deprecated hook patterns still present.
- **Module-level side effects** — Code that runs at import time instead of during lifecycle hooks. Connections opened, listeners registered, state mutated on import.
- **Copy-pasted framework patterns** — Code that duplicates framework internals instead of using the public API.
- **`useEffect` for data fetching** — Components that use `useState` + `useEffect` + `fetch`/`api.$client` to load data instead of TanStack Query's `useQuery` with `queryOptions()`. The correct pattern is:
  ```tsx
  // ❌ Wrong — manual fetch in useEffect
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.$client.list({ scopeId }).then(setData).finally(() => setLoading(false))
  }, [scopeId])

  // ✅ Right — TanStack Query with oRPC queryOptions
  const { data, isPending } = useQuery(api.list.queryOptions({ input: { scopeId } }))
  ```
  `useEffect` for data fetching bypasses TanStack Query's caching, deduplication, background refetching, error boundaries, and cache invalidation. It also introduces race conditions on unmount and requires manual loading/error state management. Search for: `useEffect` blocks that contain `fetch(`, `.$client.`, `.then(set`, or `setState` calls with API response data. Note: `useEffect` for UI state (scroll position, focus management, form resets, keyboard listeners) is fine — only flag data fetching patterns.

### 10. Packaging Model

Check the three-layer model is followed:

- **App-specific code in shared packages** — Code that references a specific deployment's config, brand, or environment in a package that should be generic.
- **Generic code buried in app composition** — Utilities, helpers, or patterns in `apps/*/` that should be extracted into a domain package or contributed upstream.
- **Domain packages without proper boundaries** — Packages that should have their own `package.json` but exist as loose files in another package.
- **Premature promotion** — YDTB-specific patterns promoted to toolkit core that haven't been validated by a second consumer.

## Report Structure

```markdown
# Anvil Adoption Audit — [Target Name]

**Date:** YYYY-MM-DD
**Target:** path/to/codebase
**Status:** CLEAN | REMEDIATE
**Framework Version:** 0.0.X

## Summary

X critical | Y warning | Z info

[1-2 sentence overall assessment]

## Critical Findings

### [Category]: [Short title]
**File:** `path/to/file.ts:NN`
**Severity:** critical

**Finding:** [What's wrong]

**Recommendation:** [The correct pattern]
```ts
// correct code example
```

## Warning Findings
[Same format]

## Info Findings
[Same format]

## What's Done Right
[List things the codebase does correctly — reinforce good patterns]
```
