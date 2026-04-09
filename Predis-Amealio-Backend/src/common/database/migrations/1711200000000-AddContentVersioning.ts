import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContentVersioning1711200000000 implements MigrationInterface {
  name = 'AddContentVersioning1711200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "content"
      ADD COLUMN IF NOT EXISTS "source_content_id" uuid NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "content"
      ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1
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
      ALTER TABLE "content" DROP COLUMN IF EXISTS "version"
    `);
    await queryRunner.query(`
      ALTER TABLE "content" DROP COLUMN IF EXISTS "source_content_id"
    `);
  }
}
