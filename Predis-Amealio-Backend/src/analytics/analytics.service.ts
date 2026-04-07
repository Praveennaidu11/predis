import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Analytics } from '../common/entities/analytics.entity';
import { Content } from '../common/entities/content.entity';
import { RedisService } from '../common/redis.service';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Analytics)
    private analyticsRepository: Repository<Analytics>,
    @InjectRepository(Content)
    private contentRepository: Repository<Content>,
    private redis: RedisService,
  ) {}

  async getOverview(userId: string) {
    // Check cache first
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
}
