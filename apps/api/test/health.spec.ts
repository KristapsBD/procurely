import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

describe('GET /health', () => {
  let app: INestApplication;
  const prisma = {
    $queryRaw: jest.fn(),
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = mod.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());

  it('reports ok when the database answers', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up' });
  });

  it('reports 503 when the database is unreachable', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('down'));
    await request(app.getHttpServer()).get('/health').expect(503);
  });
});
