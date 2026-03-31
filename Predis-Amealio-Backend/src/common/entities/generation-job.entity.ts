import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export type GenerationJobStatus = 'queued' | 'processing' | 'done' | 'failed';

export type GenerationRecipe =
  | 'text_to_image'
  | 'image_to_image'
  | 'text_to_video'
  | 'first_last_prompt_to_video'
  | 'first_last_to_video'
  | 'ugc_create';

@Entity('generation_jobs')
export class GenerationJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', nullable: true })
  userId: string | null;

  @Column({ name: 'requested_role', nullable: true })
  requestedRole: string | null;

  @Column({ name: 'recipe', type: 'varchar' })
  recipe: GenerationRecipe;

  @Column({ name: 'status', default: 'queued' })
  status: GenerationJobStatus;

  @Column({ name: 'prompt', type: 'text', nullable: true })
  prompt: string | null;

  @Column({ name: 'provider', nullable: true })
  provider: string | null;

  @Column({ name: 'model', nullable: true })
  model: string | null;

  @Column({ name: 'platform', nullable: true })
  platform: string | null;

  @Column({ type: 'int', nullable: true })
  duration: number | null;

  @Column({ type: 'jsonb', nullable: true })
  input: any;

  @Column({ type: 'jsonb', nullable: true })
  output: any;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;
}

