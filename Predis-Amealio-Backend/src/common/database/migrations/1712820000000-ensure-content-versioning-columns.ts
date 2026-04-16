import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Some environments have `migrations` rows marked executed while schema drifted.
 * This migration is idempotent and ensures the Content entity columns exist.
 */
export class EnsureContentVersioningColumns1712820000000 implements MigrationInterface {
  name = 'EnsureContentVersioningColumns1712820000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "content"
        ADD COLUMN IF NOT EXISTS "source_content_id" uuid NULL,
        ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "tags" text,
        ADD COLUMN IF NOT EXISTS "deleted_at" timestamp NULL
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_content_source_content_id'
        ) THEN
          ALTER TABLE "content"
          ADD CONSTRAINT "FK_content_source_content_id"
          FOREIGN KEY ("source_content_id")
          REFERENCES "content"("id")
          ON DELETE SET NULL;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "content" DROP CONSTRAINT IF EXISTS "FK_content_source_content_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "content"
        DROP COLUMN IF EXISTS "deleted_at",
        DROP COLUMN IF EXISTS "tags",
        DROP COLUMN IF EXISTS "version",
        DROP COLUMN IF EXISTS "source_content_id"
    `);
  }
}

