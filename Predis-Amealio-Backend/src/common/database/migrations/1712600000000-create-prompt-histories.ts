import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePromptHistories1712600000000 implements MigrationInterface {
  name = 'CreatePromptHistories1712600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ensure uuid extension exists (safe if already present)
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "prompt_histories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "prompt" text NOT NULL,
        "platform" character varying NOT NULL,
        "recipe" character varying NOT NULL,
        "user_id" uuid NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_prompt_histories_id" PRIMARY KEY ("id")
      )
    `);

    // FK to users.id (uuid)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_prompt_histories_user_id'
        ) THEN
          ALTER TABLE "prompt_histories"
            ADD CONSTRAINT "FK_prompt_histories_user_id"
            FOREIGN KEY ("user_id")
            REFERENCES "users"("id")
            ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_prompt_histories_user_created_at"
      ON "prompt_histories" ("user_id", "created_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_prompt_histories_user_created_at"`);
    await queryRunner.query(
      `ALTER TABLE "prompt_histories" DROP CONSTRAINT IF EXISTS "FK_prompt_histories_user_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "prompt_histories"`);
  }
}

