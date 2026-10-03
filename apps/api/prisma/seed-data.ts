// Story layer of the seed: hand-written, with stable identifiers so tests, demos
// and agents can refer to named cases. Dev-login signs in by person id.

export type SeedRole = 'REQUESTER' | 'APPROVER' | 'BUYER' | 'ADMIN';

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
} as const;

export const companies = [
  { id: COMPANY.main, name: 'Acme Trading', currency: 'EUR' },
  { id: COMPANY.sek, name: 'Nordic Supplies', currency: 'SEK' },
  { id: COMPANY.large, name: 'Megacorp Industries', currency: 'EUR' },
  { id: COMPANY.empty, name: 'Fresh Start Ltd', currency: 'EUR' },
];

export const people = [
  { id: PERSON.alice, email: 'alice@procurely.test', name: 'Alice Requester' },
  { id: PERSON.bob, email: 'bob@procurely.test', name: 'Bob Approver' },
  { id: PERSON.carol, email: 'carol@procurely.test', name: 'Carol Buyer' },
  { id: PERSON.dave, email: 'dave@procurely.test', name: 'Dave Admin' },
  { id: PERSON.erik, email: 'erik@procurely.test', name: 'Erik Admin' },
  { id: PERSON.frida, email: 'frida@procurely.test', name: 'Frida Requester' },
  { id: PERSON.gustav, email: 'gustav@procurely.test', name: 'Gustav Admin' },
  { id: PERSON.hanna, email: 'hanna@procurely.test', name: 'Hanna Approver' },
  { id: PERSON.ivan, email: 'ivan@procurely.test', name: 'Ivan Requester' },
  { id: PERSON.nomad, email: 'nomad@procurely.test', name: 'Nomad NoCompany' },
  {
    id: PERSON.oscar,
    email: 'oscar@procurely.test',
    name: 'Oscar Deactivated',
  },
  {
    id: PERSON.mallory,
    email: 'mallory@procurely.test',
    name: 'Mallory Attacker',
  },
];

export const memberships: {
  companyId: string;
  personId: string;
  role: SeedRole;
  active: boolean;
}[] = [
  {
    companyId: COMPANY.main,
    personId: PERSON.alice,
    role: 'REQUESTER',
    active: true,
  },
  {
    companyId: COMPANY.sek,
    personId: PERSON.alice,
    role: 'APPROVER',
    active: true,
  },
  {
    companyId: COMPANY.main,
    personId: PERSON.bob,
    role: 'APPROVER',
    active: true,
  },
  {
    companyId: COMPANY.main,
    personId: PERSON.carol,
    role: 'BUYER',
    active: true,
  },
  {
    companyId: COMPANY.main,
    personId: PERSON.dave,
    role: 'ADMIN',
    active: true,
  },
  {
    companyId: COMPANY.sek,
    personId: PERSON.erik,
    role: 'ADMIN',
    active: true,
  },
  {
    companyId: COMPANY.sek,
    personId: PERSON.frida,
    role: 'REQUESTER',
    active: true,
  },
  {
    companyId: COMPANY.large,
    personId: PERSON.gustav,
    role: 'ADMIN',
    active: true,
  },
  {
    companyId: COMPANY.large,
    personId: PERSON.hanna,
    role: 'APPROVER',
    active: true,
  },
  {
    companyId: COMPANY.large,
    personId: PERSON.ivan,
    role: 'REQUESTER',
    active: true,
  },
  {
    companyId: COMPANY.main,
    personId: PERSON.oscar,
    role: 'REQUESTER',
    active: false,
  },
  {
    companyId: COMPANY.empty,
    personId: PERSON.mallory,
    role: 'REQUESTER',
    active: true,
  },
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
];

// A few audit rows, enough for the audit log to have history in three companies.
export const auditLog = [
  {
    id: '00000000-0000-4000-8000-0000000000c1',
    companyId: COMPANY.main,
    actorPersonId: PERSON.dave,
    action: 'member.invited',
    entityType: 'membership',
    details: { email: 'alice@procurely.test', role: 'REQUESTER' },
  },
  {
    id: '00000000-0000-4000-8000-0000000000c2',
    companyId: COMPANY.main,
    actorPersonId: PERSON.dave,
    action: 'member.deactivated',
    entityType: 'membership',
    details: { email: 'oscar@procurely.test' },
  },
  {
    id: '00000000-0000-4000-8000-0000000000c3',
    companyId: COMPANY.sek,
    actorPersonId: PERSON.erik,
    action: 'member.invited',
    entityType: 'membership',
    details: { email: 'alice@procurely.test', role: 'APPROVER' },
  },
  {
    id: '00000000-0000-4000-8000-0000000000c4',
    companyId: COMPANY.large,
    actorPersonId: PERSON.gustav,
    action: 'member.invited',
    entityType: 'membership',
    details: { email: 'hanna@procurely.test', role: 'APPROVER' },
  },
];

export const SUPPLIER = {
  // The same supplier name in two companies, each with its own agreed prices.
  mainOffice: '00000000-0000-4000-8000-0000000000d1',
  sekOffice: '00000000-0000-4000-8000-0000000000d2',
  mainTech: '00000000-0000-4000-8000-0000000000d3',
  // Inactive: keeps its catalog item, but cannot be chosen for new work.
  mainInactive: '00000000-0000-4000-8000-0000000000d4',
} as const;

export const suppliers = [
  {
    id: SUPPLIER.mainOffice,
    companyId: COMPANY.main,
    name: 'Office Depot',
    active: true,
  },
  {
    id: SUPPLIER.sekOffice,
    companyId: COMPANY.sek,
    name: 'Office Depot',
    active: true,
  },
  {
    id: SUPPLIER.mainTech,
    companyId: COMPANY.main,
    name: 'TechWorld',
    active: true,
  },
  {
    id: SUPPLIER.mainInactive,
    companyId: COMPANY.main,
    name: 'Old Paper Mill',
    active: false,
  },
];

export const CATALOG_ITEM = {
  mainPaper: '00000000-0000-4000-8000-0000000000e1',
  sekPaper: '00000000-0000-4000-8000-0000000000e2',
  mainLaptop: '00000000-0000-4000-8000-0000000000e3',
  mainOldPaper: '00000000-0000-4000-8000-0000000000e4',
} as const;

// Prices are integer minor units of the company currency (EUR cents, SEK öre).
export const catalogItems = [
  {
    id: CATALOG_ITEM.mainPaper,
    companyId: COMPANY.main,
    supplierId: SUPPLIER.mainOffice,
    name: 'A4 copy paper, box of 5 reams',
    unitPriceMinor: 2499,
  },
  {
    id: CATALOG_ITEM.sekPaper,
    companyId: COMPANY.sek,
    supplierId: SUPPLIER.sekOffice,
    name: 'A4 copy paper, box of 5 reams',
    unitPriceMinor: 27900,
  },
  {
    id: CATALOG_ITEM.mainLaptop,
    companyId: COMPANY.main,
    supplierId: SUPPLIER.mainTech,
    name: 'Laptop 14"',
    unitPriceMinor: 119900,
  },
  {
    id: CATALOG_ITEM.mainOldPaper,
    companyId: COMPANY.main,
    supplierId: SUPPLIER.mainInactive,
    name: 'Recycled paper, box of 5 reams',
    unitPriceMinor: 1999,
  },
];
