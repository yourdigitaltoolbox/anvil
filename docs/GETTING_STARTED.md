# Getting Started with Anvil

Anvil is a composable full-stack framework for building extensible applications. The framework provides the generic foundation -- **layers** (swappable infrastructure), **hooks** (runtime communication), and **extensions** (platform systems). **Toolkits** define module systems on top of it. `@ydtb/anvil-toolkit` provides the **tool/scope pattern** where independent **tools** (business features) are organized into a **scope** hierarchy.

## Quick Start

### 1. Create a project

```bash
mkdir my-app && cd my-app
bun init -y
```

Install the core framework:

```bash
bun add @ydtb/anvil @ydtb/anvil-server @ydtb/anvil-hooks
```

Install the toolkit (for tool/scope module system):

```bash
bun add @ydtb/anvil-toolkit
```

Install the layers you need:

```bash
bun add @ydtb/anvil-layer-pino @ydtb/anvil-layer-postgres
```

### 2. Create the composition root

The composition root (`compose.config.ts`) is the single source of truth for your entire application — what layers it uses, what scopes exist, and what tools are included.

```ts
// compose.config.ts
import { defineApp } from '@ydtb/anvil'
import { defineScope } from '@ydtb/anvil-toolkit'
import { pino } from '@ydtb/anvil-layer-pino'
import { postgres } from '@ydtb/anvil-layer-postgres'

export default defineApp({
  brand: {
    name: 'My App',
  },

  layers: {
    logging: pino({ level: 'info' }),
    database: postgres({ url: process.env.DATABASE_URL! }),
  },

  scopes: defineScope({
    type: 'workspace',
    label: 'Workspace',
    urlPrefix: '/w/$scopeId',
    includes: [
      // tools go here
    ],
  }),
})
```

### 3. Create the server entry point

```ts
// server/index.ts
import { createServer } from '@ydtb/anvil-server'
import config from '../compose.config'

const server = createServer({
  config,
  port: 3000,
})

await server.start()

Bun.serve({
  port: 3000,
  fetch: server.app.fetch,
})

console.log('Server running at http://localhost:3000')
```

### 4. Run it

```bash
bun run server/index.ts
```

Test it:

```bash
curl http://localhost:3000/healthz     # → { "status": "ok" }
curl http://localhost:3000/readyz      # → { "status": "ok", "checks": { ... } }
```

---

## Core Primitives

### 1. Composition (`defineApp`)

The composition root declares your application's infrastructure and extensions:

```ts
import { defineApp } from '@ydtb/anvil'

defineApp({
  brand: { name, logo?, primaryColor? },
  layers: { ... },          // Infrastructure
  extensions?: [ ... ],     // Platform systems
})
```

### 2. Tools and Scopes (via `@ydtb/anvil-toolkit`)

The toolkit adds the tool/scope module system on top of the framework. **Scopes** define your organizational hierarchy. Each scope is a data isolation and routing boundary. **Tools** are the unit of business functionality.

```ts
import { defineScope } from '@ydtb/anvil-toolkit'

// Add scopes to your app config
scopes: defineScope({
  type: 'system',
  label: 'System',
  urlPrefix: '/s',
  includes: [dashboard],
  children: [
    defineScope({
      type: 'company',
      label: 'Company',
      urlPrefix: '/c/$scopeId',
      includes: [dashboard, billing, team],
    }),
  ],
})
```

Each tool is a package with three exports -- all from `@ydtb/anvil-toolkit`:

```ts
// tools/contacts/index.ts
import { defineTool } from '@ydtb/anvil-toolkit'

export const contacts = defineTool({
  id: 'contacts',
  name: 'Contacts',
  package: '@myapp/contacts',
})
```

**Server surface** -- what the tool contributes to the server:

```ts
// tools/contacts/server.ts
import { defineServer } from '@ydtb/anvil-toolkit'
import { Hono } from 'hono'
import { getLayer } from '@ydtb/anvil-server'

const router = new Hono()

router.get('/list', async (c) => {
  const { db } = getLayer('database')
  const contacts = await db.select().from(contactsTable)
  return c.json({ contacts })
})

export default defineServer({
  router,
  hooks: {
    actions: {
      'contacts:get': async (input) => { /* ... */ },
    },
    broadcasts: {
      'contact:created': async (payload) => { /* ... */ },
    },
  },
  jobs: [
    { id: 'contacts-cleanup', schedule: '0 3 * * *', handler: cleanupHandler },
  ],
})
```

**Client surface** -- what the tool contributes to the browser:

```ts
// tools/contacts/client.ts
import { defineClient } from '@ydtb/anvil-toolkit'

export default defineClient({
  routes: [
    { path: 'contacts', component: () => import('./pages/list') },
    { path: 'contacts/:id', component: () => import('./pages/detail') },
  ],
  navigation: [
    { label: 'Contacts', path: 'contacts', icon: 'Users' },
  ],
  permissions: [
    { feature: 'contacts', label: 'Contacts', actions: [
      { key: 'contacts.view', label: 'View contacts', category: 'read' },
    ]},
  ],
})
```

