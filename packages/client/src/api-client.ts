/**
 * API client factory — creates typed, scope-aware oRPC clients per tool.
 *
 * Each tool calls createApiClient() at module scope to get a typed client.
 * The client automatically injects scope headers (x-scope-id, x-scope-type)
 * on every request based on the current React scope context.
 *
 * Configuration is lazy — the client is created at module scope but
 * reads config at request time, so configureApiClients() can be called
 * during app boot after the module is imported.
 *
 * @example
 * ```ts
 * // tools/contacts/src/client.ts
 * import { createApiClient } from '@ydtb/anvil-client'
 * import type { ContactsRouter } from './api/router'
 *
 * export const contactsApi = createApiClient<ContactsRouter>('contacts')
 *
 * // In a React component:
 * const { data } = useQuery(contactsApi.list.queryOptions({ input: { scopeId } }))
 * ```
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

interface ApiClientConfig {
  /** Base URL for the API server (e.g., 'http://localhost:3000') */
  baseUrl: string
  /** Returns the current scope — called on every request for header injection */
  getScope?: () => { id?: string | null; type?: string | null }
  /** Additional headers to include on every request */
  headers?: Record<string, string> | (() => Record<string, string>)
}

let _config: ApiClientConfig | null = null

/**
 * Configure all API clients. Call once during app boot.
 *
 * @example
 * ```ts
 * // In your app's boot file
 * import { configureApiClients } from '@ydtb/anvil-client'
 *
 * configureApiClients({
 *   baseUrl: import.meta.env.VITE_APP_URL ?? 'http://localhost:3000',
 *   getScope: () => ({ id: currentScopeId, type: currentScopeType }),
 * })
 * ```
 */
export function configureApiClients(config: ApiClientConfig): void {
  _config = config
}

function getConfig(): ApiClientConfig {
  if (!_config) {
    throw new Error(
      '[anvil-client] API clients not configured. ' +
      'Call configureApiClients() during app boot before making API requests.'
    )
  }
  return _config
}

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

/**
 * Build request headers — includes scope headers and custom headers.
 * Called on every request to ensure fresh scope data.
 */
function buildHeaders(): Record<string, string> {
  const config = getConfig()
  const base = typeof config.headers === 'function'
    ? config.headers()
    : config.headers ?? {}

  const result = { ...base }

  if (config.getScope) {
    const scope = config.getScope()
    if (scope.id) result['x-scope-id'] = scope.id
    if (scope.type) result['x-scope-type'] = scope.type
  }

  return result
}

/**
 * API client descriptor — returned by createApiClient().
 *
 * This is a lightweight descriptor that provides the URL and headers
 * for making requests to a specific tool's API. The actual oRPC client
 * creation is left to the consuming app since it depends on oRPC version
 * and TanStack Query integration.
 *
 * For full oRPC integration, the consuming app wraps this:
 * ```ts
 * import { createORPCClient } from '@orpc/client'
 * import { RPCLink } from '@orpc/client/fetch'
 *
 * const link = new RPCLink({
 *   url: apiDescriptor.url,
 *   headers: apiDescriptor.headers,
 * })
 * const client = createORPCClient<RouterClient<TRouter>>(link)
 * ```
 */
export interface ApiClientDescriptor {
  /** The tool's API URL (e.g., 'http://localhost:3000/api/contacts') */
  url: () => string
  /** Headers builder — returns fresh headers with scope on each call */
  headers: () => Record<string, string>
  /** The tool ID this client is for */
  toolId: string
}

/**
 * Create an API client descriptor for a tool.
 *
 * Returns URL and headers builders that the consuming app uses to create
 * the actual oRPC or fetch client. This keeps the framework decoupled
 * from specific oRPC versions.
 *
 * @param toolId - The tool's id (must match the tool's defineTool({ id }))
 *
 * @example
 * ```ts
 * import { createApiClient } from '@ydtb/anvil-client'
 *
 * // Module-scope — safe because config is read lazily
 * export const contactsApi = createApiClient('contacts')
 *
 * // Later, in a React component or utility:
 * const response = await fetch(contactsApi.url(), {
 *   headers: contactsApi.headers(),
 * })
 * ```
 */
export function createApiClient(toolId: string): ApiClientDescriptor {
  return {
    toolId,
    url: () => `${getConfig().baseUrl}/api/${toolId}`,
    headers: buildHeaders,
  }
}
