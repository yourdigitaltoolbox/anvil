/**
 * Layer tag registry — shared Effect tags for inter-layer dependencies.
 *
 * When layers depend on each other (e.g., auth depends on database),
 * they must reference the SAME Effect tag. This registry ensures that
 * `getLayerTag('database')` returns the same tag instance everywhere.
 *
 * @example
 * ```ts
 * // In the postgres layer:
 * const tag = getLayerTag<DatabaseLayer>('database')
 * const layer = Layer.scoped(tag, Effect.acquireRelease(...))
 *
 * // In the auth layer (depends on database):
 * const dbTag = getLayerTag<DatabaseLayer>('database')
 * const authTag = getLayerTag<AuthLayer>('auth')
 *
 * const layer = Layer.scoped(authTag,
 *   Effect.gen(function* () {
 *     const { db } = yield* dbTag  // resolved by Effect's dependency system
 *     return createAuth({ db })
 *   })
 * )
 * ```
 */

import { Context } from 'effect'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tagCache = new Map<string, Context.Tag<any, any>>()

/**
 * Get or create a shared Effect tag for a layer key.
 *
 * Returns the same tag instance for the same key — required for
 * inter-layer dependencies to resolve correctly via Effect.
 *
 * @param key - The layer key (must match a key in LayerMap)
 */
export function getLayerTag<T>(key: string): Context.Tag<T, T> {
  let tag = tagCache.get(key)
  if (!tag) {
    tag = Context.GenericTag<T>(`anvil/${key}`)
    tagCache.set(key, tag)
  }
  return tag as Context.Tag<T, T>
}

/**
 * Reset the tag cache. For testing only.
 * @internal
 */
export function resetLayerTags(): void {
  tagCache.clear()
}
