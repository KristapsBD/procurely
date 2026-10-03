import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { COMPANY_HEADER, type SessionResponse } from '@procurely/shared-types';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';

/** The real app; `override` can swap providers (e.g. a fake Google) before it starts. */
export async function startApp(
  override: (builder: TestingModuleBuilder) => TestingModuleBuilder = (b) => b,
): Promise<INestApplication> {
  const mod = await override(
    Test.createTestingModule({ imports: [AppModule] }),
  ).compile();
  const app = mod.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

/** A seeded person signed in through the dev-only login, acting in a chosen company. */
export class Actor {
  private constructor(
    private readonly app: INestApplication,
    readonly token: string,
  ) {}

  static async signIn(app: INestApplication, personId: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/dev-login')
      .send({ personId })
      .expect(201);
    return new Actor(app, (res.body as SessionResponse).token);
  }

  private call(
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    companyId?: string,
  ) {
    const agent = request(this.app.getHttpServer());
    const req = agent[method](path).set(
      'Authorization',
      `Bearer ${this.token}`,
    );
    return companyId ? req.set(COMPANY_HEADER, companyId) : req;
  }

  me() {
    return this.call('get', '/me');
  }
  listCompanies() {
    return this.call('get', '/companies');
  }
  activeCompany(companyId?: string) {
    return this.call('get', '/companies/active', companyId);
  }
  listMembers(companyId: string) {
    return this.call('get', '/members', companyId);
  }
  inviteMember(companyId: string, body: object) {
    return this.call('post', '/members', companyId).send(body);
  }
  updateMember(companyId: string, membershipId: string, body: object) {
    return this.call('patch', `/members/${membershipId}`, companyId).send(body);
  }
  auditLog(companyId: string) {
    return this.call('get', '/audit-log', companyId);
  }
  listCostCenters(companyId?: string) {
    return this.call('get', '/cost-centers', companyId);
  }
  getCostCenter(companyId: string, id: string) {
    return this.call('get', `/cost-centers/${id}`, companyId);
  }
  createCostCenter(companyId: string, body: object) {
    return this.call('post', '/cost-centers', companyId).send(body);
  }
  renameCostCenter(companyId: string, id: string, name: string) {
    return this.call('patch', `/cost-centers/${id}`, companyId).send({ name });
  }
  deleteCostCenter(companyId: string, id: string) {
    return this.call('delete', `/cost-centers/${id}`, companyId);
  }
}
