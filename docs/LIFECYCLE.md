# Anvil Lifecycle Model

The complete lifecycle of an Anvil application, from boot to shutdown.

## Server Lifecycle

```
1. LAYER BOOT
   └─ Effect composes layers, resolves dependency graph
   └─ ManagedRuntime acquires resources (DB connections, Redis, etc.)
   └─ getLayer() becomes available
   └─ getLogger() switches from console to LogLayer (if installed)

2. HOOK SYSTEM CREATED
   └─ HookSystem instantiated
   └─ getHooks() becomes available

3. SURFACE PROCESSING
   └─ Extension server surfaces processed first (routers, hooks)
   └─ Tool server surfaces processed (routers, hooks, jobs, schema)
   └─ Extension contributions collected from tool surfaces
   └─ getContributions() becomes available

4. EXTENSION BOOT (onExtensionBoot)
   └─ Registered boot functions run for each extension
   └─ Receives collected contributions
   └─ Use for: materializing registries, starting listeners, derived state

5. ROUTE MOUNTING
   └─ Tool/extension routers mounted at /api/{id}/*
   └─ App-level routes mounted
   └─ Health endpoints (/healthz, /readyz) already available

6. SERVER READY
   └─ "Anvil server ready" logged
   └─ Bun.serve() binds to port (app controls this)
   └─ Requests begin flowing

7. REQUEST TIME
   └─ Request context created (requestId, logger)
   └─ Middleware pipeline runs (auth, scope, etc.)
   └─ Route handler executes
   └─ getLayer(), getHooks(), getRequestContext() all available
   └─ Domain events via hooks.broadcast()

8. SHUTDOWN (SIGTERM/SIGINT or manual)
   └─ Extension shutdown hooks run (onExtensionShutdown)
   └─ Accessors cleared (getLayer, getHooks, etc.)
   └─ Layer shutdown via ManagedRuntime.dispose()
   └─ Resources released in reverse acquisition order
```

## Client Lifecycle

```
1. APP INITIALIZATION
   └─ configureApiClients() sets up scope header injection
   └─ assembleRoutes() groups routes by layout + scope
   └─ Client contributions collected from tool surfaces

2. PROVIDER SETUP
   └─ ContextProviderStack nests providers by priority
   └─ LayerProvider wraps with client layers
   └─ ContributionProvider makes contributions accessible via useContributions()

3. ROUTE MATCHING
   └─ URL matched against app routes → layout routes → scope routes
   └─ Matched layout's guard pipeline runs

4. GUARD PIPELINE
   └─ Each guard runs sequentially
   └─ Context cascades (auth sets userId → scope reads it)
   └─ On pass: render layout + route component
   └─ On redirect: navigate to redirect path
   └─ On render: show fallback component

5. SCOPE CONTEXT
   └─ ScopeProvider sets scopeId + scopeType from URL
   └─ getCurrentScope() updated for API header injection
   └─ useScope() available in components

6. COMPONENT RENDERING
   └─ Route component renders inside guarded layout
   └─ useAuth(), useScope(), useLayer(), useContributions() all available
   └─ API calls include scope headers automatically
```

## Extension Lifecycle

Extensions have their own lifecycle within the server boot:

```
1. DEFINITION
   └─ defineExtension({ id, name, server, client })
   └─ Registered in defineApp({ extensions: [...] })

2. SURFACE PROCESSING
   └─ Extension's own server surface processed (router, hooks)
   └─ Extension's router mounted before tool routers

3. CONTRIBUTION COLLECTION
   └─ Tool surfaces scanned for non-core fields matching extension IDs
   └─ Contributions stored and available via getContributions(extensionId)

4. BOOT (onExtensionBoot)
   └─ Extension's boot function runs with collected contributions
   └─ Registry materialization, listener startup, derived state

5. RUNTIME
   └─ Extension's routes handle requests
   └─ Extension accesses contributions via getContributions()
   └─ Domain events flow through hooks

6. SHUTDOWN (onExtensionShutdown)
   └─ Extension's shutdown function runs
   └─ Cleanup listeners, flush buffers, release resources
   └─ Runs BEFORE layers are torn down (DB still available)
```

## Domain Events vs Framework Lifecycle

**Framework lifecycle** (boot, shutdown, surface processing) is structural — it happens once when the server starts/stops. The framework manages this.

**Domain events** (`scope:created`, `contact:updated`, `user:signed-up`) are runtime events that happen during normal operation. These use the **hook system** (broadcasts), not framework lifecycle.

| Concern | Mechanism | When |
|---|---|---|
| Extension initialized | `onExtensionBoot()` | Server boot (once) |
| Extension cleaned up | `onExtensionShutdown()` | Server shutdown (once) |
| Tool registered hooks | `defineServer({ hooks })` | Surface processing (once) |
| Scope created | `hooks.broadcast('scope:created', ...)` | Runtime (many times) |
| Contact updated | `hooks.broadcast('contact:updated', ...)` | Runtime (many times) |
| User signed up | `hooks.broadcast('user:signed-up', ...)` | Runtime (many times) |

**Rule of thumb:**
- If it happens **once at startup** → framework lifecycle (`onExtensionBoot`)
- If it happens **once at shutdown** → framework lifecycle (`onExtensionShutdown`)
- If it happens **during normal operation** → hook system (broadcasts)
- If it needs to be **awaited** → hook actions
- If it needs to **transform data** → hook filters

## Scope Lifecycle Events

Scope events (create, delete, member join/leave) are **domain broadcasts**, not framework lifecycle. They're defined and dispatched by the scope extension:

```ts
// In the scope extension's routes:
await getHooks().broadcast('scope:created', {
  scopeId: entity.id,
  scopeType: entity.scope,
  createdBy: userId,
})
```

The `server.postCreate` field on `ScopeDefinition` is a convenience — the scope extension calls it after broadcasting `scope:created`. It's syntactic sugar, not a separate lifecycle mechanism.

Other extensions/tools listen for these broadcasts:
```ts
// Activity extension listens for scope events
getHooks().onBroadcast('scope:created', async (payload) => {
  await logActivity('scope', payload.scopeId, 'created', payload)
})
```

## Summary

| Phase | Server | Client |
|---|---|---|
| Boot | Layers → Hooks → Surfaces → Contributions → Extension Boot → Routes → Ready | Providers → Routes → Guards → Render |
| Runtime | Request Context → Middleware → Handler → Hooks | Components → useAuth/useScope/useLayer → API calls |
| Shutdown | Extension Shutdown → Clear Accessors → Layer Disposal | N/A (browser closes) |
