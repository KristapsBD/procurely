import { PrismaClient } from '@prisma/client';
import { companies, costCenters, memberships, people } from './seed-data';

// Runs as the database owner (DIRECT_URL): the API role cannot write these tables.
async function main() {
  const prisma = new PrismaClient({
    datasourceUrl: process.env.DIRECT_URL,
  });
  try {
    await prisma.company.createMany({ data: companies, skipDuplicates: true });
    await prisma.person.createMany({ data: people, skipDuplicates: true });
    await prisma.membership.createMany({
      data: memberships,
      skipDuplicates: true,
    });
    await prisma.costCenter.createMany({
      data: costCenters,
      skipDuplicates: true,
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
