const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.queue.findMany().then(console.log).catch(console.error).finally(() => prisma.$disconnect());
