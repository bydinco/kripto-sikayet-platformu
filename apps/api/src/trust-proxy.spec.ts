import { Controller, Get, Module, Req } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request } from 'express';
import request from 'supertest';
import { applyTrustProxy, resolveTrustProxyHops } from './trust-proxy.js';

describe('resolveTrustProxyHops', () => {
  it.each([
    [undefined, 0],
    ['0', 0],
    ['1', 1],
    ['2', 2],
    ['-1', 0],
    ['', 0],
    ['abc', 0],
  ])('resolves %p -> %i', (raw, expected) => {
    expect(resolveTrustProxyHops(raw)).toBe(expected);
  });
});

@Controller()
class ProbeController {
  @Get('ip')
  getIp(@Req() req: Request) {
    return { ip: req.ip };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('applyTrustProxy (integration)', () => {
  async function bootProbe(hops: number) {
    const app = await NestFactory.create<NestExpressApplication>(ProbeModule, { logger: false });
    applyTrustProxy(app, hops);
    await app.init();
    return app;
  }

  it('hops=0 (default): req.ip is the real socket address, X-Forwarded-For is ignored', async () => {
    const app = await bootProbe(0);
    try {
      const res = await request(app.getHttpServer()).get('/ip').set('X-Forwarded-For', '203.0.113.5');
      expect(res.body.ip).not.toBe('203.0.113.5');
    } finally {
      await app.close();
    }
  });

  it('hops=1: req.ip is read from X-Forwarded-For (single reverse proxy)', async () => {
    const app = await bootProbe(1);
    try {
      const res = await request(app.getHttpServer()).get('/ip').set('X-Forwarded-For', '203.0.113.5');
      expect(res.body.ip).toBe('203.0.113.5');
    } finally {
      await app.close();
    }
  });
});
