# Database backup & restore strategy (Postgres)

This document is a Dev/DevOps handoff: it defines how to back up and restore our Postgres database for **any environment**, with optional S3 support.

## Summary

- **Primary (recommended in production)**: managed backups (e.g., AWS RDS automated backups + PITR)
- **Secondary/portable**: `pg_dump` dumps (compressed) stored locally and optionally uploaded to S3

## Targets (defaults – adjust per environment)

- **RPO (max data loss)**: 24h (daily dumps) or 1h (PITR)
- **RTO (restore time)**: 1–4h
- **Retention**: 7 daily, 4 weekly, 6 monthly (or use S3 lifecycle rules)

## What’s in the database (why backups matter)

Critical tables include:
- `users`, `content`, `brands`, `social_accounts`
- `payments`, `transactions`
- `admin_settings`, `admin_settings_audit`
- `generation_jobs`, `videos`, `analytics`, `prompt_histories`

## Option A: Managed backups (AWS RDS / Supabase / Cloud SQL)

### Recommended AWS RDS setup
- Enable **automated backups** and set retention days
- Enable **PITR** (point-in-time recovery)
- Restrict snapshot access to the minimum needed IAM roles

### Restore workflow (high level)
1. Restore a new instance from snapshot or point-in-time
2. Update app connection (`DB_HOST`, etc.) to point to restored instance
3. Run verification checklist (below)

## Option B: Portable dumps (local + optional S3)

These scripts live in:
- `Predis-Amealio-Backend/scripts/db/`

### Requirements
- `pg_dump` and `pg_restore` available in PATH
- For S3 mode: AWS CLI (`aws`) configured (IAM role or access keys)

### Environment variables used by scripts

**DB connection**
- `DB_HOST` (default: `localhost`)
- `DB_PORT` (default: `5432`)
- `DB_USERNAME` (default: `postgres`)
- `DB_PASSWORD` (optional if `.pgpass`/integrated auth is used)
- `DB_NAME` (default: `postgres`)

**Backup location**
- `BACKUP_DIR` (default: `./backups`)
- `BACKUP_KEEP_DAYS` (default: `14`)

**Optional S3 upload/download**
- `S3_BUCKET` (e.g. `my-company-backups`)
- `S3_PREFIX` (default: `predis/amealio-db`)
- `AWS_REGION` (optional if configured globally)
- `S3_SSE` (optional: `AES256` or `aws:kms`)
- `S3_KMS_KEY_ID` (optional: when `S3_SSE=aws:kms`)

> DevOps note: prefer S3 lifecycle rules for retention rather than relying only on local retention.

### Backup (local + optional S3)

Windows:
```powershell
cd Predis-Amealio-Backend
powershell -ExecutionPolicy Bypass -File .\\scripts\\db\\backup.ps1
```

Linux:
```bash
cd Predis-Amealio-Backend
bash ./scripts/db/backup.sh
```

### Restore (from local file or optional S3)

Windows:
```powershell
cd Predis-Amealio-Backend
powershell -ExecutionPolicy Bypass -File .\\scripts\\db\\restore.ps1 -BackupFile ".\\backups\\<file>.dump.gz"
```

Linux:
```bash
cd Predis-Amealio-Backend
bash ./scripts/db/restore.sh ./backups/<file>.dump.gz
```

## Verification checklist (post-restore)

Run these checks in staging after restore:
- Backend can start and connect to DB
- Login works (JWT issuance)
- Merchant:
  - brands list
  - content list
  - dashboard stats
- Admin:
  - admin settings list / audit log
- Payments:
  - payment history endpoint returns

## Restore drills

- Do a **monthly** restore into staging.
- Record:
  - time to restore
  - issues encountered
  - any missing runbook steps

