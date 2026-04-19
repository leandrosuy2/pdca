const { PrismaClient } = require('./node_modules/@prisma/client');
const p = new PrismaClient();

(async () => {
  const dashboards = await p.dashboard.findMany({
    include: {
      owner: { select: { id: true, name: true, email: true, role: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const users = await p.user.findMany({
    select: { id: true, name: true, email: true, role: true, active: true },
    orderBy: { createdAt: 'asc' },
  });

  const transByUser = await p.transacao.groupBy({
    by: ['userId'],
    _count: { _all: true },
    _sum: { amount: true },
    _max: { updatedAt: true, createdAt: true },
  });

  const transMap = new Map(transByUser.map((x) => [x.userId, x]));

  console.log('=== USERS ===');
  for (const u of users) {
    const t = transMap.get(u.id);
    console.log(JSON.stringify({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active,
      transacoes: t?._count?._all || 0,
      soma: t?._sum?.amount || 0,
      maxUpdatedAt: t?._max?.updatedAt || null,
    }));
  }

  console.log('\n=== DASHBOARDS ===');
  for (const d of dashboards) {
    const t = transMap.get(d.ownerId);
    console.log(JSON.stringify({
      dashboardId: d.id,
      dashboardName: d.name,
      isDefault: d.isDefault,
      ownerId: d.ownerId,
      ownerName: d.owner?.name,
      ownerEmail: d.owner?.email,
      ownerRole: d.owner?.role,
      transacoesOwner: t?._count?._all || 0,
      somaOwner: t?._sum?.amount || 0,
      maxUpdatedAtOwner: t?._max?.updatedAt || null,
    }));
  }
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await p.$disconnect();
  });
