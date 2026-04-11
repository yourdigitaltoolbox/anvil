#!/usr/bin/env bash
# Publish all Anvil packages to the local Verdaccio registry.
#
# Workflow:
#   1. bun changeset          # describe your changes
#   2. bun version             # bump versions (changesets handles deps)
#   3. ./scripts/publish-local.sh  # publish to Verdaccio
#
# Or for a quick publish without changesets (forces current versions):
#   ./scripts/publish-local.sh
#
# Prerequisites:
#   npm config set @ydtb:registry http://10.0.0.49:4873/
#   npm login --registry http://10.0.0.49:4873/

set -euo pipefail

REGISTRY="http://10.0.0.49:4873/"
DRY_RUN=""

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="--dry-run"
  echo "=== DRY RUN ==="
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Ensure lockfile reflects current versions (critical for workspace:* resolution)
echo "=== Refreshing lockfile ==="
cd "$ROOT"
rm -f bun.lock
bun install --silent

# Publish order matters — dependencies must be published before dependents.
# Topological sort based on workspace:* dependencies:
PACKAGES=(
  # Tier 0: no workspace deps
  "packages/anvil"
  "packages/hooks"
  # Tier 1: depends on anvil + hooks
  "packages/server"
  # Tier 2: depends on anvil only
  "packages/client"
  "packages/build"
  # Tier 3: depends on anvil + server
  "packages/layers/auth"
  "packages/layers/bullmq"
  "packages/layers/pino"
  "packages/layers/postgres"
  "packages/layers/redis"
  "packages/layers/resend"
  "packages/layers/s3"
  "packages/layers/sentry"
  # Tier 4: depends on anvil + server + hooks + client
  "packages/toolkit"
)

FAILED=()
PUBLISHED=()

for pkg in "${PACKAGES[@]}"; do
  dir="$ROOT/$pkg"
  name=$(grep '"name"' "$dir/package.json" | head -1 | sed 's/.*: *"\(.*\)".*/\1/')
  echo ""
  echo "--- Publishing $name from $pkg ---"
  if (cd "$dir" && bun publish --registry "$REGISTRY" $DRY_RUN 2>&1); then
    echo "  OK: $name"
    PUBLISHED+=("$name")
  else
    echo "  FAILED: $name (may already exist at this version)"
    FAILED+=("$name")
  fi
done

echo ""
echo "=== Summary ==="
echo "Published: ${#PUBLISHED[@]}  Failed: ${#FAILED[@]}"
if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo "Failed packages: ${FAILED[*]}"
  echo "(Failures are expected if the version already exists on the registry)"
fi
