import { MigrationInterface, QueryRunner } from 'typeorm';

export class SoftDeleteColumns1712510000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add deleted_at columns for soft delete support
    await queryRunner.query(`ALTER TABLE brands ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL`);
    await queryRunner.query(`ALTER TABLE content ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL`);
    await queryRunner.query(
      `ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL`,
    );

    // Helpful indexes for typical reads (exclude deleted rows in WHERE clause)
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brands_user_deleted_created_at ON brands (user_id, deleted_at, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_user_deleted_created_at ON content (user_id, deleted_at, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_social_accounts_user_deleted_created_at ON social_accounts (user_id, deleted_at, created_at DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS idx_social_accounts_user_deleted_created_at`,
    );
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_content_user_deleted_created_at`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_brands_user_deleted_created_at`);

    await queryRunner.query(`ALTER TABLE social_accounts DROP COLUMN IF EXISTS deleted_at`);
    await queryRunner.query(`ALTER TABLE content DROP COLUMN IF EXISTS deleted_at`);
    await queryRunner.query(`ALTER TABLE brands DROP COLUMN IF EXISTS deleted_at`);
  }
}

