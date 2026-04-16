import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserMobile1712700000000 implements MigrationInterface {
  name = 'AddUserMobile1712700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add nullable mobile column (unique) for phone-based login.
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "mobile" character varying
    `);

    // Add a unique index (Postgres allows multiple NULLs in UNIQUE index).
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname = 'IDX_users_mobile_unique'
        ) THEN
          CREATE UNIQUE INDEX "IDX_users_mobile_unique" ON "users" ("mobile");
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_mobile_unique"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "mobile"`);
  }
}

