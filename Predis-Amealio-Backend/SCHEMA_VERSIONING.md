# Schema version control

This repo treats the database schema as **versioned code**.

## Principles

- **Migrations are the only way** the schema changes in staging/production.
- Entity changes must be accompanied by a migration in the same PR.
- CI should **fail** if there is schema drift (entities no longer match the DB after migrations).

## What “schema drift” means

Schema drift occurs when:

- an entity changes (column/type/index/relation) but
- no migration is written and applied,

so different environments end up with different schemas.

## Workflow

1. Change entities
2. Create migration:
   - Prefer `npm run migration:create` for hand-written migrations (indexes, backfills)
   - Use `npm run migration:generate -- -n short_name` when changes are straightforward
3. Run migrations locally:

```bash
npm run migration:run
```

4. Run drift check:

```bash
npm run schema:check
```

If `schema:check` fails, your PR is missing a migration (or migrations haven’t been applied).

## CI recommendation

In CI, run:

- `npm run migration:run`
- `npm run schema:check`

This guarantees the committed migrations fully represent the entity schema.

