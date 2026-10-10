import { at, membershipId, seedId } from './seed-kit';
import type {
  ApprovalRuleSeed,
  LineSpec,
  MembershipSeed,
  OrderSpec,
  Outcome,
  ReceiptSpec,
  ReferenceAuditEvent,
  Reference,
  RequisitionHistory,
} from './seed-types';

export const COMPANY = {
  main: '00000000-0000-4000-8000-0000000000a1',
  sek: '00000000-0000-4000-8000-0000000000a2',
  large: '00000000-0000-4000-8000-0000000000a3',
  empty: '00000000-0000-4000-8000-0000000000a4',
} as const;

export const PERSON = {
  // Requester in the main company, approver in the SEK company.
  alice: '00000000-0000-4000-8000-0000000000b1',
  bob: '00000000-0000-4000-8000-0000000000b2',
  carol: '00000000-0000-4000-8000-0000000000b3',
  dave: '00000000-0000-4000-8000-0000000000b4',
  erik: '00000000-0000-4000-8000-0000000000b5',
  frida: '00000000-0000-4000-8000-0000000000b6',
  gustav: '00000000-0000-4000-8000-0000000000b7',
  hanna: '00000000-0000-4000-8000-0000000000b8',
  ivan: '00000000-0000-4000-8000-0000000000b9',
  // Signed in, but belongs to no company.
  nomad: '00000000-0000-4000-8000-0000000000ba',
  // Membership in the main company was deactivated.
  oscar: '00000000-0000-4000-8000-0000000000bb',
  // The attacker: belongs only to the empty company.
  mallory: '00000000-0000-4000-8000-0000000000bc',
  paula: '00000000-0000-4000-8000-0000000000b0',
  jonas: '00000000-0000-4000-8000-0000000000bd',
  kerstin: '00000000-0000-4000-8000-0000000000be',
  lukas: '00000000-0000-4000-8000-0000000000bf',
} as const;

export const companies = [
  { id: COMPANY.main, name: 'Acme Trading', currency: 'EUR' },
  { id: COMPANY.sek, name: 'Nordic Supplies', currency: 'SEK' },
  { id: COMPANY.large, name: 'Megacorp Industries', currency: 'EUR' },
  { id: COMPANY.empty, name: 'Fresh Start Ltd', currency: 'EUR' },
];

const person = (id: string, name: string) => ({
  id,
  email: `${name.split(' ')[0].toLowerCase()}@procurely.test`,
  name,
});

export const people = [
  person(PERSON.alice, 'Alice Requester'),
  person(PERSON.bob, 'Bob Approver'),
  person(PERSON.carol, 'Carol Buyer'),
  person(PERSON.dave, 'Dave Admin'),
  person(PERSON.erik, 'Erik Admin'),
  person(PERSON.frida, 'Frida Requester'),
  person(PERSON.gustav, 'Gustav Admin'),
  person(PERSON.hanna, 'Hanna Approver'),
  person(PERSON.ivan, 'Ivan Requester'),
  person(PERSON.nomad, 'Nomad NoCompany'),
  person(PERSON.oscar, 'Oscar Deactivated'),
  person(PERSON.mallory, 'Mallory Attacker'),
  person(PERSON.paula, 'Paula Requester'),
  person(PERSON.jonas, 'Jonas Buyer'),
  person(PERSON.kerstin, 'Kerstin Buyer'),
  person(PERSON.lukas, 'Lukas Requester'),
];

const member = (
  companyId: string,
  personId: string,
  role: MembershipSeed['role'],
  active = true,
): MembershipSeed => ({ companyId, personId, role, active });

