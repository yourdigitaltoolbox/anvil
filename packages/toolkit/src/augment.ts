/**
 * Toolkit augmentation — extends the framework's types with toolkit-specific fields.
 *
 * This file is imported by the toolkit's barrel export for side-effect.
 * When @ydtb/anvil-toolkit is imported, AppConfig gains the `scopes` field.
 */

import type { ScopeDefinition } from './scope.ts'

declare module '@ydtb/anvil' {
  interface AppConfig {
    /** Scope hierarchy — nested tree with per-level tool includes */
    scopes?: ScopeDefinition
  }
}
