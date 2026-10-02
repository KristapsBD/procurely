import { PrismaClient } from '@prisma/client';

// Destructive: drops everything in the public schema (tables, types, functions, migration
// history). The API role is cluster-wide and survives; the RLS migration recreates its grants.
// Refuses to run against anything but a local or compose database.
const LOCAL_HOSTS = ['localhost', '127.0.0.1', 'db'];

async function main() {
  const url = process.env.DIRECT_URL;
  if (!url) throw new Error('DIRECT_URL is not set');
  const { hostname } = new URL(url);
  if (!LOCAL_HOSTS.includes(hostname)) {
    throw new Error(`Refusing to reset a non-local database (${hostname})`);
  }
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
    await prisma.$executeRawUnsafe('CREATE SCHEMA public');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
