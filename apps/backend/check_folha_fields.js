const { PrismaClient } = require('./node_modules/@prisma/client');
const p = new PrismaClient();

(async () => {
  const users = await p.user.findMany({ select: { id:true, name:true } });
  for (const u of users) {
    const despesas = await p.transacao.findMany({
      where: { userId: u.id, type: 'DESPESA' },
      include: { categoria: true, unidade: true },
      orderBy: { amount: 'desc' },
      take: 40,
    });

    if (!despesas.length) continue;

    console.log('\nUSER', u.name);
    const catStats = {};
    for (const d of despesas) {
      const k = d.categoria?.name || 'SEM';
      catStats[k] = (catStats[k] || 0) + 1;
    }
    console.log('categorias(top sample):', catStats);
    for (const d of despesas.slice(0, 12)) {
      console.log(JSON.stringify({
        unidade: d.unidade?.name,
        categoria: d.categoria?.name,
        descricao: d.description,
        valor: d.amount,
        qtdFunc: d.qtdFunc,
        data: d.date.toISOString().slice(0,10),
      }));
    }
  }
})().finally(()=>p.$disconnect());
