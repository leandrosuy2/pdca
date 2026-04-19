const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.categoria.findMany().then(c => console.log(c.map(x => x.name).join(', '))).finally(() => prisma.$disconnect());
