import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTagsSoftDeleteIndexes1711200000001 implements MigrationInterface {
  name = 'AddTagsSoftDeleteIndexes1711200000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add tags column (stores comma-separated list via TypeORM simple-array)
    await queryRunner.query(`
      ALTER TABLE "content"
      ADD COLUMN IF NOT EXISTS "tags" text NULL
    `);

    // Add soft-delete column
    await queryRunner.query(`
      ALTER TABLE "content"
      ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP NULL
    `);

    // Performance indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_content_user_id"
      ON "content" ("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_content_user_id_status"
      ON "content" ("user_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_content_scheduled_at"
      ON "content" ("scheduled_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_content_created_at"
      ON "content" ("created_at")
    `);
    // Soft-delete queries always filter on deleted_at IS NULL
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_content_deleted_at"
      ON "content" ("deleted_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_content_deleted_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_content_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_content_scheduled_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_content_user_id_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_content_user_id"`);
    await queryRunner.query(`ALTER TABLE "content" DROP COLUMN IF EXISTS "deleted_at"`);
    await queryRunner.query(`ALTER TABLE "content" DROP COLUMN IF EXISTS "tags"`);
  }
}
