import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonAuthenticationController } from './common-authentication.controller';
import { CommonAuthenticationService } from './common-authentication.service';

@Module({
  imports: [
    ConfigModule,
  ],
  controllers: [CommonAuthenticationController],
  providers: [CommonAuthenticationService],
})
export class CommonAuthenticationModule {}