export const memberships: MembershipSeed[] = [
  member(COMPANY.main, PERSON.alice, 'REQUESTER'),
  member(COMPANY.sek, PERSON.alice, 'APPROVER'),
  member(COMPANY.main, PERSON.bob, 'APPROVER'),
  member(COMPANY.main, PERSON.carol, 'BUYER'),
  member(COMPANY.main, PERSON.dave, 'ADMIN'),
  member(COMPANY.sek, PERSON.erik, 'ADMIN'),
  member(COMPANY.sek, PERSON.frida, 'REQUESTER'),
  member(COMPANY.large, PERSON.gustav, 'ADMIN'),
  member(COMPANY.large, PERSON.hanna, 'APPROVER'),
  member(COMPANY.large, PERSON.ivan, 'REQUESTER'),
  member(COMPANY.main, PERSON.oscar, 'REQUESTER', false),
  member(COMPANY.empty, PERSON.mallory, 'REQUESTER'),
  member(COMPANY.main, PERSON.paula, 'REQUESTER'),
  member(COMPANY.large, PERSON.jonas, 'BUYER'),
  member(COMPANY.sek, PERSON.kerstin, 'BUYER'),
  member(COMPANY.large, PERSON.lukas, 'REQUESTER'),
];

// The empty company deliberately has no cost centers.
export const costCenters = [
  { companyId: COMPANY.main, code: 'OPS', name: 'Operations' },
  { companyId: COMPANY.main, code: 'IT', name: 'Information Technology' },
  { companyId: COMPANY.main, code: 'MKT', name: 'Marketing' },
  { companyId: COMPANY.sek, code: 'OPS', name: 'Drift' },
  { companyId: COMPANY.sek, code: 'SALES', name: 'Försäljning' },
  { companyId: COMPANY.large, code: 'PLANT1', name: 'Plant 1' },
  { companyId: COMPANY.large, code: 'PLANT2', name: 'Plant 2' },
  { companyId: COMPANY.large, code: 'IT', name: 'Group IT' },
  { companyId: COMPANY.large, code: 'HR', name: 'Human Resources' },
  { companyId: COMPANY.large, code: 'FIN', name: 'Finance' },
];

export const SUPPLIER = {
  // The same supplier name in two companies, each with its own agreed prices.
  mainOffice: '00000000-0000-4000-8000-0000000000d1',
  sekOffice: '00000000-0000-4000-8000-0000000000d2',
  mainTech: '00000000-0000-4000-8000-0000000000d3',
  // Inactive: keeps its catalog item, but cannot be chosen for new work.
  mainInactive: '00000000-0000-4000-8000-0000000000d4',
  sekTech: '00000000-0000-4000-8000-0000000000d5',
  largeIndustrial: '00000000-0000-4000-8000-0000000000d6',
  largeFacilities: '00000000-0000-4000-8000-0000000000d7',
  largeIt: '00000000-0000-4000-8000-0000000000d8',
} as const;

const supplier = (
  id: string,
  companyId: string,
  name: string,
  active = true,
) => ({
  id,
  companyId,
  name,
  active,
});

export const suppliers = [
  supplier(SUPPLIER.mainOffice, COMPANY.main, 'Office Depot'),
  supplier(SUPPLIER.sekOffice, COMPANY.sek, 'Office Depot'),
  supplier(SUPPLIER.mainTech, COMPANY.main, 'TechWorld'),
  supplier(SUPPLIER.mainInactive, COMPANY.main, 'Old Paper Mill', false),
  supplier(SUPPLIER.sekTech, COMPANY.sek, 'Nordic Tech AB'),
  supplier(SUPPLIER.largeIndustrial, COMPANY.large, 'Ferro Industrial Supply'),
  supplier(SUPPLIER.largeFacilities, COMPANY.large, 'Brightline Facilities'),
  supplier(SUPPLIER.largeIt, COMPANY.large, 'Kestrel IT Distribution'),
];

export const CATALOG_ITEM = {
  mainPaper: '00000000-0000-4000-8000-0000000000e1',
  sekPaper: '00000000-0000-4000-8000-0000000000e2',
  mainLaptop: '00000000-0000-4000-8000-0000000000e3',
  mainOldPaper: '00000000-0000-4000-8000-0000000000e4',
} as const;

const PAPER = 'A4 copy paper, box of 5 reams';

// Prices are integer minor units of the company currency (EUR cents, SEK öre).
const item = (
  companyId: string,
  supplierId: string,
  name: string,
  unitPriceMinor: number,
  id = seedId('catalog-item', supplierId, name),
) => ({
  id,
  companyId,
  supplierId,
  name,
  unitPriceMinor,
});

