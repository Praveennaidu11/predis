import { Controller, Post, Get, Delete, Body, Param, Query, UseGuards, Request, Patch, Put, Res } from '@nestjs/common';
import { ContentService } from './content.service';
import { PromptHistoryService } from './prompt-history.service';
import { GenerateContentDto } from './dto/generate-content.dto';
import { SaveContentDto } from './dto/save-content.dto';
import { PromptSuggestionsDto } from './dto/prompt-suggestions.dto';
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

  @Post('prompt-suggestions')
  async promptSuggestions(@Request() req, @Body() dto: PromptSuggestionsDto) {
    return this.contentService.getPromptSuggestions(req.user.userId, dto);
  }

  @Get('dashboard')
  async getDashboard(@Request() req) {
    return this.contentService.getDashboardStats(req.user.userId);
  }

  @Get('content/list')
  async getContent(
    @Request() req,
    @Query('filter') filter?: string,
    @Query('trash') trash?: string,
  ) {
    const isTrash = trash === '1' || String(trash).toLowerCase() === 'true';
    return this.contentService.getContent(req.user.userId, filter, isTrash);
  }

  @Get('content/:id')
  async getContentById(@Request() req, @Param('id') id: string) {
    return this.contentService.getContentById(req.user.userId, id);
  }

  @Delete('content/:id')
  async deleteContent(@Request() req, @Param('id') id: string) {
    return this.contentService.deleteContent(req.user.userId, id);
  }

  @Post('content/:id/restore')
  async restoreContent(@Request() req, @Param('id') id: string) {
    return this.contentService.restoreContent(req.user.userId, id);
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
