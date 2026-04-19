const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.transacao.findMany({ select: { id: true, categoria: { select: { name: true } }, amount: true } }).then(c => {
  const cats = {};
  c.forEach(x => { cats[x.categoria.name] = (cats[x.categoria.name] || 0) + x.amount; });
  console.log(cats);
}).finally(() => prisma.$disconnect());
