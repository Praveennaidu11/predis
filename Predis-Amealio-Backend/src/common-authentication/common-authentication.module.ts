import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonAuthenticationController } from './common-authentication.controller';
import { CommonAuthenticationService } from './common-authentication.service';
import { User } from '../common/entities/user.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([User]),
  ],
  controllers: [CommonAuthenticationController],
  providers: [CommonAuthenticationService],
})
export class CommonAuthenticationModule {}

