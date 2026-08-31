#!/bin/sh
set -eu

FAILED_MIGRATION="20260830000005_add_product_file_workflow"
MIGRATE_LOG="/tmp/pmp-migrate-deploy.log"

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
