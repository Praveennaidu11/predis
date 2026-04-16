import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class CommonJwtAuthGuard extends AuthGuard('common-jwt') {}

