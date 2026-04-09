import dataSource from '../common/database/data-source';

/**
 * Hard-fail schema drift check.
 *
 * Goal: ensure entity metadata matches the actual DB schema after migrations.
 * If this fails in CI, it means someone changed entities without writing/running a migration.
 */
async function main() {
  await dataSource.initialize();
  try {
    const schemaBuilder = dataSource.driver.createSchemaBuilder();
    const log = await schemaBuilder.log();

    const up = log.upQueries || [];
    const down = log.downQueries || [];

    if (up.length > 0) {
      // Print a small preview so developers know what changed without dumping everything.
      const preview = up.slice(0, 20).map((q) => q.query).join('\n');
      // eslint-disable-next-line no-console
      console.error(
        [
          '❌ Schema drift detected.',
          `- pending up queries: ${up.length}`,
          `- pending down queries: ${down.length}`,
          '',
          'Preview (first 20 queries):',
          preview,
          '',
          'Fix: create and run a TypeORM migration (see MIGRATIONS.md).',
        ].join('\n'),
      );
      process.exitCode = 1;
      return;
    }

    // eslint-disable-next-line no-console
    console.log('✅ No schema drift detected.');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('❌ Schema drift check failed:', e?.message || e);
  process.exitCode = 1;
});

