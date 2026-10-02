import type { INestApplication } from '@nestjs/common';
import type { AuditEntry, Member } from '@procurely/shared-types';
import { COMPANY, PERSON } from '../../prisma/seed-data';
import { Actor, startApp } from './harness';

const byEmail = (members: Member[], email: string) =>
  members.find((m) => m.email === email);

describe('company switching', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(() => app.close());
  const as = (personId: string) => Actor.signIn(app, personId);

  it('lists the companies a person belongs to with their role in each', async () => {
    const alice = await as(PERSON.alice);
    const res = await alice.listCompanies().expect(200);
    expect(
      Object.fromEntries(
        res.body.map((c: { companyId: string; role: string }) => [
          c.companyId,
          c.role,
        ]),
      ),
    ).toEqual({ [COMPANY.main]: 'REQUESTER', [COMPANY.sek]: 'APPROVER' });
  });

  it('lists nothing for a person with no company, or a deactivated membership', async () => {
    for (const person of [PERSON.nomad, PERSON.oscar]) {
      const actor = await as(person);
      expect((await actor.listCompanies().expect(200)).body).toEqual([]);
    }
  });

  it('selects the active company by naming it, and shows the role held there', async () => {
    const alice = await as(PERSON.alice);
    const main = await alice.activeCompany(COMPANY.main).expect(200);
    expect(main.body).toMatchObject({
      companyId: COMPANY.main,
      role: 'REQUESTER',
      currency: 'EUR',
    });
    const sek = await alice.activeCompany(COMPANY.sek).expect(200);
    expect(sek.body).toMatchObject({ role: 'APPROVER', currency: 'SEK' });
  });

  it('refuses to select a company the person does not belong to', async () => {
    const alice = await as(PERSON.alice);
    await alice.activeCompany(COMPANY.large).expect(404);
    await alice.activeCompany().expect(400);
    const oscar = await as(PERSON.oscar);
    await oscar.activeCompany(COMPANY.main).expect(404);
  });
});

