import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Indexes chosen to match our current TypeORM query patterns:
 * - per-user lists ordered by created_at desc
 * - per-user counts by status
 * - admin lists by status ordered by created_at desc
 * - audit log filters ordered by created_at desc
 *
 * Uses CONCURRENTLY for production-safe rollout.
 */
export class AddIndexes1712500000000 implements MigrationInterface {
  // Required for CREATE INDEX CONCURRENTLY (cannot run inside a transaction)
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // content
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_user_created_at ON content (user_id, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_user_status_created_at ON content (user_id, status, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_status_created_at ON content (status, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_brand_id ON content (brand_id)`,
    );

    // brands
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brands_user_created_at ON brands (user_id, created_at DESC)`,
    );

    // analytics
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_content_id ON analytics (content_id)`,
    );

    // prompt histories
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prompt_histories_user_created_at ON prompt_histories (user_id, created_at DESC)`,
    );

    // payments / transactions
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_user_created_at ON payments (user_id, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_user_created_at ON transactions (user_id, created_at DESC)`,
    );

    // social accounts
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_social_accounts_user_id ON social_accounts (user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_social_accounts_user_platform ON social_accounts (user_id, platform)`,
    );

    // generation jobs
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_generation_jobs_user_created_at ON generation_jobs (user_id, created_at DESC)`,
    );

    // admin settings
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_settings_category_key ON admin_settings (category, key)`,
    );

    // admin settings audit
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_settings_audit_created_at ON admin_settings_audit (created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_settings_audit_key_created_at ON admin_settings_audit (setting_key, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_settings_audit_actor_created_at ON admin_settings_audit (actor_user_id, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_settings_audit_action_created_at ON admin_settings_audit (action, created_at DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Note: drop concurrently for safety.
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_admin_settings_audit_action_created_at`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_admin_settings_audit_actor_created_at`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_admin_settings_audit_key_created_at`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_admin_settings_audit_created_at`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_admin_settings_category_key`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_generation_jobs_user_created_at`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_social_accounts_user_platform`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_social_accounts_user_id`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_transactions_user_created_at`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_payments_user_created_at`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_prompt_histories_user_created_at`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_analytics_content_id`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_brands_user_created_at`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_content_brand_id`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_content_status_created_at`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_content_user_status_created_at`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_content_user_created_at`);
  }
}