const acmeItem = (
  supplierId: string,
  name: string,
  price: number,
  id?: string,
) => item(COMPANY.main, supplierId, name, price, id);
const sekItem = (
  supplierId: string,
  name: string,
  price: number,
  id?: string,
) => item(COMPANY.sek, supplierId, name, price, id);
const megaItem = (supplierId: string, name: string, price: number) =>
  item(COMPANY.large, supplierId, name, price);

const ACME = {
  toner: acmeItem(SUPPLIER.mainOffice, 'Printer toner, black', 8990),
  folders: acmeItem(SUPPLIER.mainOffice, 'Filing folders, pack of 25', 1560),
  monitor: acmeItem(SUPPLIER.mainTech, 'Monitor 27 inch', 28900),
  keyboard: acmeItem(
    SUPPLIER.mainTech,
    'Wireless keyboard and mouse set',
    5490,
  ),
  webcam: acmeItem(SUPPLIER.mainTech, 'Webcam 1080p', 5900),
  headset: acmeItem(SUPPLIER.mainTech, 'Headset, wired', 3490),
};
const NORDIC = {
  pens: sekItem(SUPPLIER.sekOffice, 'Ballpoint pens, box of 50', 8900),
  laptop: sekItem(SUPPLIER.sekTech, 'Laptop 14 inch', 1299000),
};
const MEGA = {
  palletJack: megaItem(SUPPLIER.largeIndustrial, 'Pallet jack, manual', 49999),
  goggles: megaItem(SUPPLIER.largeIndustrial, 'Safety goggles', 1250),
  gloves: megaItem(SUPPLIER.largeIndustrial, 'Work gloves, pack of 10', 2499),
  weldingGloves: megaItem(
    SUPPLIER.largeIndustrial,
    'Welding gloves, pair',
    2520,
  ),
  shelving: megaItem(SUPPLIER.largeIndustrial, 'Steel shelving unit', 18900),
  vacuum: megaItem(
    SUPPLIER.largeFacilities,
    'Industrial vacuum cleaner',
    68900,
  ),
  workstation: megaItem(SUPPLIER.largeIt, 'Industrial workstation', 275000),
};

export const catalogItems = [
  acmeItem(SUPPLIER.mainOffice, PAPER, 2499, CATALOG_ITEM.mainPaper),
  sekItem(SUPPLIER.sekOffice, PAPER, 27900, CATALOG_ITEM.sekPaper),
  acmeItem(SUPPLIER.mainTech, 'Laptop 14"', 119900, CATALOG_ITEM.mainLaptop),
  acmeItem(
    SUPPLIER.mainInactive,
    'Recycled paper, box of 5 reams',
    1999,
    CATALOG_ITEM.mainOldPaper,
  ),
  ...Object.values(ACME),
  acmeItem(SUPPLIER.mainOffice, 'Whiteboard markers, pack of 4', 840),
  acmeItem(SUPPLIER.mainOffice, 'Sticky notes, 12 pads', 1190),
  acmeItem(SUPPLIER.mainTech, 'HDMI cable, 2 m', 990),
  acmeItem(SUPPLIER.mainTech, 'Laptop 16 inch', 159900),
  ...Object.values(NORDIC),
  sekItem(SUPPLIER.sekOffice, 'Whiteboard markers, pack of 4', 9900),
  sekItem(SUPPLIER.sekOffice, 'Binders, pack of 10', 19900),
  sekItem(SUPPLIER.sekOffice, 'Coffee beans, 1 kg', 18900),
  sekItem(SUPPLIER.sekTech, 'Monitor 27 inch', 329000),
  sekItem(SUPPLIER.sekTech, 'Headset, wireless', 129000),
  sekItem(SUPPLIER.sekTech, 'Webcam 1080p', 69000),
  ...Object.values(MEGA),
  megaItem(SUPPLIER.largeIndustrial, 'Hard hat', 1890),
  megaItem(SUPPLIER.largeIndustrial, 'Hydraulic oil, 20 l', 8900),
  megaItem(SUPPLIER.largeFacilities, 'Floor cleaner, 5 l', 1450),
  megaItem(SUPPLIER.largeFacilities, 'Cleaning cloths, pack of 50', 1990),
  megaItem(SUPPLIER.largeFacilities, 'Hand sanitiser, 5 l', 2390),
  megaItem(SUPPLIER.largeIt, 'Laptop 14 inch', 119900),
  megaItem(SUPPLIER.largeIt, 'Monitor 27 inch', 28900),
  megaItem(SUPPLIER.largeIt, 'Network switch, 24 port', 34900),
  megaItem(SUPPLIER.largeIt, 'Server rack, 42U', 189000),
  megaItem(SUPPLIER.largeIt, 'Barcode scanner', 18900),
];

