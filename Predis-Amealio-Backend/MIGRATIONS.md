# Database migrations (TypeORM)

This project uses **TypeORM migrations** to manage schema changes in a repeatable, production-safe way.

## Rules

- **Never rely on `synchronize` in staging/production.**
- Every schema change must be captured as a **migration** committed to git.
- Prefer safe operations (e.g. `CREATE INDEX CONCURRENTLY`) when needed.

## Where migrations live

- `src/common/database/migrations/`

## Commands

Run from `Predis-Amealio-Backend`:

### Create an empty migration (recommended for indexes/data backfills)

```bash
npm run migration:create
```

Then edit the generated file and implement `up()` / `down()`.

### Generate a migration from entity changes (use carefully)

```bash
npm run migration:generate -- -n describe_change
```

Review the generated SQL before committing.

### Run migrations

```bash
npm run migration:run
```

> Note: we run with `--transaction none` because Postgres does not allow `CREATE INDEX CONCURRENTLY` inside a transaction.

### Show migration status

```bash
npm run migration:show
```

### Revert last migration (use with caution)

```bash
npm run migration:revert
```

## Deployment workflow (staging/production)

1. Deploy code (or prepare release image)
2. Run migrations:

```bash
npm run migration:run
```

3. Start the backend:

```bash
npm run start:prod
```

## Review checklist (before merging a migration)

- Does it lock large tables? If yes, can it be made safer?
- If creating indexes on big tables, use **`CONCURRENTLY`** and ensure migrations run with `--transaction none`.
- Is `down()` safe and correct?
- Any data backfill: confirm it’s idempotent or safe to re-run.

