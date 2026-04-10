# Anvil Packaging Model

Three layers of reusability, not two.

## The Three Layers

```
┌─────────────────────────────────────────────────────┐
│  Framework + Toolkit Core                           │
│  Reusable by ANY Anvil consumer                     │
│                                                     │
│  @ydtb/anvil, @ydtb/anvil-server, @ydtb/anvil-*    │
│  @ydtb/anvil-toolkit                                │
│  @ydtb/anvil-layer-*                                │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│  Domain Packages                                    │
│  Reusable across a product family or organization   │
│                                                     │
│  @ydtb/scope-extension                              │
│  @ydtb/permissions                                  │
│  @ydtb/notifications                                │
│  @ydtb/integrations-core                            │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│  App Composition                                    │
│  Deployment-specific wiring, UX, product assembly   │
│                                                     │
│  apps/main/compose.config.ts                        │
│  apps/main/server/index.ts                          │
│  apps/whitelabel/compose.config.ts                  │
└─────────────────────────────────────────────────────┘
```

## What Goes Where

### Framework + Toolkit Core

**Criteria:** Would ANY Anvil consumer benefit from this?

- Layer system, hook system, extensions, guards, route layouts
- `defineTool`, `defineScope`, `defineClient`, `defineServer`
- Scope hierarchy utilities, chain traversal helpers
- `onExtensionBoot`, `onExtensionShutdown`
- Build plugin, virtual modules, Tailwind source generation

**Characteristics:**
- No opinions about domain behavior
- No persistence (pure functions, types, mechanics)
- Published as npm packages anyone can install
- Backwards compatibility matters

### Domain Packages

**Criteria:** Reusable across multiple apps in your organization, but allowed to be opinionated about your domain.

- Scope extension (membership, invitations, join codes)
- Permissions system (RBAC, cascading resolution, role templates)
- Notification system (delivery engine, channels, preferences)
- Integration framework (OAuth vault, provider registry)
- Activity logging (audit trail, broadcast listeners)
- Search aggregation (provider collection, query dispatch)

**Characteristics:**
- Own their database schema
- Own their API routes (as extensions or app-level routes)
- Dispatch domain events via hooks (`scope:created`, `member:joined`)
- Can depend on toolkit core
- Can be opinionated (YDTB's permission model, YDTB's invitation flow)
- Packaged as workspace packages in the monorepo
- Shared across `apps/main`, `apps/whitelabel`, `apps/gym`

**This is the key insight:** Something doesn't have to be in toolkit core to be reusable. Domain packages are reusable within your organization. They're proper packages with their own `package.json`, not throwaway app code.

### App Composition

**Criteria:** Specific to one deployment.

- `compose.config.ts` — which layers, extensions, scopes, tools
- `server/index.ts` — middleware stack, port, app-level routes
- Brand configuration (logo, colors, name)
- Environment-specific settings
- Feature flags for this deployment

**Characteristics:**
- Thin wiring layer
- No business logic
- Different per deployment (main vs whitelabel vs gym)
- Not reusable — that's the point

## Example: YDTB's Package Architecture

```
Framework/Toolkit (generic — any Anvil app):
  @ydtb/anvil                    → core types
  @ydtb/anvil-server             → server runtime
  @ydtb/anvil-toolkit/core       → tool/scope definitions
  @ydtb/anvil-layer-postgres     → database layer

Domain Packages (YDTB-specific — shared across YDTB apps):
  @ydtb/scope-extension          → membership, invitations, hierarchy CRUD
  @ydtb/permissions              → RBAC, cascading, role templates
  @ydtb/notifications            → delivery engine, in-app + email
  @ydtb/integrations-core        → OAuth vault, provider registry
  @ydtb/activity                 → audit logging
  tools/contacts/                → contacts CRM
  tools/billing/                 → Stripe integration

App Composition (deployment-specific):
  apps/main/compose.config.ts    → full SaaS with all tools
  apps/whitelabel/compose.config.ts → subset of tools, different brand
  apps/gym/compose.config.ts     → gym-specific configuration
```

## Decision Framework

When deciding where something belongs, ask:

1. **Would a CMS app built on Anvil need this?** → Framework/toolkit core
2. **Would another YDTB deployment need this?** → Domain package
3. **Is this specific to one deployment?** → App composition

If you're unsure, start as a domain package. Promote to toolkit core only when a second, unrelated Anvil consumer proves the need. Premature promotion leads to over-abstraction; starting as a domain package preserves the ability to be opinionated while remaining reusable.
