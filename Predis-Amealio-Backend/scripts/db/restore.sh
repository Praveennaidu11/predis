#!/usr/bin/env bash
set -euo pipefail

# Portable Postgres restore script (from local dump.gz).
#
# Requires: pg_restore, gzip
#
# Usage:
#   bash ./scripts/db/restore.sh ./backups/<file>.dump.gz

if [[ $# -lt 1 ]]; then
  echo "Usage: restore.sh <backup-file.dump.gz>"
  exit 1
fi

BACKUP_FILE="$1"
if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Backup file not found: $BACKUP_FILE"
  exit 1
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USERNAME="${DB_USERNAME:-postgres}"
DB_NAME="${DB_NAME:-postgres}"

echo "Restoring ${BACKUP_FILE} -> ${DB_HOST}:${DB_PORT}/${DB_NAME}"

export PGPASSWORD="${DB_PASSWORD:-${PGPASSWORD:-}}"

# Restore into target DB. Assumes DB exists.
gzip -dc "$BACKUP_FILE" | pg_restore \
  --host "$DB_HOST" \
  --port "$DB_PORT" \
  --username "$DB_USERNAME" \
  --dbname "$DB_NAME" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges

echo "Restore complete."

