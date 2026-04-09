/**
 * Server entry point — boots Anvil and starts listening.
 *
 * Run with: bun run examples/minimal/server.ts
 *
 * Then try:
 *   curl http://localhost:3000/healthz
 *   curl http://localhost:3000/readyz
 *   curl http://localhost:3000/api/greeter/hello?name=Anvil
 *   curl http://localhost:3000/api/greeter/stats
 *   curl http://localhost:3000/api/widgets
 */

import { createServer, toolEntry } from '../../packages/server/src/index.ts'
import config from './compose.config.ts'
import { greeterServer } from './tool-greeter.ts'

const server = createServer({
  config,
  tools: [
    toolEntry('greeter', greeterServer),
  ],
  port: 3000,
})

// Boot the server (layers, hooks, surfaces, routes)
await server.start()

// Listen for HTTP requests (runtime-specific — Bun here)
const httpServer = Bun.serve({
  port: 3000,
  fetch: server.app.fetch,
})

console.log(`
  Anvil minimal example running at http://localhost:${httpServer.port}

  Try:
    curl http://localhost:${httpServer.port}/healthz
    curl http://localhost:${httpServer.port}/readyz
    curl http://localhost:${httpServer.port}/api/greeter/hello?name=Anvil
    curl http://localhost:${httpServer.port}/api/greeter/hello?name=World
    curl http://localhost:${httpServer.port}/api/greeter/stats
    curl http://localhost:${httpServer.port}/api/widgets
`)
