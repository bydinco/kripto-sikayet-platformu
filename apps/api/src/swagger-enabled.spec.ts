import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { isSwaggerEnabled } from './swagger-enabled.js';

describe('isSwaggerEnabled', () => {
  it.each([
    ['development', undefined, true],
    ['test', undefined, true],
    [undefined, undefined, true],
    ['production', undefined, false],
    ['production', 'false', false],
    ['production', 'true', true],
  ] as const)('NODE_ENV=%s SWAGGER_ENABLED=%s -> %s', (nodeEnv, flag, expected) => {
    expect(isSwaggerEnabled(nodeEnv, flag)).toBe(expected);
  });
});

@Controller()
class EmptyController {
  @Get('ping')
  ping() {
    return { ok: true };
  }
}

@Module({ controllers: [EmptyController] })
class EmptyModule {}

async function bootWithSwagger(enabled: boolean) {
  const app = await NestFactory.create(EmptyModule, { logger: false });
  if (enabled) {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    SwaggerModule.setup('api/docs', app, document);
  }
  await app.init();
  return app;
}

describe('Swagger gating (integration, mirrors main.ts)', () => {
  it('serves /api/docs when enabled', async () => {
    const app = await bootWithSwagger(true);
    try {
      await request(app.getHttpServer()).get('/api/docs').expect(200);
    } finally {
      await app.close();
    }
  });

  it('404s /api/docs when disabled (e.g. production without SWAGGER_ENABLED)', async () => {
    const app = await bootWithSwagger(false);
    try {
      await request(app.getHttpServer()).get('/api/docs').expect(404);
    } finally {
      await app.close();
    }
  });
});
