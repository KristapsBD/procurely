import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { OPENAPI_PATH, serveOpenApiDocument } from '../src/contract/openapi';
import { PrismaService } from '../src/prisma.service';

describe(`GET ${OPENAPI_PATH}`, () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
      .compile();
    app = mod.createNestApplication();
    serveOpenApiDocument(app);
    await app.init();
  });
  afterAll(() => app.close());

  it('publishes the API routes as an OpenAPI document without authentication', async () => {
    const res = await request(app.getHttpServer())
      .get(OPENAPI_PATH)
      .expect(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining(['/health', '/me', '/members', '/members/{id}']),
    );
  });
});