### 3. Layers

Swappable infrastructure. The framework ships with no hardcoded layers — you install what you need.

```ts
// compose.config.ts
import { postgres } from '@ydtb/anvil-layer-postgres'
import { redis } from '@ydtb/anvil-layer-redis'
import { pino } from '@ydtb/anvil-layer-pino'

defineApp({
  layers: {
    database: postgres({ url: env.DATABASE_URL }),
    cache: redis({ url: env.REDIS_URL }),
    logging: pino({ level: 'info' }),
  },
})
```

Access in tool code:

```ts
import { getLayer } from '@ydtb/anvil-server'

const { db } = getLayer('database')
const cache = getLayer('cache')
const { logger } = getLayer('logging')
```

**Available layer packages:**

| Package | Key | Production | Dev/Test |
|---|---|---|---|
| `@ydtb/anvil-layer-pino` | `logging` | `pino()` | `silent()` |
| `@ydtb/anvil-layer-postgres` | `database` | `postgres()` | `testPostgres()` |
| `@ydtb/anvil-layer-redis` | `cache` | `redis()` | `memory()` |
| `@ydtb/anvil-layer-bullmq` | `jobs` | `bullmq()` | `memoryJobs()` |
| `@ydtb/anvil-layer-resend` | `email` | `resend()` | `consoleEmail()` |
| `@ydtb/anvil-layer-s3` | `storage` | `s3()` | `memoryStorage()` |
| `@ydtb/anvil-layer-sentry` | `errors` | `sentry()` | `noopErrors()` |
| `@ydtb/anvil-layer-auth` | `auth` | `betterAuth()` | `mockAuth()` |

**Creating a custom layer:**

```ts
import { Effect, Layer } from 'effect'
import { createLayerConfig, getLayerTag } from '@ydtb/anvil-server'

// 1. Define the contract
export interface RealtimeLayer {
  readonly broadcast: (channel: string, data: unknown) => Promise<void>
}

// 2. Augment LayerMap
declare module '@ydtb/anvil' {
  interface LayerMap {
    realtime: RealtimeLayer
  }
}

// 3. Create the factory
const tag = getLayerTag<RealtimeLayer>('realtime')

export function pusher(config: { appId: string }): LayerConfig<'realtime'> {
  return createLayerConfig('realtime', Layer.succeed(tag, {
    broadcast: async (channel, data) => { /* pusher API */ },
  }))
}
```

### 4. Hooks

Cross-tool communication at runtime. Three primitives:

```ts
import { getHooks } from '@ydtb/anvil-server'

const hooks = getHooks()

// Actions — request/response (exactly one handler)
hooks.addAction('contacts:get', async (id) => {
  return await db.select().from(contacts).where(eq(contacts.id, id))
})
const contact = await hooks.doAction('contacts:get', 'ct_123')

// Broadcasts — fire-and-forget (0-N listeners)
hooks.onBroadcast('contact:created', async (payload) => {
  await notifyTeam(payload)
})
await hooks.broadcast('contact:created', { id: 'ct_123', name: 'John' })

// Filters — value transformation pipeline
hooks.addFilter('contacts:list', (contacts) => {
  return contacts.filter(c => c.isActive)
})
const filtered = await hooks.applyFilter('contacts:list', allContacts)
```

### 5. Extensions

App-level systems that define contracts for modules to contribute to:

```ts
// extensions/search/index.ts
import { defineExtension } from '@ydtb/anvil'
import { Hono } from 'hono'
import { getContributions } from '@ydtb/anvil-server'

const router = new Hono()
router.get('/search', (c) => {
  const providers = getContributions<{ provider: SearchProvider }>('search')
  // Aggregate search across all tool providers
  return c.json({ results })
})

export const search = defineExtension({
  id: 'search',
  name: 'Search',
  server: { router },
})

// Augment surfaces so tools can contribute
declare module '@ydtb/anvil' {
  interface ServerContributions {
    search?: { provider: SearchProvider }
  }
}
```

Tools contribute to installed extensions (using toolkit imports):

```ts
// tools/contacts/server.ts
import { defineServer } from '@ydtb/anvil-toolkit'

export default defineServer({
  router,
  search: { provider: contactSearchProvider },  // Appears when search extension is installed
})
```

---

## Server Features

### Health Endpoints

Every Anvil server automatically has:

- `GET /healthz` — liveness probe, always returns 200
- `GET /readyz` — readiness probe, runs layer health checks

### Request Context

Every HTTP request is wrapped in AsyncLocalStorage with a unique context:

```ts
import { getRequestContext, getLogger } from '@ydtb/anvil-server'

const ctx = getRequestContext()
ctx?.requestId  // unique per request
ctx?.userId     // set by auth middleware
ctx?.scopeId    // set by scope middleware

const logger = getLogger()  // child logger with requestId, userId, scopeId bound
logger.info('Processing request')
```

### Middleware

App-level middleware is passed to `createServer` (or `createToolServer` from the toolkit):

