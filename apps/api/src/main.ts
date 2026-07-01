import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: true });

  // Ürün görseli data URL olarak gelebilir → body limitini yükselt (varsayılan 100kb).
  app.useBodyParser('json', { limit: '8mb' });
  app.useBodyParser('urlencoded', { limit: '8mb', extended: true });

  // Tüm /intel/* uçları /api/v1 altında (Teknik doküman Bölüm 5.1).
  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Tarayıcıdan tıklanabilir API konsolu: http://localhost:<port>/api/docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('KabzıMall Intelligence API')
    .setDescription(
      'Fiyat zekâsı backend. Tüm para alanları **kuruş** (3490 = 34,90 ₺). ' +
        'Taban yol /api/v1. Uçları "Try it out" ile deneyebilirsiniz.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  Logger.log(`KabzıMall Intelligence API: http://localhost:${port}/api/v1`, 'Bootstrap');
  Logger.log(`API konsolu (Swagger): http://localhost:${port}/api/docs`, 'Bootstrap');
}

bootstrap();