const rule = (
  companyId: string,
  thresholdMinor: number,
  requiredRole: ApprovalRuleSeed['requiredRole'],
  createdAt: string,
): ApprovalRuleSeed => ({
  id: seedId('approval-rule', companyId, String(thresholdMinor)),
  companyId,
  thresholdMinor,
  requiredRole,
  createdAt: at(createdAt),
});

export const approvalRules = [
  rule(COMPANY.sek, 1000000, 'ADMIN', '2026-02-02T09:00:00Z'),
  rule(COMPANY.large, 50000, 'APPROVER', '2026-01-06T09:00:00Z'),
  rule(COMPANY.large, 500000, 'ADMIN', '2026-01-06T09:05:00Z'),
];

// One phone, registered for the one company its person acts in. Carol is a buyer, who is never
// notified, so no test traffic reaches it.
export const pushDevices = [
  {
    companyId: COMPANY.main,
    personId: PERSON.carol,
    token: 'ExponentPushToken[seeded-carol-phone]',
    updatedAt: at('2026-01-07T08:00:00Z'),
  },
];

const invited = (
  id: string | undefined,
  iso: string,
  companyId: string,
  actorPersonId: string,
  email: string,
  role: MembershipSeed['role'],
  personId: string,
): ReferenceAuditEvent => ({
  id,
  at: at(iso),
  companyId,
  actorPersonId,
  action: 'member.invited',
  entityType: 'membership',
  entityId: membershipId(companyId, personId),
  details: { email, role },
});

const ruleCreated = (r: ApprovalRuleSeed, actorPersonId: string) => ({
  at: r.createdAt,
  companyId: r.companyId,
  actorPersonId,
  action: 'approval_rule.created',
  entityType: 'approval_rule',
  entityId: r.id,
  details: { thresholdMinor: r.thresholdMinor, requiredRole: r.requiredRole },
});

const auditId = (n: number) => `00000000-0000-4000-8000-0000000000c${n}`;

export const referenceAudit: ReferenceAuditEvent[] = [
  invited(
    auditId(1),
    '2026-01-05T09:00:00Z',
    COMPANY.main,
    PERSON.dave,
    'alice@procurely.test',
    'REQUESTER',
    PERSON.alice,
  ),
  invited(
    auditId(3),
    '2026-01-05T09:10:00Z',
    COMPANY.sek,
    PERSON.erik,
    'alice@procurely.test',
    'APPROVER',
    PERSON.alice,
  ),
  invited(
    auditId(4),
    '2026-01-05T09:20:00Z',
    COMPANY.large,
    PERSON.gustav,
    'hanna@procurely.test',
    'APPROVER',
    PERSON.hanna,
  ),
  ruleCreated(approvalRules[1], PERSON.gustav),
  ruleCreated(approvalRules[2], PERSON.gustav),
  invited(
    undefined,
    '2026-01-08T09:00:00Z',
    COMPANY.large,
    PERSON.gustav,
    'jonas@procurely.test',
    'BUYER',
    PERSON.jonas,
  ),
  invited(
    undefined,
    '2026-01-08T09:10:00Z',
    COMPANY.large,
    PERSON.gustav,
    'lukas@procurely.test',
    'REQUESTER',
    PERSON.lukas,
  ),
  invited(
    undefined,
    '2026-01-08T09:20:00Z',
    COMPANY.sek,
    PERSON.erik,
    'kerstin@procurely.test',
    'BUYER',
    PERSON.kerstin,
  ),
  {
    at: at('2026-01-20T10:00:00Z'),
    companyId: COMPANY.main,
    actorPersonId: PERSON.dave,
    action: 'supplier.deactivated',
    entityType: 'supplier',
    entityId: SUPPLIER.mainInactive,
    details: { name: 'Old Paper Mill' },
  },
  ruleCreated(approvalRules[0], PERSON.erik),
  invited(
    undefined,
    '2026-09-28T09:00:00Z',
    COMPANY.main,
    PERSON.dave,
    'paula@procurely.test',
    'REQUESTER',
    PERSON.paula,
  ),
  {
    id: auditId(2),
    at: at('2026-09-29T09:00:00Z'),
    companyId: COMPANY.main,
    actorPersonId: PERSON.dave,
    action: 'member.deactivated',
    entityType: 'membership',
    entityId: membershipId(COMPANY.main, PERSON.oscar),
    details: { email: 'oscar@procurely.test' },
  },
];

