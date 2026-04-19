const { PrismaClient } = require('./node_modules/@prisma/client');
const p = new PrismaClient();

(async () => {
  const users = await p.user.findMany({ select: { id: true, name: true, email: true, role: true, active: true } });
  const dashboards = await p.dashboard.findMany({ select: { id: true, name: true, ownerId: true, isDefault: true } });
  const access = await p.dashboardAccess.findMany({ select: { dashboardId: true, userId: true, permission: true } });
  const totals = await p.transacao.groupBy({ by: ['userId'], _count: { _all: true } });

  console.log('USERS', users.length);
  console.log(JSON.stringify(users, null, 2));
  console.log('DASHBOARDS', dashboards.length);
  console.log(JSON.stringify(dashboards, null, 2));
  console.log('ACCESS', access.length);
  console.log(JSON.stringify(access, null, 2));
  console.log('TRANS_BY_USER');
  console.log(JSON.stringify(totals, null, 2));
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await p.$disconnect();
  });
