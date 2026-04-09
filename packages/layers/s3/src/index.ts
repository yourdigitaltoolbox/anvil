/**
 * @ydtb/anvil-layer-s3 — Object storage layer for Anvil.
 *
 * Provides S3-compatible object storage via the AWS SDK. Works with
 * AWS S3, MinIO, R2, and other S3-compatible providers.
 *
 * @example
 * ```ts
 * // compose.config.ts
 * import { s3 } from '@ydtb/anvil-layer-s3'
 *
 * export default defineApp({
 *   layers: {
 *     storage: s3({ bucket: 'my-app-uploads', region: 'us-east-1' }),
 *   },
 * })
 * ```
 *
 * Then in tool code:
 * ```ts
 * import { getLayer } from '@ydtb/anvil-server'
 *
 * const storage = getLayer('storage')
 * await storage.put('avatars/user_123.png', imageBuffer)
 * const data = await storage.get('avatars/user_123.png')
 * const url = storage.getUrl('avatars/user_123.png')
 * ```
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3'
import { Effect, Layer } from 'effect'
import type { LayerConfig, HealthStatus } from '@ydtb/anvil'
import { createLayerConfig, getLayerTag } from '@ydtb/anvil-server'

// ---------------------------------------------------------------------------
// Layer contract
// ---------------------------------------------------------------------------

export interface StorageLayer {
  /** Put an object into storage. Returns the key. */
  readonly put: (key: string, data: Buffer | ReadableStream | string) => Promise<string>
  /** Get an object by key. Returns null if not found. */
  readonly get: (key: string) => Promise<Buffer | null>
  /** Delete an object by key. */
  readonly del: (key: string) => Promise<void>
  /** Get the URL for an object. */
  readonly getUrl: (key: string) => string
  /** Check if an object exists. */
  readonly exists: (key: string) => Promise<boolean>
}

// ---------------------------------------------------------------------------
// Augment LayerMap
// ---------------------------------------------------------------------------

declare module '@ydtb/anvil' {
  interface LayerMap {
    storage: StorageLayer
  }
}

// ---------------------------------------------------------------------------
// Effect tag
// ---------------------------------------------------------------------------

const StorageTag = getLayerTag<StorageLayer>('storage')

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface S3Config {
  /** S3 bucket name */
  bucket: string
  /** AWS region (default: 'us-east-1') */
  region?: string
  /** Custom endpoint for S3-compatible providers (e.g., MinIO, R2) */
  endpoint?: string
  /** Explicit credentials (uses default credential chain if not set) */
  credentials?: {
    accessKeyId: string
    secretAccessKey: string
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a ReadableStream to a Buffer */
async function streamToBuffer(stream: ReadableStream): Promise<Buffer> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let done = false
  while (!done) {
    const result = await reader.read()
    done = result.done
    if (result.value) chunks.push(result.value)
  }
  return Buffer.concat(chunks)
}

/** Convert an AWS SDK Body to a Buffer */
async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (body instanceof Buffer) return body
  if (body instanceof Uint8Array) return Buffer.from(body)
  if (typeof body === 'string') return Buffer.from(body)

  // AWS SDK v3 returns a Readable (node) or ReadableStream (web)
  if (body && typeof (body as any).transformToByteArray === 'function') {
    const bytes = await (body as any).transformToByteArray()
    return Buffer.from(bytes)
  }

  throw new Error('Unsupported body type from S3 GetObject response')
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an S3 storage layer with client lifecycle management.
 *
 * The S3 client is created on boot and destroyed on shutdown.
 *
 * @example
 * ```ts
 * import { s3 } from '@ydtb/anvil-layer-s3'
 *
 * defineApp({
 *   layers: {
 *     storage: s3({
 *       bucket: 'my-uploads',
 *       region: 'us-east-1',
 *       endpoint: 'http://localhost:9000', // for MinIO
 *     }),
 *   },
 * })
 * ```
 */
export function s3(config: S3Config): LayerConfig<'storage'> {
  const {
    bucket,
    region = 'us-east-1',
    endpoint,
    credentials,
  } = config

  const effectLayer = Layer.scoped(
    StorageTag,
    Effect.acquireRelease(
      // Acquire: create S3 client
      Effect.sync(() => {
        const client = new S3Client({
          region,
          endpoint,
          credentials,
          forcePathStyle: !!endpoint, // Required for MinIO / S3-compatible
        })

        const baseUrl = endpoint
          ? `${endpoint}/${bucket}`
          : `https://${bucket}.s3.${region}.amazonaws.com`

        const service: StorageLayer = {
          put: async (key, data) => {
            let body: Buffer | string
            if (data instanceof ReadableStream) {
              body = await streamToBuffer(data)
            } else {
              body = data as Buffer | string
            }

            await client.send(
              new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: body,
              }),
            )
            return key
          },

          get: async (key) => {
            try {
              const response = await client.send(
                new GetObjectCommand({
                  Bucket: bucket,
                  Key: key,
                }),
              )
              return bodyToBuffer(response.Body)
            } catch (err: any) {
              if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
                return null
              }
              throw err
            }
          },

          del: async (key) => {
            await client.send(
              new DeleteObjectCommand({
                Bucket: bucket,
                Key: key,
              }),
            )
          },

          getUrl: (key) => `${baseUrl}/${key}`,

          exists: async (key) => {
            try {
              await client.send(
                new HeadObjectCommand({
                  Bucket: bucket,
                  Key: key,
                }),
              )
              return true
            } catch {
              return false
            }
          },
        }

        return { service, client }
      }),
      // Release: destroy the S3 client
      ({ client }) => Effect.sync(() => client.destroy()),
    ).pipe(Effect.map(({ service }) => service)),
  )

  // Health check: try HeadBucket
  const healthCheck = Effect.gen(function* () {
    const start = Date.now()
    yield* Effect.tryPromise(() => {
      const client = new S3Client({
        region,
        endpoint,
        credentials,
        forcePathStyle: !!endpoint,
      })
      return client.send(new HeadBucketCommand({ Bucket: bucket })).finally(() => client.destroy())
    }).pipe(Effect.orDie)
    return {
      status: 'ok' as const,
      latencyMs: Date.now() - start,
    } satisfies HealthStatus
  })

  return createLayerConfig('storage', effectLayer, {
    healthCheck,
  })
}

// Re-export types
export type { StorageLayer as StorageLayerContract }
