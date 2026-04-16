import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Brand and SocialAccount entities use @DeleteDateColumn. TypeORM injects
 * `deleted_at IS NULL` into joins; if the DB never ran 171251 (or drifted),
 * list/dashboard queries that load `relations: ['brand']` fail with 42703.
 */
export class EnsureBrandsSocialDeletedAt1712830000000 implements MigrationInterface {
  name = 'EnsureBrandsSocialDeletedAt1712830000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "social_accounts" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "social_accounts" DROP COLUMN IF EXISTS "deleted_at"`);
    await queryRunner.query(`ALTER TABLE "brands" DROP COLUMN IF EXISTS "deleted_at"`);
  }
}
