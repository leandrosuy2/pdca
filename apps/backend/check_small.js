const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.transacao.findMany({ where: { amount: { lt: 10, gt: 0 } } }).then(c => console.log(c.map(x => x.amount))).finally(() => prisma.$disconnect());
