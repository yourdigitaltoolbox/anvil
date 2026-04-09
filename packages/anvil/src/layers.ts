/**
 * Layer system — swappable infrastructure with compile-time verification.
 *
 * The framework ships with NO hardcoded layer contracts. `LayerMap` is an
 * empty interface that layer packages augment via declaration merging:
 *
 * ```ts
 * // @ydtb/anvil-layer-postgres
 * declare module '@ydtb/anvil' {
 *   interface LayerMap {
 *     database: DatabaseLayer
 *   }
 * }
 * ```
 *
 * Installing a layer package adds its contract to `LayerMap`. `RequiredLayers`
 * derives from `LayerMap`, so `defineApp` requires exactly the layers declared
 * by installed packages. No more, no less.
 *
 * This means:
 * - Adding a new layer contract doesn't touch the framework
 * - Different Anvil apps can have completely different layer sets
 * - The framework is truly generic — it provides the mechanism, never the policy
 */

// ---------------------------------------------------------------------------
// Layer Map — augmented by layer packages
// ---------------------------------------------------------------------------

/**
 * Map of all layer contracts. Empty by default — augmented via declaration
 * merging by layer packages.
 *
 * @example
 * ```ts
 * // In @ydtb/anvil-layer-postgres
 * declare module '@ydtb/anvil' {
 *   interface LayerMap {
 *     database: { readonly db: DrizzleClient }
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface LayerMap {}

// ---------------------------------------------------------------------------
// Layer Config — what factory functions return
// ---------------------------------------------------------------------------

/** Health check result for a layer. */
export interface HealthStatus {
  status: 'ok' | 'error'
  message?: string
  latencyMs?: number
}

/**
 * Configuration object returned by layer factory functions.
 * Contains the Effect Layer internally — consumers never see Effect.
 *
 * The `_effectLayer` and `_healthCheck` fields are typed as `unknown` in the
 * core package to avoid an Effect dependency. The server package (`@ydtb/anvil-server`)
 * casts them to the correct Effect types when processing layers.
 */
export interface LayerConfig<K extends keyof LayerMap = keyof LayerMap> {
  /** Layer identifier (matches the key in LayerMap) */
  readonly id: K
  /** @internal Effect Layer — used by @ydtb/anvil-server to compose the runtime */
  readonly _effectLayer: unknown
  /** @internal Health check — used by @ydtb/anvil-server for /readyz */
  readonly _healthCheck?: unknown
}

/**
 * Required layers for `defineApp`.
 * Every key in `LayerMap` must be provided — omit one and TypeScript errors.
 * When no layer packages are installed, this is an empty object.
 */
export type RequiredLayers = {
  [K in keyof LayerMap]: LayerConfig<K>
}

// ---------------------------------------------------------------------------
// Supporting types (framework-level, used by multiple packages)
// ---------------------------------------------------------------------------

/** Background job definition — registered by tools via server surfaces. */
export interface JobDefinition {
  id: string
  label: string
  schedule?: string
  trigger?: string
  handler: () => Promise<void>
}

/**
 * Logger interface — the contract for structured logging.
 * Used by RequestContext and getLogger(). Intentionally minimal —
 * any structured logger (pino, winston, console wrapper) can satisfy this.
 */
export interface Logger {
  debug: (obj: unknown, msg?: string) => void
  info: (obj: unknown, msg?: string) => void
  warn: (obj: unknown, msg?: string) => void
  error: (obj: unknown, msg?: string) => void
  child: (bindings: Record<string, unknown>) => Logger
}
