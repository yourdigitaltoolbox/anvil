/**
 * Layer system — swappable infrastructure with compile-time verification.
 *
 * Each layer is a contract (TypeScript interface) with pluggable implementations.
 * The composition root declares which implementation to use for each layer.
 * Effect manages lifecycle internally (acquire/release, health checks, shutdown).
 *
 * Layers are the "materials" that tools are built with. Swap one line in
 * compose.config.ts to change the database, email provider, job queue, etc.
 */

import type { Layer } from 'effect'

// ---------------------------------------------------------------------------
// Layer Contracts
// ---------------------------------------------------------------------------

/** Database layer — query and transaction access. */
export interface DatabaseLayer {
  readonly db: unknown // Typed per implementation (DrizzleClient, PrismaClient, etc.)
}

/** Cache layer — key-value store with optional TTL. */
export interface CacheLayer {
  readonly get: (key: string) => Promise<string | null>
  readonly set: (key: string, value: string, ttlSeconds?: number) => Promise<void>
  readonly del: (key: string) => Promise<void>
}

/** Job layer — cron scheduling and trigger-based execution. */
export interface JobLayer {
  readonly registerCron: (job: JobDefinition) => void
  readonly executeJob: (job: JobDefinition) => Promise<void>
}

/** Log layer — structured logging. */
export interface LogLayer {
  readonly logger: Logger
}

/** Error reporting layer — capture exceptions with context. */
export interface ErrorLayer {
  readonly capture: (err: Error, context?: Record<string, unknown>) => void
}

/** Email layer — send transactional email. */
export interface EmailLayer {
  readonly send: (msg: EmailMessage) => Promise<void>
}

/** Storage layer — file/blob storage. */
export interface StorageLayer {
  readonly put: (key: string, data: Buffer | ReadableStream) => Promise<string>
  readonly get: (key: string) => Promise<Buffer | null>
  readonly delete: (key: string) => Promise<void>
  readonly getUrl: (key: string) => string
}

// ---------------------------------------------------------------------------
// Layer Map — all required layers
// ---------------------------------------------------------------------------

/** Map of all layer contracts. Used for compile-time verification. */
export interface LayerMap {
  database: DatabaseLayer
  cache: CacheLayer
  jobs: JobLayer
  logging: LogLayer
  errors: ErrorLayer
  email: EmailLayer
  storage: StorageLayer
}

/**
 * Required layers for `defineApp`.
 * Every key must be provided — omit one and TypeScript errors.
 */
export type RequiredLayers = {
  [K in keyof LayerMap]: LayerConfig<K>
}

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
 */
export interface LayerConfig<K extends keyof LayerMap = keyof LayerMap> {
  /** Layer identifier (matches the key in RequiredLayers) */
  readonly id: K
  /** @internal Effect Layer — used by @ydtb/anvil-server to compose the runtime */
  readonly _effectLayer: Layer.Layer<LayerMap[K], never, never>
  /** @internal Health check Effect — used by @ydtb/anvil-server for /readyz */
  readonly _healthCheck?: unknown // Effect.Effect<HealthStatus>
}

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

export interface JobDefinition {
  id: string
  label: string
  schedule?: string
  trigger?: string
  handler: () => Promise<void>
}

export interface Logger {
  debug: (obj: unknown, msg?: string) => void
  info: (obj: unknown, msg?: string) => void
  warn: (obj: unknown, msg?: string) => void
  error: (obj: unknown, msg?: string) => void
  child: (bindings: Record<string, unknown>) => Logger
}

export interface EmailMessage {
  to: string | string[]
  subject: string
  body: string
  html?: string
  from?: string
  replyTo?: string
}
