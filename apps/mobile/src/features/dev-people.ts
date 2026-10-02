/**
 * Quick picks for the dev login: a few of the seeded people, by their stable ids. Mirrors the
 * story layer in apps/api/prisma/seed-data.ts; the login screen also accepts any other id.
 */
export const DEV_PEOPLE = [
  {
    id: '00000000-0000-4000-8000-0000000000b1',
    name: 'Alice',
    note: 'requester in Acme Trading, approver in Nordic Supplies',
  },
  {
    id: '00000000-0000-4000-8000-0000000000b3',
    name: 'Carol',
    note: 'buyer',
  },
  {
    id: '00000000-0000-4000-8000-0000000000ba',
    name: 'Nomad',
    note: 'belongs to no company',
  },
  {
    id: '00000000-0000-4000-8000-0000000000bc',
    name: 'Mallory',
    note: 'belongs only to the empty company',
  },
];
