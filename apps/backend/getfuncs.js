const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.transacao.findMany({ where: { qtdFunc: { not: null } } }).then(c => console.log(c.map(x => `${x.unidadeId}: ${x.qtdFunc}`).join('\n'))).finally(() => prisma.$disconnect());
