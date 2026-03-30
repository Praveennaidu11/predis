import { Module } from '@nestjs/common';
import { SocialService } from './_social.service';
import { SocialController } from './_social.controller';

@Module({
  controllers: [SocialController],
  providers: [SocialService],
})
export class SocialModule {}