describe('inviting and managing members', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(() => app.close());
  const as = (personId: string) => Actor.signIn(app, personId);

  it('lets an admin invite a new person by email with a role', async () => {
    const dave = await as(PERSON.dave);
    const res = await dave
      .inviteMember(COMPANY.main, {
        email: 'New.Hire@procurely.test',
        name: 'New Hire',
        role: 'BUYER',
      })
      .expect(201);
    expect(res.body).toMatchObject({
      email: 'new.hire@procurely.test',
      name: 'New Hire',
      role: 'BUYER',
      active: true,
    });
    const members = (await dave.listMembers(COMPANY.main).expect(200))
      .body as Member[];
    expect(byEmail(members, 'new.hire@procurely.test')?.role).toBe('BUYER');
  });

  it('defaults the name of a new person to the part of the email before the @', async () => {
    const dave = await as(PERSON.dave);
    const res = await dave
      .inviteMember(COMPANY.main, {
        email: 'no.name@procurely.test',
        role: 'REQUESTER',
      })
      .expect(201);
    expect(res.body.name).toBe('no.name');
  });

  it('gives an invited person access to that company only, with the invited role', async () => {
    const erik = await as(PERSON.erik);
    // nomad exists but belongs to no company yet.
    const invited = await erik
      .inviteMember(COMPANY.sek, {
        email: 'nomad@procurely.test',
        role: 'APPROVER',
      })
      .expect(201);
    expect(invited.body.personId).toBe(PERSON.nomad);
    const nomad = await as(PERSON.nomad);
    const active = await nomad.activeCompany(COMPANY.sek).expect(200);
    expect(active.body.role).toBe('APPROVER');
    await nomad.activeCompany(COMPANY.main).expect(404);
    // Leave the seeded story as it was.
    await erik
      .updateMember(COMPANY.sek, invited.body.id, { active: false })
      .expect(200);
  });

  it('rejects inviting someone who is already an active member', async () => {
    const dave = await as(PERSON.dave);
    await dave
      .inviteMember(COMPANY.main, {
        email: 'bob@procurely.test',
        role: 'BUYER',
      })
      .expect(409);
  });

  it('validates the invitation', async () => {
    const dave = await as(PERSON.dave);
    await dave
      .inviteMember(COMPANY.main, { email: 'not-an-email', role: 'BUYER' })
      .expect(400);
    await dave
      .inviteMember(COMPANY.main, { email: 'x@procurely.test', role: 'BOSS' })
      .expect(400);
    await dave.inviteMember(COMPANY.main, { role: 'BUYER' }).expect(400);
  });

  it('deactivates a membership and removes access immediately', async () => {
    const dave = await as(PERSON.dave);
    const frida = await as(PERSON.frida);
    const erik = await as(PERSON.erik);
    const members = (await erik.listMembers(COMPANY.sek).expect(200))
      .body as Member[];
    const membership = byEmail(members, 'frida@procurely.test') as Member;
    await frida.listCostCenters(COMPANY.sek).expect(200);
    expect(
      (await frida.listCostCenters(COMPANY.sek).expect(200)).body,
    ).not.toHaveLength(0);

    // An admin of another company cannot touch this membership.
    await dave
      .updateMember(COMPANY.main, membership.id, { active: false })
      .expect(404);
    await dave
      .updateMember(COMPANY.sek, membership.id, { active: false })
      .expect(404);

    await erik
      .updateMember(COMPANY.sek, membership.id, { active: false })
      .expect(200);
    // Same session token as before: access is gone on the very next request.
    expect((await frida.listCostCenters(COMPANY.sek).expect(200)).body).toEqual(
      [],
    );
    expect((await frida.listCompanies().expect(200)).body).toEqual([]);
    await frida.activeCompany(COMPANY.sek).expect(404);

    // Reactivating restores it.
    await erik
      .updateMember(COMPANY.sek, membership.id, { active: true })
      .expect(200);
    expect(
      (await frida.listCostCenters(COMPANY.sek).expect(200)).body,
    ).not.toHaveLength(0);
  });

  it('reactivates a deactivated person through a new invitation, with the new role', async () => {
    const dave = await as(PERSON.dave);
    const res = await dave
      .inviteMember(COMPANY.main, {
        email: 'oscar@procurely.test',
        role: 'BUYER',
      })
      .expect(201);
    expect(res.body).toMatchObject({
      personId: PERSON.oscar,
      role: 'BUYER',
      active: true,
    });
    const oscar = await as(PERSON.oscar);
    expect(
      (await oscar.activeCompany(COMPANY.main).expect(200)).body.role,
    ).toBe('BUYER');
    await dave
      .updateMember(COMPANY.main, res.body.id, { active: false })
      .expect(200);
    await oscar.activeCompany(COMPANY.main).expect(404);
  });

  it('changes a role and the person acts with the new role at once', async () => {
    const dave = await as(PERSON.dave);
    const bob = await as(PERSON.bob);
    const members = (await dave.listMembers(COMPANY.main).expect(200))
      .body as Member[];
    const membership = byEmail(members, 'bob@procurely.test') as Member;
    await dave
      .updateMember(COMPANY.main, membership.id, { role: 'ADMIN' })
      .expect(200);
    await bob
      .createCostCenter(COMPANY.main, { code: 'BOBS', name: 'By Bob' })
      .expect(201);
    await dave
      .updateMember(COMPANY.main, membership.id, { role: 'APPROVER' })
      .expect(200);
    await bob
      .createCostCenter(COMPANY.main, { code: 'BOBS2', name: 'By Bob' })
      .expect(403);
    const admin = (await dave.listCostCenters(COMPANY.main).expect(200)).body;
    const planted = admin.find((c: { code: string }) => c.code === 'BOBS');
    await dave.deleteCostCenter(COMPANY.main, planted.id).expect(204);
  });

  it('only changes role and active, nothing else about a membership', async () => {
    const dave = await as(PERSON.dave);
    const members = (await dave.listMembers(COMPANY.main).expect(200))
      .body as Member[];
    const membership = byEmail(members, 'carol@procurely.test') as Member;
    await dave.updateMember(COMPANY.main, membership.id, {}).expect(400);
    await dave
      .updateMember(COMPANY.main, membership.id, { role: 'BOSS' })
      .expect(400);
    await dave
      .updateMember(COMPANY.main, membership.id, {
        personId: PERSON.mallory,
        companyId: COMPANY.empty,
        role: 'BUYER',
      })
      .expect(200);
    const after = (await dave.listMembers(COMPANY.main).expect(200))
      .body as Member[];
    expect(byEmail(after, 'carol@procurely.test')).toMatchObject({
      personId: PERSON.carol,
    });
  });

  it('keeps at least one active admin in the company', async () => {
    const dave = await as(PERSON.dave);
    const members = (await dave.listMembers(COMPANY.main).expect(200))
      .body as Member[];
    const self = byEmail(members, 'dave@procurely.test') as Member;
    await dave
      .updateMember(COMPANY.main, self.id, { active: false })
      .expect(409);
    await dave
      .updateMember(COMPANY.main, self.id, { role: 'BUYER' })
      .expect(409);
    await dave.listCostCenters(COMPANY.main).expect(200);
  });

  it('lets an admin deactivate themselves when another admin remains, and records it', async () => {
    const dave = await as(PERSON.dave);
    const invited = await dave
      .inviteMember(COMPANY.main, {
        email: 'self.quit@procurely.test',
        role: 'ADMIN',
      })
      .expect(201);
    const quitter = await as(invited.body.personId);
    await quitter
      .updateMember(COMPANY.main, invited.body.id, { active: false })
      .expect(200);
    await quitter.activeCompany(COMPANY.main).expect(404);
    const log = (await dave.auditLog(COMPANY.main).expect(200))
      .body as AuditEntry[];
    expect(
      log.some(
        (e) =>
          e.entityId === invited.body.id &&
          e.action === 'member.deactivated' &&
          e.actorPersonId === invited.body.personId,
      ),
    ).toBe(true);
  });

  describe('who may manage members', () => {
    it('refuses every non-admin role', async () => {
      const dave = await as(PERSON.dave);
      const members = (await dave.listMembers(COMPANY.main).expect(200))
        .body as Member[];
      const bobsMembership = byEmail(members, 'bob@procurely.test') as Member;
      for (const person of [PERSON.alice, PERSON.bob, PERSON.carol]) {
        const actor = await as(person);
        await actor
          .inviteMember(COMPANY.main, {
            email: 'sneaky@procurely.test',
            role: 'ADMIN',
          })
          .expect(403);
        await actor
          .updateMember(COMPANY.main, bobsMembership.id, { active: false })
          .expect(403);
        // A non-admin sees at most their own membership, never the roster.
        const seen = (await actor.listMembers(COMPANY.main).expect(200))
          .body as Member[];
        expect(seen.every((m) => m.personId === person)).toBe(true);
      }
      const after = (await dave.listMembers(COMPANY.main).expect(200))
        .body as Member[];
      expect(byEmail(after, 'sneaky@procurely.test')).toBeUndefined();
      expect(byEmail(after, 'bob@procurely.test')?.active).toBe(true);
    });

    it('refuses a deactivated member, a person with no company and the attacker', async () => {
      for (const person of [PERSON.oscar, PERSON.nomad, PERSON.mallory]) {
        const actor = await as(person);
        for (const company of [COMPANY.main, COMPANY.sek, COMPANY.large]) {
          await actor
            .inviteMember(company, {
              email: 'sneaky@procurely.test',
              role: 'ADMIN',
            })
            .expect(403);
          expect((await actor.listMembers(company).expect(200)).body).toEqual(
            [],
          );
        }
      }
    });

    it('never lets an admin of one company see or invite into another', async () => {
      const dave = await as(PERSON.dave);
      expect((await dave.listMembers(COMPANY.sek).expect(200)).body).toEqual(
        [],
      );
      await dave
        .inviteMember(COMPANY.sek, {
          email: 'sneaky@procurely.test',
          role: 'ADMIN',
        })
        .expect(403);
    });

    it('does not reveal people of other companies to an admin', async () => {
      const dave = await as(PERSON.dave);
      const members = (await dave.listMembers(COMPANY.main).expect(200))
        .body as Member[];
      expect(byEmail(members, 'erik@procurely.test')).toBeUndefined();
      expect(byEmail(members, 'mallory@procurely.test')).toBeUndefined();
    });
  });

  describe('audit entries for membership changes', () => {
    it('records invitations, role changes and deactivations, readable by the admin', async () => {
      const gustav = await as(PERSON.gustav);
      const invited = await gustav
        .inviteMember(COMPANY.large, {
          email: 'audited@procurely.test',
          role: 'REQUESTER',
        })
        .expect(201);
      await gustav
        .updateMember(COMPANY.large, invited.body.id, { role: 'APPROVER' })
        .expect(200);
      await gustav
        .updateMember(COMPANY.large, invited.body.id, { active: false })
        .expect(200);

      const log = (await gustav.auditLog(COMPANY.large).expect(200))
        .body as AuditEntry[];
      const mine = log.filter((e) => e.entityId === invited.body.id);
      expect(mine.map((e) => e.action).sort()).toEqual([
        'member.deactivated',
        'member.invited',
        'member.role_changed',
      ]);
      expect(mine.every((e) => e.actorPersonId === PERSON.gustav)).toBe(true);
      const changed = mine.find((e) => e.action === 'member.role_changed');
      expect(changed?.details).toMatchObject({
        email: 'audited@procurely.test',
        from: 'REQUESTER',
        to: 'APPROVER',
      });
    });

    it('writes no entry when the change is refused', async () => {
      const erik = await as(PERSON.erik);
      const before = (await erik.auditLog(COMPANY.sek).expect(200))
        .body as AuditEntry[];
      const alice = await as(PERSON.alice);
      await alice
        .inviteMember(COMPANY.sek, {
          email: 'refused@procurely.test',
          role: 'ADMIN',
        })
        .expect(403);
      const after = (await erik.auditLog(COMPANY.sek).expect(200))
        .body as AuditEntry[];
      expect(after).toHaveLength(before.length);
    });
  });
});
