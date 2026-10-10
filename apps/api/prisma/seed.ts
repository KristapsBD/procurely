import { PrismaClient } from '@prisma/client';
import { insertAll } from './seed-insert';
import { seedRows } from './seed-rows';

// Runs as the database owner (DIRECT_URL): the API role cannot write these tables.
async function main() {
  const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });
  try {
    await insertAll(prisma, seedRows());
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
