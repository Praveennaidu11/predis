# Soft delete support

## What is soft delete?

**Soft delete** means we **do not physically remove** a row from the database.  
Instead, we mark it as deleted (usually by setting a timestamp column like `deleted_at`).

### Why products use soft delete

- **Undo/restore**: admins or users can recover accidentally deleted records.
- **Auditability**: keeps history for compliance/debugging.
- **Safety**: avoids breaking references immediately (e.g., content linked to analytics, brands linked to content).

### Trade-offs

- Queries must exclude deleted rows (handled automatically by TypeORM when using `DeleteDateColumn` + `softDelete()`).
- Storage grows until you add a retention policy / hard-delete job.

## What we implemented in this project

We added soft delete to:

- `brands`
- `content`
- `social_accounts`

## How it works (TypeORM)

- Entities now include `@DeleteDateColumn({ name: 'deleted_at' }) deletedAt`.
- Deletes use `repository.softDelete(...)` which sets `deleted_at = NOW()`.
- Lists/reads using `find/findOne` **automatically exclude** rows with `deleted_at IS NOT NULL` unless you query with `withDeleted`.
- Restore uses `repository.restore(...)` which clears `deleted_at`.

## Migrations

- `Predis-Amealio-Backend/src/common/database/migrations/1712510000000-soft-delete-columns.ts`
  - Adds `deleted_at` column to the 3 tables
  - Adds helper indexes including `deleted_at` to keep typical reads fast

## API changes

### Brands (merchant)

- `DELETE /api/merchant/brands/:id` → soft delete
- `POST /api/merchant/brands/:id/restore` → restore soft-deleted brand
- `GET /api/merchant/brands?trash=1` → list soft-deleted brands (Trash view)

### Content (merchant)

- `DELETE /api/merchant/content/:id` → soft delete
- `POST /api/merchant/content/:id/restore` → restore soft-deleted content
- `GET /api/merchant/content/list?trash=1` → list soft-deleted content (Trash view)

### Social accounts

- `DELETE /api/social/accounts/:id` → soft delete (disconnect)
- `POST /api/social/accounts/:id/restore` → restore

## Important behavior notes

- **Soft-deleted records disappear from lists** by default.
- **Restore brings them back** without needing to recreate IDs.
- Brand logo files are **not deleted** when a brand is soft-deleted (so restore works predictably).

## Test plan

1. Create a brand/content/social account.
2. Delete it via the API.
3. Confirm it no longer appears in list endpoints.
4. Restore it via the restore endpoint.
5. Confirm it appears again.


