import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type AdminSettingsAuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'upsert';

@Entity('admin_settings_audit')
export class AdminSettingsAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'setting_id', nullable: true })
  settingId: string | null;

  @Column({ name: 'setting_key' })
  settingKey: string;

  @Column({ type: 'varchar' })
  action: AdminSettingsAuditAction;

  @Column({ name: 'actor_user_id', nullable: true })
  actorUserId: string | null;

  @Column({ name: 'actor_email', nullable: true })
  actorEmail: string | null;

  @Column({ name: 'old_value', type: 'text', nullable: true })
  oldValue: string | null;

  @Column({ name: 'new_value', type: 'text', nullable: true })
  newValue: string | null;

  @Column({ name: 'old_value_redacted', default: false })
  oldValueRedacted: boolean;

  @Column({ name: 'new_value_redacted', default: false })
  newValueRedacted: boolean;

  @Column({ name: 'was_encrypted', default: false })
  wasEncrypted: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