```ts
createServer({
  middleware: [cors(), authMiddleware(), rateLimiter()],
})
```

### App-Level Routes

Routes that aren't tools (settings, API keys, auth):

```ts
const authApp = new Hono()
authApp.all('/*', authRoutes())

createServer({
  routes: { auth: authApp },
})
```

### SPA Handler

Serve your frontend with route matching and per-route data loaders:

```ts
import { createSpaHandler } from '@ydtb/anvil-server'

app.get('*', createSpaHandler({
  routes: allRegisteredRoutes,
  renderShell: async (match) => {
    // match.matched — which route hit
    // match.params — URL params
    // match.loaderData — data from the route's loader (if any)
    return `<!DOCTYPE html>
      <html><body>
        <div id="app"></div>
        ${match.loaderData ? `<script>window.__DATA__=${JSON.stringify(match.loaderData)}</script>` : ''}
        <script src="/assets/app.js"></script>
      </body></html>`
  },
}))
```

### Worker

Same layers and hooks, no HTTP:

```ts
import { createWorker } from '@ydtb/anvil-server'

const worker = createWorker({ config })
await worker.start()
```

---

## Client Features

### Route Assembly (toolkit)

```ts
import { assembleRoutes } from '@ydtb/anvil-toolkit'

const routeMap = assembleRoutes(scopeTree, toolClientSurfaces)
// routeMap.scopes — nested scope groups with routes + navigation
// routeMap.publicRoutes — no auth required
// routeMap.authenticatedRoutes — auth required, no scope
```

### API Client

```ts
import { createApiClient, configureApiClients } from '@ydtb/anvil-client'

// Configure once at boot
configureApiClients({
  baseUrl: 'http://localhost:3000',
  getScope: () => ({ id: currentScopeId, type: currentScopeType }),
})

// Per-tool client (module scope)
export const contactsApi = createApiClient('contacts')

// In components
const res = await fetch(contactsApi.url() + '/list', {
  headers: contactsApi.headers(),  // includes x-scope-id, x-scope-type
})
```

### Client Layers

```tsx
import { useLayer, LayerProvider } from '@ydtb/anvil-client'

// Provider at app root
<LayerProvider layers={{ analytics: posthog({ apiKey: '...' }) }}>
  <App />
</LayerProvider>

// In any component
const analytics = useLayer('analytics')
analytics.track('page_view')
```

### Auth Helpers

```tsx
import { AuthProvider, useAuth, AuthGate } from '@ydtb/anvil-client'

// Wrap app in AuthProvider
<AuthProvider>
  <AuthGate loginPath="/login">
    <App />
  </AuthGate>
</AuthProvider>

// In components
const { user, isAuthenticated, signOut } = useAuth()
```

### App Helper (toolkit)

```tsx
import { createAnvilApp } from '@ydtb/anvil-toolkit'

const { App } = createAnvilApp({
  scopeTree,
  tools: toolClientSurfaces,
  auth: { loginPath: '/login' },
  layers: { analytics: posthog({ apiKey: '...' }) },
})

createRoot(document.getElementById('app')!).render(<App />)
```

---

## Build System

### Virtual Module Plugin

The framework build package provides the Vite/Rollup plugin infrastructure. The toolkit adds virtual module generators for tool discovery:

```ts
// vite.config.ts
import { anvilPlugin } from '@ydtb/anvil-build'
import { toolkitModules } from '@ydtb/anvil-toolkit/build'
import config from './compose.config'

export default defineConfig({
  plugins: [anvilPlugin(config, { virtualModules: toolkitModules(config) })],
})
```

Then import auto-generated modules:

```ts
import { tools } from 'virtual:anvil/server-tools'   // all tool server surfaces
import { schema } from 'virtual:anvil/schema'         // merged schema for drizzle-kit
import { scopeTree } from 'virtual:anvil/scope-tree'  // serialized scope hierarchy
```

### Dev Server

```ts
import { createDevMiddleware } from '@ydtb/anvil-build'
// Middleware embedded in the server — see server setup
```

### Vite Config Helper

```ts
import { createViteConfig } from '@ydtb/anvil-build'
import { toolkitModules } from '@ydtb/anvil-toolkit/build'

export default createViteConfig({
  appConfig: config,
  serverPort: 3001,
  virtualModules: toolkitModules(config),
})
```

---

## Testing

Every layer has a dev/test variant. Swap in compose.config for tests:

```ts
// test/test-config.ts
import { silent } from '@ydtb/anvil-layer-pino/silent'
import { memory } from '@ydtb/anvil-layer-redis/memory'
import { memoryJobs } from '@ydtb/anvil-layer-bullmq/memory'
import { mockAuth } from '@ydtb/anvil-layer-auth/mock'

export default defineApp({
  layers: {
    logging: silent(),
    cache: memory(),
    jobs: memoryJobs(),
    auth: mockAuth({ users: [{ id: 'usr_1', email: 'test@test.com', name: 'Test' }] }),
  },
  // ...
})
```

No `vi.mock()`. No patching globals. One import swap per layer.
