#!/bin/sh
set -eu

FAILED_MIGRATION="20260830000005_add_product_file_workflow"
MIGRATE_LOG="/tmp/pmp-migrate-deploy.log"
PRIVATE_STORAGE_ROOT="${PMP_FILE_STORAGE_ROOT:-/app/private-uploads}"
LEGACY_PRIVATE_STORAGE_ROOT="/app/private-uploads"

prepare_private_storage() {
  # Unraid deployments deliberately use /data/pmp. Refuse to start if that
  # path is not actually mounted, otherwise uploads would silently land in the
  # disposable container filesystem again.
  if [ "$PRIVATE_STORAGE_ROOT" = "/data/pmp" ] &&
    ! awk '$5 == "/data/pmp" { found = 1 } END { exit found ? 0 : 1 }' /proc/self/mountinfo; then
    echo "PMP private storage is not mounted at /data/pmp; refusing to start." >&2
    echo "Deploy with docker-compose.unraid.yml or map a durable host path to /data/pmp." >&2
    exit 1
  fi

  mkdir -p "$PRIVATE_STORAGE_ROOT"

  # Best-effort transition for an installation whose legacy directory is
  # still reachable. Keep the source copy so this operation is retry-safe.
  if [ "$PRIVATE_STORAGE_ROOT" != "$LEGACY_PRIVATE_STORAGE_ROOT" ] &&
    [ -d "$LEGACY_PRIVATE_STORAGE_ROOT" ] &&
    find "$LEGACY_PRIVATE_STORAGE_ROOT" -mindepth 1 -print -quit | grep -q .; then
    echo "Copying legacy PMP files into durable storage at $PRIVATE_STORAGE_ROOT"
    cp -a -n "$LEGACY_PRIVATE_STORAGE_ROOT"/. "$PRIVATE_STORAGE_ROOT"/
  fi

  WRITE_TEST="$PRIVATE_STORAGE_ROOT/.pmp-storage-write-test-$$"
  if ! (umask 077 && : > "$WRITE_TEST"); then
    echo "PMP private storage is not writable at $PRIVATE_STORAGE_ROOT; refusing to start." >&2
    exit 1
  fi
  rm -f "$WRITE_TEST"
}

prepare_private_storage

if npx prisma migrate deploy >"$MIGRATE_LOG" 2>&1; then
  cat "$MIGRATE_LOG"
  exec npm run start
fi

cat "$MIGRATE_LOG" >&2

# This migration originally failed in deployed databases that had legacy
# duplicate Product.publicName values. The migration now renames the later
# duplicate records before it adds the unique index. Retrying is safe only for
# this known, explicitly named failed migration; any other error remains fatal.
if grep -Fq "P3009" "$MIGRATE_LOG" && grep -Fq "$FAILED_MIGRATION" "$MIGRATE_LOG"; then
  echo "Recovering known failed migration: $FAILED_MIGRATION" >&2
  npx prisma migrate resolve --rolled-back "$FAILED_MIGRATION"
  npx prisma migrate deploy
  exec npm run start
fi

echo "Migration deployment failed; refusing automatic recovery for an unknown migration error." >&2
exit 1
