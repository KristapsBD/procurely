import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PERSON } from '../../prisma/seed-data';
import { Actor, startApp } from './harness';

describe('dev-only login and sessions', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(() => app.close());

  it('signs in as a seeded person and returns who they are', async () => {
    const alice = await Actor.signIn(app, PERSON.alice);
    const res = await alice.me().expect(200);
    expect(res.body).toMatchObject({
      id: PERSON.alice,
      email: 'alice@procurely.test',
    });
  });

  it('rejects an unknown person', async () => {
    await request(app.getHttpServer())
      .post('/auth/dev-login')
      .send({ personId: '11111111-1111-4111-8111-111111111111' })
      .expect(404);
  });

  it('rejects requests without a valid session', async () => {
    await request(app.getHttpServer()).get('/me').expect(401);
    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', 'Bearer not.a-token')
      .expect(401);
    const alice = await Actor.signIn(app, PERSON.alice);
    const [payload] = alice.token.split('.');
    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${payload}.forged`)
      .expect(401);
  });

  it('does not exist in a production configuration', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    process.env.SESSION_SECRET = 'a-production-secret';
    const production = await startApp();
    try {
      await request(production.getHttpServer())
        .post('/auth/dev-login')
        .send({ personId: PERSON.alice })
        .expect(404);
    } finally {
      await production.close();
      process.env.NODE_ENV = previous;
      delete process.env.SESSION_SECRET;
    }
  });
});
