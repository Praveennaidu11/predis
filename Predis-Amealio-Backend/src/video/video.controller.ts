import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VideoService } from './video.service';
import { CreateVideoDto } from './dto/create-video.dto';

@Controller('video')
@UseGuards(JwtAuthGuard)
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Post('generate')
  async generate(@Request() req, @Body() dto: CreateVideoDto) {
    return this.videoService.generateVideo(req.user.userId, dto);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.videoService.getVideo(id);
  }
}

