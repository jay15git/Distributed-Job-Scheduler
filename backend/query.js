const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const jobs = await prisma.job.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' }
  });
  console.log(jobs);
}

main().finally(() => prisma.$disconnect());
