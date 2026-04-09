# Database indexing (Postgres)

This document records our indexing work and rollout strategy.

## Why indexing matters in this project

The backend heavily uses TypeORM `find/count/findOne` and a few query builders, typically with:

- **Per-user filters**: `WHERE user_id = ?`
- **Status filters**: `WHERE status = ?`
- **Time ordering**: `ORDER BY created_at DESC`
- **Joins**: `analytics.content_id -> content.id`, `content.brand_id -> brands.id`
- **Admin audit logs**: time-ordered feeds with filters

Without indexes, these patterns degrade into sequential scans as tables grow, causing:

- slow dashboards (counts + recent lists)
- slow admin lists
- higher DB CPU and IO
- worse concurrency under load

## Rollout strategy (industry standard)

- Use **migrations** for repeatable schema changes across dev/stage/prod.
- Use **`CREATE INDEX CONCURRENTLY`** in production to minimize locking.
- Run migrations during deploy (or as a separate step) and monitor DB load.

## Implemented migration

- **Migration file**: `Predis-Amealio-Backend/src/common/database/migrations/1712500000000-add-indexes.ts`
- **How to run**:
  - `cd Predis-Amealio-Backend`
  - `npm run migration:run`

> Note: `migration:run` uses `--transaction none` because Postgres forbids `CREATE INDEX CONCURRENTLY` inside a transaction.

## Indexes added (Phase 1 + Phase 2)

### `content`

- `idx_content_user_created_at` on `(user_id, created_at DESC)`
  - Speeds: recent content list, pagination
- `idx_content_user_status_created_at` on `(user_id, status, created_at DESC)`
  - Speeds: dashboard counts + status-filtered lists
- `idx_content_status_created_at` on `(status, created_at DESC)`
  - Speeds: admin content list filtered by status
- `idx_content_brand_id` on `(brand_id)`
  - Speeds: brand joins/filtering

### `brands`

- `idx_brands_user_created_at` on `(user_id, created_at DESC)`
  - Speeds: merchant brands list

### `analytics`

- `idx_analytics_content_id` on `(content_id)`
  - Speeds: analytics ↔ content joins and relation loads

### `prompt_histories`

- `idx_prompt_histories_user_created_at` on `(user_id, created_at DESC)`
  - Speeds: per-user “recent prompts” style queries

### `payments` / `transactions`

- `idx_payments_user_created_at` on `(user_id, created_at DESC)`
- `idx_transactions_user_created_at` on `(user_id, created_at DESC)`
  - Speeds: histories in billing pages

### `social_accounts`

- `idx_social_accounts_user_id` on `(user_id)`
- `idx_social_accounts_user_platform` on `(user_id, platform)`
  - Speeds: loading user profile integrations

### `generation_jobs`

- `idx_generation_jobs_user_created_at` on `(user_id, created_at DESC)`
  - Speeds: future “jobs list for user/admin” pages

### `admin_settings`

- `idx_admin_settings_category_key` on `(category, key)`
  - Speeds: category-filtered settings list ordered by key

### `admin_settings_audit`

- `idx_admin_settings_audit_created_at` on `(created_at DESC)`
- `idx_admin_settings_audit_key_created_at` on `(setting_key, created_at DESC)`
- `idx_admin_settings_audit_actor_created_at` on `(actor_user_id, created_at DESC)`
- `idx_admin_settings_audit_action_created_at` on `(action, created_at DESC)`
  - Speeds: audit feed filters + timeline ordering

## Verification ideas

In staging/prod, verify with `EXPLAIN (ANALYZE, BUFFERS)` for:

- recent content query by user
- dashboard counts by status
- admin audit list filtered by key/action

## Follow-ups (optional)

- Consider **partial indexes** when one status dominates (`scheduled`, `published`).
- Consider **trigram indexes** only if we need fast `ILIKE '%...%'` search over keys/categories at scale.

