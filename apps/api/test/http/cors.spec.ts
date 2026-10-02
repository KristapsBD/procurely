import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp } from './harness';

describe('CORS for the browser (Expo web) client', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(() => app.close());

  it('answers the preflight for the session and company headers in development', async () => {
    const res = await request(app.getHttpServer())
      .options('/cost-centers')
      .set('Origin', 'http://localhost:8081')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization,x-company-id')
      .expect(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-headers']).toMatch(
      /x-company-id/i,
    );
  });
});