export const REQUISITION = {
  aliceDraft: '00000000-0000-4000-8000-0000000000f1',
  fridaApproved: '00000000-0000-4000-8000-0000000000f2',
  aliceSubmitted: '00000000-0000-4000-8000-000000000201',
  aliceRejected: '00000000-0000-4000-8000-000000000202',
  paulaCancelledDraft: '00000000-0000-4000-8000-000000000203',
  aliceCancelledSubmitted: '00000000-0000-4000-8000-000000000204',
  aliceApprovedUnordered: '00000000-0000-4000-8000-000000000205',
  aliceIssued: '00000000-0000-4000-8000-000000000206',
  paulaPartial: '00000000-0000-4000-8000-000000000207',
  aliceFullyReceived: '00000000-0000-4000-8000-000000000208',
  paulaClosed: '00000000-0000-4000-8000-000000000209',
  ivanUnderThreshold: '00000000-0000-4000-8000-000000000211',
  ivanAtThreshold: '00000000-0000-4000-8000-000000000212',
  lukasOverThreshold: '00000000-0000-4000-8000-000000000213',
  gustavOwn: '00000000-0000-4000-8000-000000000214',
  ivanAdminRoute: '00000000-0000-4000-8000-000000000215',
  ivanRejected: '00000000-0000-4000-8000-000000000216',
  fridaAdminRoute: '00000000-0000-4000-8000-000000000221',
  fridaAutoApproved: '00000000-0000-4000-8000-000000000222',
} as const;

export const PURCHASE_ORDER = {
  fridaPaper: '00000000-0000-4000-8000-000000000101',
  aliceIssued: '00000000-0000-4000-8000-000000000102',
  paulaPartial: '00000000-0000-4000-8000-000000000103',
  aliceFullyReceived: '00000000-0000-4000-8000-000000000104',
  paulaClosed: '00000000-0000-4000-8000-000000000105',
  lukasOverThreshold: '00000000-0000-4000-8000-000000000106',
  fridaAutoApproved: '00000000-0000-4000-8000-000000000107',
} as const;

const SEK_APPROVAL_NOTE = 'Approved for the spring stock-up';

const lines = (...specs: [string, number][]): LineSpec[] =>
  specs.map(([catalogItemId, quantity]) => ({ catalogItemId, quantity }));

const receipt = (
  poId: string,
  n: number,
  by: string,
  iso: string,
  ...received: [position: number, quantity: number, note?: string][]
): ReceiptSpec => ({
  id: seedId('goods-receipt', poId, String(n)),
  by,
  at: at(iso),
  lines: received.map(([position, quantity, note]) => ({
    position,
    quantity,
    note: note ?? null,
  })),
});

const decided = (
  status: 'APPROVED' | 'REJECTED',
  submitIso: string,
  by: string,
  iso: string,
  comment: string | null,
): Outcome => ({
  status,
  at: at(submitIso),
  decision: { by, at: at(iso), comment },
});

