const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const t = await prisma.transacao.findMany({ include: { unidade: true, categoria: true } });
  
  // Find very large transactions
  const large = t.filter(x => x.amount > 50000);
  console.log('--- Transactions > 50k ---');
  large.forEach(x => console.log(`${x.unidade.name} - ${x.categoria.name}: ${x.amount} (${x.type})`));
  
  const vand = t.filter(x => x.unidade.name === 'VANDERLEY');
  console.log('--- Vanderley ---');
  vand.forEach(x => console.log(`${x.unidade.name} - ${x.categoria.name}: ${x.amount} (${x.type})`));
}

check().then(() => prisma.$disconnect());
