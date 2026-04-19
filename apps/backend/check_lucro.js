const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const transactions = await prisma.transacao.findMany({
    include: { categoria: true, unidade: true }
  });

  const units = {};

  transactions.forEach(t => {
    const u = t.unidade.name;
    if (!units[u]) units[u] = { rec: 0, des: 0, fop: 0, div: 0 };
    
    if (t.type === 'RECEITA') units[u].rec += t.amount;
    else {
      units[u].des += t.amount;
      if (t.categoria.name.includes('Folha') || t.categoria.name.includes('Proventos')) {
        units[u].fop += t.amount;
      }
      if (t.categoria.name === 'Diversos') {
        units[u].div += t.amount;
      }
    }
  });

  for (const [u, vals] of Object.entries(units)) {
    console.log(`${u}: REC=${vals.rec.toFixed(0)}, DES=${vals.des.toFixed(0)}, LUCRO=${(vals.rec - vals.des).toFixed(0)}, FOP=${vals.fop.toFixed(0)}, DIV=${vals.div.toFixed(0)}`);
  }
}

check().then(() => prisma.$disconnect());
