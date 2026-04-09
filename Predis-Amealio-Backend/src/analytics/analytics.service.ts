import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable, interval } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';
import { from } from 'rxjs';
import { Analytics } from '../common/entities/analytics.entity';
import { Content } from '../common/entities/content.entity';
import { RedisService } from '../common/redis.service';
import { RecordAnalyticsDto } from './dto/record-analytics.dto';
import { HistoricalAnalyticsDto } from './dto/historical-analytics.dto';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sumField(arr: Analytics[], field: keyof Analytics): number {
  return arr.reduce((s, a) => s + (Number(a[field]) || 0), 0);
}

function calcGrowth(current: number, previous: number): number {
  if (previous === 0) return 0;
  return +((((current - previous) / previous) * 100).toFixed(1));
}

function calcEngagement(views: number, likes: number, shares: number, comments: number): number {
  if (views === 0) return 0;
  return +(((likes + shares + comments) / views) * 100).toFixed(2);
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Analytics)
    private analyticsRepository: Repository<Analytics>,
    @InjectRepository(Content)
    private contentRepository: Repository<Content>,
    private redis: RedisService,
  ) {}

  // ─── Overview (includes platformBreakdown + topContent) ───────────────────

  async getOverview(userId: string) {
    const cacheKey = `analytics:overview:${userId}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    // Aggregate in SQL to avoid loading rows into Node.
    const totals = await this.analyticsRepository
      .createQueryBuilder('a')
      .innerJoin('a.content', 'c')
      .where('c.userId = :userId', { userId })
      .select('COALESCE(SUM(a.views), 0)', 'totalViews')
      .addSelect('COALESCE(SUM(a.likes), 0)', 'totalLikes')
      .addSelect('COALESCE(SUM(a.shares), 0)', 'totalShares')
      .addSelect('COALESCE(SUM(a.comments), 0)', 'totalComments')
      .getRawOne<{
        totalViews: string;
        totalLikes: string;
        totalShares: string;
        totalComments: string;
      }>();

    const overview = {
      totalViews: parseInt(totals?.totalViews || '0', 10),
      totalLikes: parseInt(totals?.totalLikes || '0', 10),
      totalShares: parseInt(totals?.totalShares || '0', 10),
      totalComments: parseInt(totals?.totalComments || '0', 10),
      engagementRate: 8.5, // placeholder (product logic TBD)
      viewsGrowth: 15.3, // placeholder
      likesGrowth: 12.7, // placeholder
      sharesGrowth: 8.4, // placeholder
    };

    // Cache for 5 minutes
    await this.redis.set(cacheKey, JSON.stringify(overview), 300);
    return overview;
  }

  // ─── Platform Breakdown ───────────────────────────────────────────────────

  async getPlatformBreakdown(userId: string) {
    // Aggregate in SQL (group by platform) to avoid N+1/large relation loads.
    const rows = await this.analyticsRepository
      .createQueryBuilder('a')
      .innerJoin('a.content', 'c')
      .where('c.userId = :userId', { userId })
      .andWhere('c.platform IS NOT NULL')
      .select('c.platform', 'platform')
      .addSelect('COALESCE(SUM(a.views), 0)', 'views')
      .addSelect('COALESCE(SUM(a.likes), 0)', 'likes')
      .addSelect('COALESCE(SUM(a.shares), 0)', 'shares')
      .groupBy('c.platform')
      .orderBy('views', 'DESC')
      .getRawMany<{
        platform: string;
        views: string;
        likes: string;
        shares: string;
      }>();

    return rows.map((r) => ({
      platform: r.platform,
      views: parseInt(r.views || '0', 10),
      likes: parseInt(r.likes || '0', 10),
      shares: parseInt(r.shares || '0', 10),
      engagement: 0, // placeholder (product logic TBD)
    }));
  }

  // ─── Top Content ─────────────────────────────────────────────────────────

  async getTopContent(userId: string, limit = 5) {
    const content = await this.contentRepository.find({
      where: { userId },
      relations: ['analytics'],
    });

    return content
      .map((c) => {
        const views = c.analytics.reduce((s, a) => s + a.views, 0);
        const likes = c.analytics.reduce((s, a) => s + a.likes, 0);
        const shares = c.analytics.reduce((s, a) => s + a.shares, 0);
        const comments = c.analytics.reduce((s, a) => s + a.comments, 0);
        return {
          id: c.id,
          title:
            (c.generatedText || '').substring(0, 80).trim() ||
            c.type ||
            'Untitled',
          platform: c.platform || null,
          views,
          likes,
          shares,
          comments,
          engagement: calcEngagement(views, likes, shares, comments),
        };
      })
      .filter((c) => c.views > 0 || c.likes > 0)
      .sort((a, b) => b.views - a.views || b.engagement - a.engagement)
      .slice(0, limit);
  }

  // ─── Historical Analytics ─────────────────────────────────────────────────

  async getHistorical(userId: string, dto: HistoricalAnalyticsDto) {
    const cacheKey = `analytics:historical:${userId}:${dto.from}:${dto.to}:${dto.platform || 'all'}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const qb = this.analyticsRepository
      .createQueryBuilder('a')
      .leftJoin('a.content', 'c')
      .select('DATE(a.recorded_at)', 'date')
      .addSelect('SUM(a.views)', 'views')
      .addSelect('SUM(a.likes)', 'likes')
      .addSelect('SUM(a.shares)', 'shares')
      .addSelect('SUM(a.comments)', 'comments')
      .where('c.userId = :userId', { userId })
      .andWhere('a.recordedAt BETWEEN :from AND :to', {
        from: dto.from,
        to: dto.to + ' 23:59:59',
      })
      .groupBy('DATE(a.recorded_at)')
      .orderBy('date', 'ASC');

    if (dto.platform) {
      qb.andWhere('c.platform = :platform', { platform: dto.platform });
    }

    const result = await qb.getRawMany();
    await this.redis.set(cacheKey, JSON.stringify(result), 600);
    return result;
  }

  // ─── Per-Content Analytics ────────────────────────────────────────────────

  async getContentAnalytics(userId: string, contentId: string) {
    const content = await this.contentRepository.findOne({
      where: { id: contentId, userId },
      relations: ['analytics'],
    });

    if (!content) throw new NotFoundException('Content not found');

    return {
      contentId,
      platform: content.platform,
      analytics: content.analytics.map((a) => ({
        date: a.recordedAt,
        views: a.views,
        likes: a.likes,
        shares: a.shares,
        comments: a.comments,
        engagementRate: calcEngagement(a.views, a.likes, a.shares, a.comments),
      })),
    };
  }

  // ─── Upsert Analytics Record ──────────────────────────────────────────────

  async upsertAnalytics(userId: string, dto: RecordAnalyticsDto) {
    const content = await this.contentRepository.findOne({
      where: { id: dto.contentId, userId },
    });

    if (!content) throw new NotFoundException('Content not found');

    const existing = await this.analyticsRepository.findOne({
      where: { contentId: dto.contentId },
    });

    if (existing) {
      await this.analyticsRepository.update(existing.id, {
        views: dto.views ?? existing.views,
        likes: dto.likes ?? existing.likes,
        shares: dto.shares ?? existing.shares,
        comments: dto.comments ?? existing.comments,
      });
    } else {
      await this.analyticsRepository.save(
        this.analyticsRepository.create({
          contentId: dto.contentId,
          views: dto.views ?? 0,
          likes: dto.likes ?? 0,
          shares: dto.shares ?? 0,
          comments: dto.comments ?? 0,
        }),
      );
    }

    // Invalidate overview cache so next fetch reflects fresh data
    await this.redis.del(`analytics:overview:${userId}`);
    return { success: true };
  }

  // ─── Create initial analytics row (called after publish) ─────────────────

  async ensureAnalyticsRow(contentId: string) {
    const existing = await this.analyticsRepository.findOne({
      where: { contentId },
    });
    if (!existing) {
      await this.analyticsRepository.save(
        this.analyticsRepository.create({
          contentId,
          views: 0,
          likes: 0,
          shares: 0,
          comments: 0,
        }),
      );
    }
  }

  // ─── CSV Export ───────────────────────────────────────────────────────────

  async exportCSV(userId: string, from: string, to: string): Promise<string> {
    const rows = await this.getHistorical(userId, { from, to });

    const headers = ['Date', 'Views', 'Likes', 'Shares', 'Comments'];
    const lines = [
      headers.join(','),
      ...rows.map((r: any) =>
        [r.date, r.views, r.likes, r.shares, r.comments].join(','),
      ),
    ];

    return lines.join('\n');
  }

  // ─── Real-time SSE stream ─────────────────────────────────────────────────

  getLiveOverview(userId: string): Observable<MessageEvent> {
    // Push a fresh overview every 30 seconds
    return interval(30_000).pipe(
      switchMap(() => from(this.getOverview(userId))),
      map(
        (data) =>
          ({ data: JSON.stringify(data) }) as MessageEvent,
      ),
    );
  }
}
