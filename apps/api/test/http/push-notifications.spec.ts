import type { INestApplication } from '@nestjs/common';
import type {
  CatalogItem,
  CostCenter,
  PushOutboxEntry,
  Requisition,
} from '@procurely/shared-types';
import { CATALOG_ITEM, COMPANY, PERSON } from '../../prisma/seed-data';
import { ApprovalNotifier } from '../../src/notifications/approval-notifier';
import { PushOutbox } from '../../src/notifications/push-outbox';
import { PUSH_SENDER } from '../../src/notifications/push-sender';
import { FakePushSender } from '../support/fake-push';
import { Actor, startApp } from './harness';

const MEGA = COMPANY.large;
const ACME = COMPANY.main;
const token = (name: string) => `ExponentPushToken[${name.padEnd(12, 'x')}]`;
const T = {
  bob: token('bob'),
  dave: token('dave'),
  hanna: token('hanna'),
  gustav: token('gustav'),
  alice: token('alice'),
  ivan: token('ivan'),
};

// Acme keeps no rules (an admin decides: dave). Megacorp's seeded rule sends totals from
// 1000.00 to its approver (hanna), with gustav as admin; a one-cent catalog item makes a
// requisition's quantity its total.
describe('approval push notifications', () => {
  let app: INestApplication;
  let sender: FakePushSender;
  let notifier: ApprovalNotifier;
  let outbox: PushOutbox;
  let cent: string;
  let plant: string;
  let acmeOps: string;

  beforeAll(async () => {
    sender = new FakePushSender();
    app = await startApp((b) =>
      b.overrideProvider(PUSH_SENDER).useValue(sender),
    );
    notifier = app.get(ApprovalNotifier);
    outbox = app.get(PushOutbox);
    const gustav = await as(PERSON.gustav);
    const supplier = await gustav
      .createSupplier(MEGA, { name: 'Secret Supplier GmbH' })
      .expect(201);
    cent = (
      (
        await gustav
          .createCatalogItem(MEGA, {
            supplierId: supplier.body.id,
            name: 'One cent part',
            unitPriceMinor: 1,
          })
          .expect(201)
      ).body as CatalogItem
    ).id;
    const costCenter = async (actor: Actor, company: string, code: string) =>
      (
        (await actor.listCostCenters(company).expect(200)).body as CostCenter[]
      ).find((c) => c.code === code)!.id;
    plant = await costCenter(gustav, MEGA, 'PLANT1');
    acmeOps = await costCenter(await as(PERSON.alice), ACME, 'OPS');
  });
  afterAll(() => app.close());
  beforeEach(() => {
    sender.sent.length = 0;
    sender.failWith = null;
    outbox.clear();
  });
  const as = (personId: string) => Actor.signIn(app, personId);

  async function register(personId: string, company: string, t: string) {
    await (await as(personId)).registerPushDevice(company, t).expect(204);
  }

  async function draft(
    actor: Actor,
    company: string,
    costCenterId: string,
    item: string,
    quantity: number,
  ) {
    const res = await actor
      .createRequisition(company, {
        costCenterId,
        justification: 'Needed for the line',
        lines: [{ catalogItemId: item, quantity }],
      })
      .expect(201);
    return (res.body as Requisition).id;
  }

  async function submitInMega(totalMinor: number) {
    const ivan = await as(PERSON.ivan);
    const id = await draft(ivan, MEGA, plant, cent, totalMinor);
    await ivan.submitRequisition(MEGA, id).expect(200);
    await notifier.idle();
    return id;
  }

  async function submitInAcme() {
    const alice = await as(PERSON.alice);
    const id = await draft(alice, ACME, acmeOps, CATALOG_ITEM.mainPaper, 3);
    await alice.submitRequisition(ACME, id).expect(200);
    await notifier.idle();
    return id;
  }

  describe('when a requisition is submitted', () => {
    it('tells the approver and the admin its route admits, and nobody else', async () => {
      await register(PERSON.hanna, MEGA, T.hanna);
      await register(PERSON.gustav, MEGA, T.gustav);
      await register(PERSON.ivan, MEGA, T.ivan);
      const id = await submitInMega(100000);
      expect(sender.to(T.hanna)).toEqual([
        {
          to: T.hanna,
          title: 'Approval needed',
          body: 'A requisition is waiting for your decision.',
          data: {
            kind: 'approval-requested',
            requisitionId: id,
            companyId: MEGA,
          },
        },
      ]);
      expect(sender.to(T.gustav)).toHaveLength(1);
      expect(sender.to(T.ivan)).toEqual([]);
    });

    it('leaves an approver out when only an admin may decide', async () => {
      await register(PERSON.bob, ACME, T.bob);
      await register(PERSON.dave, ACME, T.dave);
      await submitInAcme();
      expect(sender.to(T.dave)).toHaveLength(1);
      expect(sender.to(T.bob)).toEqual([]);
    });

    it('tells nobody when the requisition is approved on submit', async () => {
      await register(PERSON.hanna, MEGA, T.hanna);
      await submitInMega(5);
      expect(sender.sent).toEqual([]);
    });

    it('carries no supplier, amount, item or company name', async () => {
      await register(PERSON.hanna, MEGA, T.hanna);
      await submitInMega(123456);
      const json = JSON.stringify(sender.sent);
      for (const secret of [
        'Secret Supplier',
        'One cent part',
        'Megacorp',
        '1234',
        'Needed for the line',
        'Ivan',
      ]) {
        expect(json).not.toContain(secret);
      }
    });

    it('does not tell a device registered for another company', async () => {
      await register(PERSON.hanna, MEGA, T.hanna);
      await register(PERSON.alice, COMPANY.sek, T.alice);
      await submitInAcme();
      await submitInMega(100000);
      expect(sender.to(T.alice)).toEqual([]);
    });

    it('follows the company the person last registered the phone for', async () => {
      await register(PERSON.alice, COMPANY.sek, T.alice);
      await register(PERSON.alice, ACME, T.alice);
      const id = await submitInAcme();
      await (await as(PERSON.dave)).approveRequisition(ACME, id).expect(200);
      await notifier.idle();
      expect(sender.to(T.alice)).toHaveLength(1);
    });

    it('gives a phone to whoever registered it last', async () => {
      await register(PERSON.hanna, MEGA, T.hanna);
      await register(PERSON.gustav, MEGA, T.hanna);
      await submitInMega(100000);
      expect(sender.to(T.hanna)).toHaveLength(1);
      expect(
        (await (await as(PERSON.hanna)).pushOutbox(MEGA).expect(200)).body,
      ).toEqual([]);
      expect(
        (await (await as(PERSON.gustav)).pushOutbox(MEGA).expect(200)).body,
      ).not.toHaveLength(0);
    });

    it('stops telling a phone that was removed', async () => {
      await register(PERSON.hanna, MEGA, T.hanna);
      await (
        await as(PERSON.hanna)
      )
        .removePushDevice(MEGA, T.hanna)
        .expect(204);
      await submitInMega(100000);
      expect(sender.to(T.hanna)).toEqual([]);
    });
  });

  describe('when a requisition is decided', () => {
    it('tells the requester it was approved, without the comment', async () => {
      await register(PERSON.alice, ACME, T.alice);
      const id = await submitInAcme();
      await (
        await as(PERSON.dave)
      )
        .approveRequisition(ACME, id, { comment: 'Within the secret budget' })
        .expect(200);
      await notifier.idle();
      expect(sender.to(T.alice)).toEqual([
        {
          to: T.alice,
          title: 'Requisition approved',
          body: 'Open Procurely to read the decision.',
          data: {
            kind: 'requisition-decided',
            requisitionId: id,
            companyId: ACME,
          },
        },
      ]);
      expect(JSON.stringify(sender.sent)).not.toContain('secret budget');
    });

    it('tells the requester it was rejected', async () => {
      await register(PERSON.alice, ACME, T.alice);
      const id = await submitInAcme();
      await (
        await as(PERSON.dave)
      )
        .rejectRequisition(ACME, id, { reason: 'Too expensive' })
        .expect(200);
      await notifier.idle();
      expect(sender.to(T.alice).map((m) => m.title)).toEqual([
        'Requisition rejected',
      ]);
    });

    it('does not tell a requester whose phone is registered for another company', async () => {
      await register(PERSON.alice, COMPANY.sek, T.alice);
      const id = await submitInAcme();
      await (await as(PERSON.dave)).approveRequisition(ACME, id).expect(200);
      await notifier.idle();
      expect(sender.to(T.alice)).toEqual([]);
    });
  });

  it('never fails or delays the approval when delivery fails', async () => {
    await register(PERSON.alice, ACME, T.alice);
    await register(PERSON.dave, ACME, T.dave);
    sender.failWith = new Error('Expo is down');
    const id = await submitInAcme();
    const res = await (
      await as(PERSON.dave)
    )
      .approveRequisition(ACME, id)
      .expect(200);
    await notifier.idle();
    expect((res.body as Requisition).status).toBe('APPROVED');
    expect(sender.sent).toEqual([]);
  });

  describe('registering a device', () => {
    it('refuses something that is not an Expo push token', async () => {
      const alice = await as(PERSON.alice);
      await alice.registerPushDevice(ACME, 'not-a-token').expect(400);
    });

    it('refuses a person who is not an active member of the company', async () => {
      const mallory = await as(PERSON.mallory);
      await mallory.registerPushDevice(ACME, T.alice).expect(403);
      expect(
        (await (await as(PERSON.alice)).pushOutbox(ACME).expect(200)).body,
      ).toEqual([]);
    });

    it('lists the outbox only for the persons own devices in the company', async () => {
      await register(PERSON.dave, ACME, T.dave);
      await register(PERSON.hanna, MEGA, T.hanna);
      await submitInAcme();
      const dave = (await (await as(PERSON.dave)).pushOutbox(ACME).expect(200))
        .body as PushOutboxEntry[];
      expect(dave).toEqual([
        expect.objectContaining({
          kind: 'approval-requested',
          companyId: ACME,
          title: 'Approval needed',
        }),
      ]);
      expect(
        (await (await as(PERSON.hanna)).pushOutbox(MEGA).expect(200)).body,
      ).toEqual([]);
      await (await as(PERSON.bob)).pushOutbox(ACME).expect(200);
    });
  });
});
