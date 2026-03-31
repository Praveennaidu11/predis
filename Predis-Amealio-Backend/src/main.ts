import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json } from 'express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  app.use(json({ limit: '50mb' }));

  // Global prefix
  app.setGlobalPrefix('api');

  // Serve static files from temp directory with CORS and Range support
  app.useStaticAssets(join(process.cwd(), 'temp'), {
    prefix: '/temp',
    setHeaders: (res) => {
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Accept-Ranges', 'bytes');
    },
  });

  // Enable CORS
  app.enableCors({
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5000').split(','),
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = process.env.PORT || 8001;
  await app.listen(port, '0.0.0.0');
  
  console.log(`🚀 Amealio Backend running on http://localhost:${port}/api`);
}

bootstrap();
