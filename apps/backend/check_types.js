const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.transacao.findMany().then(c => console.log([...new Set(c.map(t => t.type))])).finally(() => prisma.$disconnect());
