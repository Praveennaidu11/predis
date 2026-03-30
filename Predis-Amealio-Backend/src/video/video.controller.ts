import { Controller, Post, Body, UseGuards, Request, Get, Param, HttpException, HttpStatus } from '@nestjs/common';
import { VideoService } from './video.service';
import { CreateVideoDto } from './dto/create-video.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('video')
@UseGuards(JwtAuthGuard)
export class VideoController {
  constructor(private videoService: VideoService) {}

  @Post('generate')
  async generateVideo(@Request() req, @Body() dto: CreateVideoDto) {
    try {
      return await this.videoService.generateVideo(req.user.userId, dto);
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Video generation failed',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get(':id')
  async getVideo(@Request() req, @Param('id') id: string) {
    const video = await this.videoService.getVideo(id);
    if (!video) {
      throw new HttpException('Video not found', HttpStatus.NOT_FOUND);
    }
    return video;
  }
}
