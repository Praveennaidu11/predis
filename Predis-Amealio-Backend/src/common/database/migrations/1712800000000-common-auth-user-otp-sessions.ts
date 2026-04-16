import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommonAuthUserOtpSessions1712800000000 implements MigrationInterface {
  name = 'CommonAuthUserOtpSessions1712800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "country_code" character varying,
        ADD COLUMN IF NOT EXISTS "first_name" character varying,
        ADD COLUMN IF NOT EXISTS "last_name" character varying,
        ADD COLUMN IF NOT EXISTS "user_verified" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "device_info" jsonb
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "otp_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid,
        "mobile" character varying NOT NULL,
        "country_code" character varying,
        "status" character varying NOT NULL DEFAULT 'pending',
        "otp_hash" character varying,
        "expires_at" timestamptz NOT NULL,
        "verify_attempts" integer NOT NULL DEFAULT 0,
        "locked_until" timestamptz,
        "last_sent_at" timestamptz,
        "device_info" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_otp_sessions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_otp_sessions_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "notification_id" character varying NOT NULL,
        "flow_id" character varying,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_notifications_notification_id" ON "notifications" ("notification_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_otp_sessions_user_status" ON "otp_sessions" ("user_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_otp_sessions_mobile_cc_status" ON "otp_sessions" ("mobile", "country_code", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_notifications_notification_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_otp_sessions_mobile_cc_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_otp_sessions_user_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "otp_sessions"`);

    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "device_info",
        DROP COLUMN IF EXISTS "user_verified",
        DROP COLUMN IF EXISTS "last_name",
        DROP COLUMN IF EXISTS "first_name",
        DROP COLUMN IF EXISTS "country_code"
    `);
  }
}

