import { Controller, Post, Get, Delete, Body, Param, Query, UseGuards, Request, Patch, Put, Res } from '@nestjs/common';
import { ContentService } from './content.service';
import { PromptHistoryService } from './prompt-history.service';
import { GenerateContentDto } from './dto/generate-content.dto';
import { SaveContentDto } from './dto/save-content.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GenerateImageDto } from './dto/generate-image.dto';
import { EditImageDto } from './dto/edit-image.dto';
import { UpdateContentDto } from './dto/update-content.dto';
import { ScheduleContentDto } from './dto/schedule-content.dto';
import { Response } from 'express';

@Controller('merchant')
@UseGuards(JwtAuthGuard)
export class ContentController {
  constructor(
    private contentService: ContentService,
    private historyService: PromptHistoryService,
  ) {}

  @Get('prompt-history')
  async getHistory(@Request() req) {
    return this.historyService.findAll(req.user.userId);
  }

  @Delete('prompt-history')
  async clearHistory(@Request() req) {
    return this.historyService.clear(req.user.userId);
  }

  @Post('generate')
  async generate(@Request() req, @Body() dto: GenerateContentDto) {
    return this.contentService.generateContent(req.user.userId, dto);
  }

  @Post('image/generate')
  async generateImage(@Request() req, @Body() dto: GenerateImageDto) {
    return this.contentService.generateImage(req.user.userId, dto);
  }

  @Post('image/edit')
  async editImage(@Request() req, @Body() dto: EditImageDto) {
    return this.contentService.editImage(req.user.userId, dto);
  }

  @Post('save')
  async save(@Request() req, @Body() dto: SaveContentDto) {
    return this.contentService.saveContent(req.user.userId, dto);
  }

  @Patch('content/:id')
  async updateContent(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateContentDto,
  ) {
    return this.contentService.updateContent(req.user.userId, id, dto);
  }

  @Get('image/download')
  async downloadImage(
    @Query('url') url: string,
    @Res() res: Response,
  ) {
    const result = await this.contentService.downloadImage(url);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(result.buffer);
  }

  @Get('dashboard')
  async getDashboard(@Request() req) {
    return this.contentService.getDashboardStats(req.user.userId);
  }

  // GET /api/merchant/content?filter=draft&q=food&tag=promo&page=1&limit=20
  @Get('content')
  async getContent(
    @Request() req,
    @Query('filter') filter?: string,
    @Query('q') q?: string,
    @Query('tag') tag?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.contentService.getContent(req.user.userId, {
      filter,
      q,
      tag,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  // Alias kept for backward compat with calendar page (returns scheduled items, page 1 limit 100)
  @Get('content/scheduled')
  async getScheduledContent(@Request() req) {
    return this.contentService.getContent(req.user.userId, {
      filter: 'scheduled',
      limit: 100,
    });
  }

  @Get('content/:id')
  async getContentById(@Request() req, @Param('id') id: string) {
    return this.contentService.getContentById(req.user.userId, id);
  }

  @Delete('content/:id')
  async deleteContent(@Request() req, @Param('id') id: string) {
    return this.contentService.deleteContent(req.user.userId, id);
  }

  @Post('content/:id/schedule')
  async scheduleContent(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: ScheduleContentDto,
  ) {
    return this.contentService.scheduleContent(req.user.userId, id, dto.scheduledAt);
  }

  @Put('content/:id/schedule')
  async rescheduleContent(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: ScheduleContentDto,
  ) {
    return this.contentService.scheduleContent(req.user.userId, id, dto.scheduledAt);
  }

  @Delete('content/:id/schedule')
  async cancelSchedule(@Request() req, @Param('id') id: string) {
    return this.contentService.cancelSchedule(req.user.userId, id);
  }
}
