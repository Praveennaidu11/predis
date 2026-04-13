import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { dataSourceOptions } from './data-source';
import { User } from '../entities/user.entity';

async function seed() {
  const dataSource = new DataSource(dataSourceOptions);
  
  try {
    await dataSource.initialize();
    console.log('✅ Database connection established');

    const userRepository = dataSource.getRepository(User);

    // Create each demo user only if missing (older seeds exited early when merchant existed,
    // so many DBs never got admin@amealio.com — admin login then always failed).
    const existingMerchant = await userRepository.findOne({
      where: { email: 'merchant@amealio.com' },
    });
    if (!existingMerchant) {
      const merchantPassword = await bcrypt.hash('merchant123', 10);
      const merchant = userRepository.create({
        email: 'merchant@amealio.com',
        passwordHash: merchantPassword,
        fullName: 'Demo Merchant',
        companyName: 'Amealio Inc',
        role: 'merchant',
        subscriptionTier: 'pro',
        credits: 500,
      });
      await userRepository.save(merchant);
    }

    const existingAdmin = await userRepository.findOne({
      where: { email: 'admin@amealio.com' },
    });
    if (!existingAdmin) {
      const adminPassword = await bcrypt.hash('admin123', 10);
      const admin = userRepository.create({
        email: 'admin@amealio.com',
        passwordHash: adminPassword,
        fullName: 'Admin User',
        role: 'admin',
        subscriptionTier: 'enterprise',
        credits: 1000,
      });
      await userRepository.save(admin);
    }

    // console.log('\n🎉 Database seeded successfully!');
    // console.log('\nDemo Credentials:');
    // console.log('Merchant: merchant@amealio.com / merchant123');
    // console.log('Admin: admin@amealio.com / admin123');

    await dataSource.destroy();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    await dataSource.destroy();
    process.exit(1);
  }
}

seed();
