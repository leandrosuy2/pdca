const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

prisma.transacao.groupBy({
  by: ['type'],
  _sum: { amount: true }
}).then(res => {
  console.log("Tipos reais no banco de dados atualmente:");
  console.log(res);
}).finally(() => prisma.$disconnect());
