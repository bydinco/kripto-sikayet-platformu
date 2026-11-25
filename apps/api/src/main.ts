import { config } from 'dotenv';
// Mirrors app.module.ts's ConfigModule envFilePath choice exactly. A plain
// `import 'dotenv/config'` here would always load `.env` (dev) regardless
// of NODE_ENV — dotenv never overrides an already-set var, so loading the
// wrong file first would make ConfigModule's own later `.env.test` load a
// no-op, silently pointing a real `NODE_ENV=test` run (e.g. the Playwright
// smoke suite's webServer) at the dev database instead.
config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { applyTrustProxy, resolveTrustProxyHops } from './trust-proxy.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  applyTrustProxy(app, resolveTrustProxyHops(process.env.TRUST_PROXY_HOPS));
  app.use(cookieParser());
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3002', credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const config = new DocumentBuilder()
    .setTitle('Kripto Şikayet ve Risk Platformu API')
    .setDescription('Şikayet, kanıt, risk skoru, moderasyon ve bildirim uç noktaları')
    .setVersion('0.0.1')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
