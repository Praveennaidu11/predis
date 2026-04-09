import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Res,
  Header,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RecordAnalyticsDto } from './dto/record-analytics.dto';
import { HistoricalAnalyticsDto } from './dto/historical-analytics.dto';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  // Overview — includes platformBreakdown and topContent
  @Get('overview')
  getOverview(@Request() req) {
    return this.analyticsService.getOverview(req.user.userId);
  }

  // Platform breakdown (standalone, also embedded in overview)
  @Get('platform')
  getPlatformBreakdown(@Request() req) {
    return this.analyticsService.getPlatformBreakdown(req.user.userId);
  }

  // Top performing content
  @Get('top-content')
  getTopContent(@Request() req) {
    return this.analyticsService.getTopContent(req.user.userId);
  }

  // Historical time-series — GET /api/analytics/historical?from=YYYY-MM-DD&to=YYYY-MM-DD
  @Get('historical')
  getHistorical(@Request() req, @Query() query: HistoricalAnalyticsDto) {
    return this.analyticsService.getHistorical(req.user.userId, query);
  }

  // Per-content analytics — GET /api/analytics/content/:contentId
  @Get('content/:contentId')
  getContentAnalytics(@Request() req, @Param('contentId') contentId: string) {
    return this.analyticsService.getContentAnalytics(req.user.userId, contentId);
  }

  // Record / upsert analytics — POST /api/analytics/record
  @Post('record')
  recordAnalytics(@Request() req, @Body() dto: RecordAnalyticsDto) {
    return this.analyticsService.upsertAnalytics(req.user.userId, dto);
  }

  // CSV export — GET /api/analytics/export?from=YYYY-MM-DD&to=YYYY-MM-DD
  @Get('export')
  @Header('Content-Type', 'text/csv')
  async exportReport(
    @Request() req,
    @Query() query: HistoricalAnalyticsDto,
    @Res() res: Response,
  ) {
    const csv = await this.analyticsService.exportCSV(
      req.user.userId,
      query.from,
      query.to,
    );
    const filename = `analytics-${query.from}-to-${query.to}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  // Real-time SSE — GET /api/analytics/realtime
  @Get('realtime')
  @Sse()
  realtime(@Request() req): Observable<MessageEvent> {
    return this.analyticsService.getLiveOverview(req.user.userId);
  }
}
