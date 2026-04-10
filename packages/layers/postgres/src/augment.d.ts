/**
 * Type augmentation for @ydtb/anvil-layer-postgres.
 *
 * If LayerMap augmentation isn't visible in your project, add this to
 * your tsconfig.json:
 *
 * ```json
 * {
 *   "include": ["**\/*.ts", "node_modules/@ydtb/anvil-layer-postgres/src/augment.d.ts"]
 * }
 * ```
 *
 * Or import the layer's index.ts in a .d.ts file:
 * ```ts
 * /// <reference path="node_modules/@ydtb/anvil-layer-postgres/src/index.ts" />
 * ```
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type postgres from 'postgres'

declare module '@ydtb/anvil' {
  interface LayerMap {
    database: {
      readonly db: PostgresJsDatabase
      readonly sql: postgres.Sql
    }
  }
}
