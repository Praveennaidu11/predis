import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Index,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('otp_sessions')
@Index(['userId', 'status'])
@Index(['mobile', 'countryCode', 'status'])
export class OtpSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  @Column({ name: 'mobile', nullable: false })
  mobile: string;

  @Column({ name: 'country_code', nullable: true })
  countryCode: string | null;

  @Column({ name: 'status', default: 'pending' })
  status: 'pending' | 'verified' | 'expired';

  @Column({ name: 'otp_hash', nullable: true })
  otpHash: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: false })
  expiresAt: Date;

  @Column({ name: 'verify_attempts', type: 'int', default: 0 })
  verifyAttempts: number;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @Column({ name: 'last_sent_at', type: 'timestamptz', nullable: true })
  lastSentAt: Date | null;

  @Column({ name: 'device_info', type: 'jsonb', nullable: true })
  deviceInfo: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

