#!/bin/sh
set -eu

FAILED_MIGRATION="20260830000005_add_product_file_workflow"
MIGRATE_LOG="/tmp/pmp-migrate-deploy.log"
PUBLIC_UPLOADS_MOUNT="/app/public/uploads"
DEFAULT_PRIVATE_STORAGE_ROOT="$PUBLIC_UPLOADS_MOUNT/pmp-files"
PRIVATE_STORAGE_ROOT="${PMP_FILE_STORAGE_ROOT:-$DEFAULT_PRIVATE_STORAGE_ROOT}"

is_mounted() {
  awk -v target="$1" '$5 == target { found = 1 } END { exit found ? 0 : 1 }' /proc/self/mountinfo
}

prepare_private_storage() {
  # Automatically retire the short-lived /data/pmp configuration when this
  # package is updated on an installation that already has the durable public
  # uploads mapping.
  if [ "$PRIVATE_STORAGE_ROOT" = "/data/pmp" ] && ! is_mounted "/data/pmp" && is_mounted "$PUBLIC_UPLOADS_MOUNT"; then
    echo "Using the existing uploads mount for PMP private storage."
    PRIVATE_STORAGE_ROOT="$DEFAULT_PRIVATE_STORAGE_ROOT"
    export PMP_FILE_STORAGE_ROOT="$PRIVATE_STORAGE_ROOT"
  fi

  case "$PRIVATE_STORAGE_ROOT" in
    "$PUBLIC_UPLOADS_MOUNT"|"$PUBLIC_UPLOADS_MOUNT"/*)
      REQUIRED_MOUNT="$PUBLIC_UPLOADS_MOUNT"
      ;;
    "/data/pmp"|"/data/pmp"/*)
      REQUIRED_MOUNT="/data/pmp"
      ;;
    *)
      REQUIRED_MOUNT=""
      ;;
  esac

  if [ -n "$REQUIRED_MOUNT" ] && ! is_mounted "$REQUIRED_MOUNT"; then
    echo "PMP storage requires a durable mount at $REQUIRED_MOUNT; refusing to start." >&2
    exit 1
  fi

  mkdir -p "$PRIVATE_STORAGE_ROOT"

  # Best-effort transition for an installation whose legacy directory is
  # still reachable. Keep the source copy so this operation is retry-safe.
  for LEGACY_PRIVATE_STORAGE_ROOT in /app/private-uploads /data/pmp; do
    if [ "$PRIVATE_STORAGE_ROOT" != "$LEGACY_PRIVATE_STORAGE_ROOT" ] &&
      [ -d "$LEGACY_PRIVATE_STORAGE_ROOT" ] &&
      find "$LEGACY_PRIVATE_STORAGE_ROOT" -mindepth 1 -print -quit | grep -q .; then
      echo "Copying legacy PMP files from $LEGACY_PRIVATE_STORAGE_ROOT into $PRIVATE_STORAGE_ROOT"
      cp -a -n "$LEGACY_PRIVATE_STORAGE_ROOT"/. "$PRIVATE_STORAGE_ROOT"/
    fi
  done

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
  exec node /app/scripts/production.mjs
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
  exec node /app/scripts/production.mjs
fi

echo "Migration deployment failed; refusing automatic recovery for an unknown migration error." >&2
exit 1
