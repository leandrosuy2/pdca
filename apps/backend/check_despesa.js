const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const transactions = await prisma.transacao.findMany({
    include: { categoria: true, unidade: true }
  });

  let rec = 0;
  let des = 0;
  const cats = {};

  transactions.forEach(t => {
    if (t.type === 'RECEITA') rec += t.amount;
    else {
      des += t.amount;
      const c = t.categoria.name;
      cats[c] = (cats[c] || 0) + t.amount;
    }
  });

  console.log(`Receita: ${rec}`);
  console.log(`Despesa: ${des}`);
  console.log('--- Despesas por Categoria ---');
  Object.entries(cats).sort((a,b) => b[1] - a[1]).forEach(([k, v]) => console.log(`${k}: ${v}`));
}

check().then(() => prisma.$disconnect());
