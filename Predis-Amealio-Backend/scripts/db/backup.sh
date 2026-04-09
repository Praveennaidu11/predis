#!/usr/bin/env bash
set -euo pipefail

# Portable Postgres backup script (local + optional S3).
#
# Requires: pg_dump, gzip
# Optional: aws CLI for S3 upload

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USERNAME="${DB_USERNAME:-postgres}"
DB_NAME="${DB_NAME:-postgres}"

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

S3_BUCKET="${S3_BUCKET:-}"
S3_PREFIX="${S3_PREFIX:-predis/amealio-db}"
S3_SSE="${S3_SSE:-}"          # AES256 | aws:kms
S3_KMS_KEY_ID="${S3_KMS_KEY_ID:-}"

mkdir -p "$BACKUP_DIR"

TS="$(date -u +"%Y%m%dT%H%M%SZ")"
FILENAME="${DB_NAME}_${TS}.dump.gz"
OUTFILE="${BACKUP_DIR%/}/${FILENAME}"

echo "Backing up ${DB_HOST}:${DB_PORT}/${DB_NAME} -> ${OUTFILE}"

export PGPASSWORD="${DB_PASSWORD:-${PGPASSWORD:-}}"
pg_dump \
  --host "$DB_HOST" \
  --port "$DB_PORT" \
  --username "$DB_USERNAME" \
  --format=custom \
  --no-owner \
  --no-privileges \
  "$DB_NAME" | gzip -c > "$OUTFILE"

echo "Backup complete."

# Local retention (best-effort). Prefer S3 lifecycle rules in production.
if [[ "$BACKUP_KEEP_DAYS" =~ ^[0-9]+$ ]]; then
  echo "Applying local retention: delete files older than ${BACKUP_KEEP_DAYS} days"
  find "$BACKUP_DIR" -type f -name "*.dump.gz" -mtime +"$BACKUP_KEEP_DAYS" -print -delete || true
fi

# Optional S3 upload
if [[ -n "$S3_BUCKET" ]]; then
  if command -v aws >/dev/null 2>&1; then
    S3_KEY="${S3_PREFIX%/}/${FILENAME}"
    echo "Uploading to s3://${S3_BUCKET}/${S3_KEY}"

    EXTRA_ARGS=()
    if [[ -n "$S3_SSE" ]]; then
      EXTRA_ARGS+=(--sse "$S3_SSE")
      if [[ "$S3_SSE" == "aws:kms" && -n "$S3_KMS_KEY_ID" ]]; then
        EXTRA_ARGS+=(--sse-kms-key-id "$S3_KMS_KEY_ID")
      fi
    fi

    aws s3 cp "$OUTFILE" "s3://${S3_BUCKET}/${S3_KEY}" "${EXTRA_ARGS[@]}"
    echo "S3 upload complete."
  else
    echo "WARN: S3_BUCKET set but aws CLI not found; skipping upload."
  fi
fi

