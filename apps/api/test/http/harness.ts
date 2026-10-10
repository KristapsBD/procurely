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
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
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
  /** `selectable` lists only what may be chosen for new work (active suppliers). */
  listSuppliers(companyId: string, opts: { selectable?: boolean } = {}) {
    const query = opts.selectable ? '?selectable=true' : '';
    return this.call('get', `/suppliers${query}`, companyId);
  }
  getSupplier(companyId: string, id: string) {
    return this.call('get', `/suppliers/${id}`, companyId);
  }
  createSupplier(companyId: string, body: object) {
    return this.call('post', '/suppliers', companyId).send(body);
  }
  updateSupplier(companyId: string, id: string, body: object) {
    return this.call('patch', `/suppliers/${id}`, companyId).send(body);
  }
  listCatalogItems(companyId: string, opts: { selectable?: boolean } = {}) {
    const query = opts.selectable ? '?selectable=true' : '';
    return this.call('get', `/catalog-items${query}`, companyId);
  }
  getCatalogItem(companyId: string, id: string) {
    return this.call('get', `/catalog-items/${id}`, companyId);
  }
  createCatalogItem(companyId: string, body: object) {
    return this.call('post', '/catalog-items', companyId).send(body);
  }
  updateCatalogItem(companyId: string, id: string, body: object) {
    return this.call('patch', `/catalog-items/${id}`, companyId).send(body);
  }
  deleteCatalogItem(companyId: string, id: string) {
    return this.call('delete', `/catalog-items/${id}`, companyId);
  }
  listRequisitions(companyId: string) {
    return this.call('get', '/requisitions', companyId);
  }
  getRequisition(companyId: string, id: string) {
    return this.call('get', `/requisitions/${id}`, companyId);
  }
  createRequisition(companyId: string, body: object) {
    return this.call('post', '/requisitions', companyId).send(body);
  }
  updateRequisition(companyId: string, id: string, body: object) {
    return this.call('put', `/requisitions/${id}`, companyId).send(body);
  }
  submitRequisition(companyId: string, id: string) {
    return this.call('post', `/requisitions/${id}/submit`, companyId);
  }
  cancelRequisition(companyId: string, id: string) {
    return this.call('post', `/requisitions/${id}/cancel`, companyId);
  }
  approveRequisition(companyId: string, id: string, body: object = {}) {
    return this.call('post', `/requisitions/${id}/approve`, companyId).send(
      body,
    );
  }
  rejectRequisition(companyId: string, id: string, body: object) {
    return this.call('post', `/requisitions/${id}/reject`, companyId).send(
      body,
    );
  }
  listPurchaseOrders(companyId: string) {
    return this.call('get', '/purchase-orders', companyId);
  }
  getPurchaseOrder(companyId: string, id: string) {
    return this.call('get', `/purchase-orders/${id}`, companyId);
  }
  createPurchaseOrder(companyId: string, body: object) {
    return this.call('post', '/purchase-orders', companyId).send(body);
  }
  listApprovalRules(companyId: string) {
    return this.call('get', '/approval-rules', companyId);
  }
  createApprovalRule(companyId: string, body: object) {
    return this.call('post', '/approval-rules', companyId).send(body);
  }
  deleteApprovalRule(companyId: string, id: string) {
    return this.call('delete', `/approval-rules/${id}`, companyId);
  }
  registerPushDevice(companyId: string, token: string) {
    return this.call('post', '/push-devices', companyId).send({ token });
  }
  removePushDevice(companyId: string, token: string) {
    return this.call('delete', '/push-devices', companyId).send({ token });
  }
  pushOutbox(companyId: string) {
    return this.call('get', '/push-devices/outbox', companyId);
  }
}
