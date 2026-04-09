import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Content } from '../common/entities/content.entity';
import { SocialService } from '../social/social.service';

@Injectable()
export class ContentSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContentSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly pollMs: number;
  private readonly batchSize: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(
    @InjectRepository(Content)
    private readonly contentRepository: Repository<Content>,
    private readonly socialService: SocialService,
    private readonly configService: ConfigService,
  ) {
    this.pollMs = Number(this.configService.get('SCHEDULER_POLL_MS') || 30000);
    this.batchSize = Number(this.configService.get('SCHEDULER_BATCH_SIZE') || 10);
    this.maxRetries = Number(this.configService.get('SCHEDULER_MAX_RETRIES') || 5);
    this.retryDelayMs = Number(this.configService.get('SCHEDULER_RETRY_DELAY_MS') || 60000);
  }

  onModuleInit() {
    this.logger.log(
      `Content scheduler started (poll=${this.pollMs}ms, batch=${this.batchSize})`,
    );
    this.timer = setInterval(() => {
      this.processDueScheduledContent().catch((error) => {
        this.logger.error(`Scheduler loop failed: ${error?.message || 'Unknown error'}`);
      });
    }, this.pollMs);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async processDueScheduledContent() {
    const now = new Date();
    const dueItems = await this.contentRepository.find({
      where: {
        status: 'scheduled',
        scheduledAt: LessThanOrEqual(now),
      },
      order: { scheduledAt: 'ASC' },
      take: this.batchSize,
    });

    if (dueItems.length === 0) {
      return;
    }

    for (const item of dueItems) {
      const claim = await this.contentRepository.update(
        { id: item.id, status: 'scheduled' },
        { status: 'publishing' },
      );

      if (!claim.affected) {
        continue;
      }

      try {
        await this.socialService.autoPublishScheduledContent(item.id);
      } catch (error: any) {
        await this.handlePublishFailure(item.id, error);
      }
    }
  }

  private async handlePublishFailure(contentId: string, error: any) {
    const content = await this.contentRepository.findOne({ where: { id: contentId } });
    if (!content) return;

    const retries = Number(content.metadata?.scheduler?.retries || 0) + 1;
    const shouldFail = retries >= this.maxRetries;
    const nextSchedule = new Date(Date.now() + this.retryDelayMs);

    const schedulerMeta = {
      retries,
      lastError: String(error?.message || 'Unknown scheduler publish error'),
      lastAttemptAt: new Date().toISOString(),
      nextRetryAt: shouldFail ? null : nextSchedule.toISOString(),
    };

    await this.contentRepository.update(
      { id: contentId },
      {
        status: shouldFail ? 'failed' : 'scheduled',
        scheduledAt: shouldFail ? content.scheduledAt : nextSchedule,
        metadata: {
          ...(content.metadata || {}),
          scheduler: schedulerMeta,
        },
      },
    );

    this.logger.error(
      `Auto publish failed for content ${contentId}; retry=${retries}/${this.maxRetries}; status=${shouldFail ? 'failed' : 'scheduled'}`,
    );
  }
}
