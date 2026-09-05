const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  console.log('Inserting alice...');
  const hash = await bcrypt.hash('password123', 10);
  
  const existingUser = await prisma.user.findUnique({ where: { email: 'alice@acme.com' } });
  if (existingUser) {
    await prisma.user.update({
      where: { email: 'alice@acme.com' },
      data: { passwordHash: hash }
    });
    console.log('Alice updated.');
  } else {
    await prisma.user.create({
      data: {
        email: 'alice@acme.com',
        name: 'Alice Admin',
        passwordHash: hash,
        isVerified: true
      }
    });
    console.log('Alice created.');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
