const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.categoria.findMany({ include: { transacoes: true } }).then(c => {
  c.forEach(cat => {
    const sum = cat.transacoes.reduce((a, b) => a + b.amount, 0);
    const tipo = cat.transacoes.length > 0 ? cat.transacoes[0].type : 'N/A';
    console.log(`${cat.name}: ${sum} (${tipo})`);
  });
}).finally(() => prisma.$disconnect());