const submitted = (iso: string): Outcome => ({
  status: 'SUBMITTED',
  at: at(iso),
});

const autoApproved = (iso: string): Outcome => ({
  status: 'APPROVED',
  at: at(iso),
});

interface Story {
  id: string;
  by: string;
  cost: string;
  why: string;
  lines: LineSpec[];
  created: string;
  outcome: Outcome;
  order?: OrderSpec;
}

const storyOf =
  (companyId: string) =>
  (s: Story): RequisitionHistory => ({
    id: s.id,
    companyId,
    requesterPersonId: s.by,
    costCenterCode: s.cost,
    justification: s.why,
    lines: s.lines,
    createdAt: at(s.created),
    outcome: s.outcome,
    order: s.order,
  });

const acme = storyOf(COMPANY.main);
const nordic = storyOf(COMPANY.sek);
const mega = storyOf(COMPANY.large);

const { alice, carol, dave, erik, frida, gustav, hanna, ivan, jonas } = PERSON;
const { kerstin, lukas, paula } = PERSON;

export const storyHistories: RequisitionHistory[] = [
  acme({
    id: REQUISITION.aliceDraft,
    by: alice,
    cost: 'OPS',
    why: 'Paper for the quarterly reports',
    lines: lines([CATALOG_ITEM.mainPaper, 2]),
    created: '2026-08-03T09:00:00Z',
    outcome: { status: 'DRAFT' },
  }),
  acme({
    id: REQUISITION.aliceSubmitted,
    by: alice,
    cost: 'IT',
    why: 'Second monitors for the design desks',
    lines: lines([ACME.monitor.id, 2]),
    created: '2026-08-12T09:00:00Z',
    outcome: submitted('2026-08-12T09:30:00Z'),
  }),
  acme({
    id: REQUISITION.aliceRejected,
    by: alice,
    cost: 'MKT',
    why: 'Premium headsets for the sales floor',
    lines: lines([ACME.headset.id, 6]),
    created: '2026-08-05T10:00:00Z',
    outcome: decided(
      'REJECTED',
      '2026-08-05T10:30:00Z',
      dave,
      '2026-08-06T08:15:00Z',
      "Not in this quarter's budget. Use the standard headsets instead.",
    ),
  }),
  acme({
    id: REQUISITION.paulaCancelledDraft,
    by: paula,
    cost: 'OPS',
    why: 'Folders for the onboarding kits',
    lines: lines([ACME.folders.id, 3]),
    created: '2026-08-07T11:00:00Z',
    outcome: {
      status: 'CANCELLED',
      from: 'DRAFT',
      at: at('2026-08-07T11:20:00Z'),
    },
  }),
  acme({
    id: REQUISITION.aliceCancelledSubmitted,
    by: alice,
    cost: 'IT',
    why: 'Webcams for the remote team',
    lines: lines([ACME.webcam.id, 8]),
    created: '2026-08-10T14:00:00Z',
    outcome: {
      status: 'CANCELLED',
      from: 'SUBMITTED',
      submittedAt: at('2026-08-10T14:10:00Z'),
      at: at('2026-08-11T09:00:00Z'),
    },
  }),
  acme({
    id: REQUISITION.aliceApprovedUnordered,
    by: alice,
    cost: 'OPS',
    why: 'Toner for the third floor printers',
    lines: lines([ACME.toner.id, 4]),
    created: '2026-08-14T08:30:00Z',
    outcome: decided(
      'APPROVED',
      '2026-08-14T08:45:00Z',
      dave,
      '2026-08-15T10:00:00Z',
      'Go ahead',
    ),
  }),
  acme({
    id: REQUISITION.aliceIssued,
    by: alice,
    cost: 'IT',
    why: 'Replacement keyboards for the support team',
    lines: lines([ACME.keyboard.id, 10]),
    created: '2026-08-17T09:00:00Z',
    outcome: decided(
      'APPROVED',
      '2026-08-17T09:10:00Z',
      dave,
      '2026-08-17T15:00:00Z',
      null,
    ),
    order: {
      id: PURCHASE_ORDER.aliceIssued,
      by: carol,
      at: at('2026-08-18T09:00:00Z'),
      receipts: [],
    },
  }),
  acme({
    id: REQUISITION.paulaPartial,
    by: paula,
    cost: 'IT',
    why: 'Monitors for the new analytics team',
    lines: lines([ACME.monitor.id, 10]),
    created: '2026-08-19T09:00:00Z',
    outcome: decided(
      'APPROVED',
      '2026-08-19T09:20:00Z',
      dave,
      '2026-08-19T16:00:00Z',
      'Approved, please order from TechWorld',
    ),
    order: {
      id: PURCHASE_ORDER.paulaPartial,
      by: carol,
      at: at('2026-08-20T09:00:00Z'),
      receipts: [
        receipt(PURCHASE_ORDER.paulaPartial, 1, carol, '2026-08-27T13:00:00Z', [
          0,
          6,
          'Four monitors arrived with cracked screens. TechWorld will redeliver.',
        ]),
      ],
    },
  }),
  acme({
    id: REQUISITION.aliceFullyReceived,
    by: alice,
    cost: 'IT',
    why: 'Laptops for the autumn interns',
    lines: lines([CATALOG_ITEM.mainLaptop, 5]),
    created: '2026-08-21T09:00:00Z',
    outcome: decided(
      'APPROVED',
      '2026-08-21T09:15:00Z',
      dave,
      '2026-08-21T14:00:00Z',
      'Approved',
    ),
    order: {
      id: PURCHASE_ORDER.aliceFullyReceived,
      by: carol,
      at: at('2026-08-22T09:00:00Z'),
      receipts: [
        receipt(
          PURCHASE_ORDER.aliceFullyReceived,
          1,
          carol,
          '2026-08-28T10:00:00Z',
          [0, 5],
        ),
        receipt(
          PURCHASE_ORDER.aliceFullyReceived,
          2,
          carol,
          '2026-08-28T15:00:00Z',
          [0, -1, 'One laptop was the wrong model and went back to TechWorld.'],
        ),
        receipt(
          PURCHASE_ORDER.aliceFullyReceived,
          3,
          carol,
          '2026-09-03T11:00:00Z',
          [0, 1, 'Replacement laptop delivered.'],
        ),
      ],
    },
  }),
  acme({
    id: REQUISITION.paulaClosed,
    by: paula,
    cost: 'OPS',
    why: 'Paper and folders for the audit',
    lines: lines([CATALOG_ITEM.mainPaper, 20], [ACME.folders.id, 10]),
    created: '2026-08-24T09:00:00Z',
    outcome: decided(
      'APPROVED',
      '2026-08-24T09:10:00Z',
      dave,
      '2026-08-24T13:00:00Z',
      null,
    ),
    order: {
      id: PURCHASE_ORDER.paulaClosed,
      by: carol,
      at: at('2026-08-25T09:00:00Z'),
      lines: [
        {
          catalogItemId: CATALOG_ITEM.mainPaper,
          quantity: 20,
          unitPriceMinor: 2399,
        },
        { catalogItemId: ACME.folders.id, quantity: 10, unitPriceMinor: 1560 },
      ],
      receipts: [
        receipt(
          PURCHASE_ORDER.paulaClosed,
          1,
          carol,
          '2026-08-31T09:00:00Z',
          [0, 20],
          [1, 10],
        ),
      ],
      closure: { by: carol, at: at('2026-09-01T09:00:00Z') },
    },
  }),

  nordic({
    id: REQUISITION.fridaApproved,
    by: frida,
    cost: 'OPS',
    why: 'Paper for the spring',
    lines: lines([CATALOG_ITEM.sekPaper, 1]),
    created: '2026-01-12T09:00:00Z',
    outcome: decided(
      'APPROVED',
      '2026-01-12T09:10:00Z',
      erik,
      '2026-01-13T08:00:00Z',
      SEK_APPROVAL_NOTE,
    ),
    order: {
      id: PURCHASE_ORDER.fridaPaper,
      by: erik,
      at: at('2026-01-14T09:00:00Z'),
      receipts: [
        {
          id: '00000000-0000-4000-8000-000000000111',
          by: erik,
          at: at('2026-01-20T09:00:00Z'),
          lines: [{ position: 0, quantity: 1, note: null }],
        },
      ],
      closure: { by: erik, at: at('2026-01-21T09:00:00Z') },
    },
  }),
  nordic({
    id: REQUISITION.fridaAdminRoute,
    by: frida,
    cost: 'SALES',
    why: 'Laptops for the new sales team',
    lines: lines([NORDIC.laptop.id, 2]),
    created: '2026-08-25T09:00:00Z',
    outcome: submitted('2026-08-25T09:20:00Z'),
  }),
  nordic({
    id: REQUISITION.fridaAutoApproved,
    by: frida,
    cost: 'OPS',
    why: 'Paper and pens for the autumn campaign',
    lines: lines([CATALOG_ITEM.sekPaper, 10], [NORDIC.pens.id, 5]),
    created: '2026-08-22T09:00:00Z',
    outcome: autoApproved('2026-08-22T09:15:00Z'),
    order: {
      id: PURCHASE_ORDER.fridaAutoApproved,
      by: kerstin,
      at: at('2026-08-23T09:00:00Z'),
      receipts: [],
    },
  }),

  mega({
    id: REQUISITION.ivanUnderThreshold,
    by: ivan,
    cost: 'PLANT1',
    why: 'Manual pallet jack for the loading bay',
    lines: lines([MEGA.palletJack.id, 1]),
    created: '2026-08-04T09:00:00Z',
    outcome: autoApproved('2026-08-04T09:10:00Z'),
  }),
  mega({
    id: REQUISITION.ivanAtThreshold,
    by: ivan,
    cost: 'PLANT1',
    why: 'Safety goggles for the new shift',
    lines: lines([MEGA.goggles.id, 40]),
    created: '2026-08-05T09:00:00Z',
    outcome: submitted('2026-08-05T09:10:00Z'),
  }),
  mega({
    id: REQUISITION.lukasOverThreshold,
    by: lukas,
    cost: 'PLANT2',
    why: 'Gloves for the maintenance crew',
    lines: lines([MEGA.gloves.id, 19], [MEGA.weldingGloves.id, 1]),
    created: '2026-08-06T09:00:00Z',
    outcome: decided(
      'APPROVED',
      '2026-08-06T09:10:00Z',
      hanna,
      '2026-08-07T08:00:00Z',
      'Approved. Keep the delivery note for the audit.',
    ),
    order: {
      id: PURCHASE_ORDER.lukasOverThreshold,
      by: jonas,
      at: at('2026-08-08T09:00:00Z'),
      receipts: [],
    },
  }),
  mega({
    id: REQUISITION.gustavOwn,
    by: gustav,
    cost: 'IT',
    why: 'Vacuum cleaners for the plant offices',
    lines: lines([MEGA.vacuum.id, 2]),
    created: '2026-08-18T09:00:00Z',
    outcome: submitted('2026-08-18T09:10:00Z'),
  }),
  mega({
    id: REQUISITION.ivanAdminRoute,
    by: ivan,
    cost: 'IT',
    why: 'Workstations for the CAD team',
    lines: lines([MEGA.workstation.id, 2]),
    created: '2026-08-20T09:00:00Z',
    outcome: submitted('2026-08-20T09:10:00Z'),
  }),
  mega({
    id: REQUISITION.ivanRejected,
    by: ivan,
    cost: 'PLANT2',
    why: 'Extra shelving for the spare parts store',
    lines: lines([MEGA.shelving.id, 5]),
    created: '2026-08-09T09:00:00Z',
    outcome: decided(
      'REJECTED',
      '2026-08-09T09:10:00Z',
      hanna,
      '2026-08-10T08:30:00Z',
      'The shelving is already budgeted under the Plant 2 expansion.',
    ),
  }),
];

export const reference: Reference = {
  companies,
  people,
  memberships,
  costCenters,
  suppliers,
  catalogItems,
  approvalRules,
  pushDevices,
  audit: referenceAudit,
};
