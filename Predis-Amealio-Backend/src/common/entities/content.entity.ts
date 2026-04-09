import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { Brand } from './brand.entity';
import { Analytics } from './analytics.entity';

@Entity('content')
@Index('IDX_content_user_id', ['userId'])
@Index('IDX_content_user_id_status', ['userId', 'status'])
@Index('IDX_content_scheduled_at', ['scheduledAt'])
@Index('IDX_content_created_at', ['createdAt'])
export class Content {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'brand_id', nullable: true })
  brandId: string;

  @Column()
  type: string;

  @Column({ nullable: true })
  prompt: string;

  @Column({ name: 'generated_text', nullable: true, type: 'text' })
  generatedText: string;

  @Column({ name: 'generated_image', nullable: true, type: 'text' })
  generatedImage: string;

  @Column({ name: 'generated_video', nullable: true, type: 'text' })
  generatedVideo: string;

  @Column({ default: 'draft' })
  status: string;

  @Column({ nullable: true })
  platform: string;

  @Column({ name: 'scheduled_at', nullable: true, type: 'timestamp' })
  scheduledAt: Date;

  @Column({ name: 'published_at', nullable: true, type: 'timestamp' })
  publishedAt: Date;

  @Column({ name: 'source_content_id', nullable: true })
  sourceContentId: string;

  @Column({ default: 1 })
  version: number;

  // Comma-separated tag storage (simple-array) — e.g. "promo,festival,food"
  @Column({ type: 'simple-array', nullable: true })
  tags: string[];

  @Column({ type: 'jsonb', nullable: true })
  metadata: any;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Soft-delete: records are flagged instead of physically removed
  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date;

  @ManyToOne(() => User, (user) => user.content, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Brand, (brand) => brand.content, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'brand_id' })
  brand: Brand;

  @OneToMany(() => Analytics, (analytics) => analytics.content)
  analytics: Analytics[];
}
