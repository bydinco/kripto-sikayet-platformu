import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import request from 'supertest';
import { buildHelmetOptions } from './security-headers.js';

@Controller()
class PingController {
  @Get('ping')
  ping() {
    return { ok: true };
  }
}

@Module({ controllers: [PingController] })
class PingModule {}

async function bootWithHelmet(nodeEnv: string | undefined, swaggerEnabled: boolean) {
  const app = await NestFactory.create(PingModule, { logger: false });
  app.use(helmet(buildHelmetOptions(nodeEnv, swaggerEnabled)));
  await app.init();
  return app;
}

describe('buildHelmetOptions / helmet wiring (integration)', () => {
  it('sets Cross-Origin-Resource-Policy: cross-origin (evidence images load cross-origin from the web app)', async () => {
    const app = await bootWithHelmet('development', false);
    try {
      const res = await request(app.getHttpServer()).get('/ping');
      expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    } finally {
      await app.close();
    }
  });

  it('sends no Content-Security-Policy header when Swagger is enabled', async () => {
    const app = await bootWithHelmet('development', true);
    try {
      const res = await request(app.getHttpServer()).get('/ping');
      expect(res.headers['content-security-policy']).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it('sends a default Content-Security-Policy header when Swagger is disabled', async () => {
    const app = await bootWithHelmet('production', false);
    try {
      const res = await request(app.getHttpServer()).get('/ping');
      expect(res.headers['content-security-policy']).toBeDefined();
    } finally {
      await app.close();
    }
  });

  it('sends no Strict-Transport-Security header outside production', async () => {
    const app = await bootWithHelmet('development', false);
    try {
      const res = await request(app.getHttpServer()).get('/ping');
      expect(res.headers['strict-transport-security']).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it('sends a Strict-Transport-Security header in production', async () => {
    const app = await bootWithHelmet('production', false);
    try {
      const res = await request(app.getHttpServer()).get('/ping');
      expect(res.headers['strict-transport-security']).toBeDefined();
    } finally {
      await app.close();
    }
  });
});
