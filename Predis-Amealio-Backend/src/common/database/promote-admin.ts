import { DataSource } from 'typeorm';
import { dataSourceOptions } from './data-source';
import { User } from '../entities/user.entity';

/**
 * One-off dev helper: set users.role = 'admin' for an existing email.
 * Usage (from backend folder): npm run promote-admin -- you@example.com
 *
 * In production, set ALLOW_ADMIN_PROMOTE=true or the script exits.
 */
async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('Usage: npm run promote-admin -- <email>');
    process.exit(1);
  }

  const nodeEnv = String(process.env.NODE_ENV || '').toLowerCase();
  if (nodeEnv === 'production' && process.env.ALLOW_ADMIN_PROMOTE !== 'true') {
    console.error(
      'Refusing to run in production without ALLOW_ADMIN_PROMOTE=true (intentionally dangerous).',
    );
    process.exit(1);
  }

  const dataSource = new DataSource(dataSourceOptions);
  await dataSource.initialize();
  try {
    const repo = dataSource.getRepository(User);
    const user = await repo.findOne({ where: { email } });
    if (!user) {
      console.error(`No user with email: ${email}`);
      process.exit(1);
    }
    user.role = 'admin';
    await repo.save(user);
    console.log(`OK — ${email} is now role=admin. Use the Admin tab on /login.`);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
