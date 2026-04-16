import { Entity, Column, PrimaryGeneratedColumn, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'notification_id' })
  notificationId: string;

  @Column({ name: 'flow_id', nullable: true })
  flowId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

