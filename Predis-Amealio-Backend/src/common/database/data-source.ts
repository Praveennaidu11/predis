import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';
import { User } from '../entities/user.entity';
import { Brand } from '../entities/brand.entity';
import { Content } from '../entities/content.entity';
import { SocialAccount } from '../entities/social-account.entity';
import { Analytics } from '../entities/analytics.entity';
import { AdminSettings } from '../entities/admin-settings.entity';
import { Transaction } from '../entities/transaction.entity';
import { Payment } from '../entities/payment.entity';
import { AddContentVersioning1711200000000 } from './migrations/1711200000000-AddContentVersioning';
import { AddTagsSoftDeleteIndexes1711200000001 } from './migrations/1711200000001-AddTagsSoftDeleteIndexes';

config();

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'amealio_db',
  entities: [User, Brand, Content, SocialAccount, Analytics, AdminSettings, Transaction, Payment],
  migrations: [AddContentVersioning1711200000000, AddTagsSoftDeleteIndexes1711200000001],
  synchronize: true,
  logging: process.env.NODE_ENV === 'development',
};

const dataSource = new DataSource(dataSourceOptions);

export default dataSource;
