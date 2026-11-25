import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp } from './test-helpers.js';

// Security audit fix: every DTO in this API is small text fields, so a
// 100kb JSON body limit is generous headroom — anything bigger is
// rejected before it ever reaches a controller/DTO. File uploads go
// through multer (evidence files), which has its own, much larger
// MAX_FILE_SIZE_BYTES limit and never goes through this JSON parser.
describe('JSON body size limit (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('413s a JSON body over 100kb, before any DTO validation runs', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'x@example.com', password: 'x', padding: 'a'.repeat(200_000) })
      .expect(413);
  });

  it('accepts a normal-sized JSON body', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'nonexistent-user@example.com', password: 'wrongpassword' });
    // Not 413 — the request made it past the body parser and was
    // rejected (401) for ordinary reasons (no such user).
    expect(res.status).toBe(401);
  });
});
