/**
 * Seed completo: apaga transações, acessos, dashboards, unidades, categorias e usuários,
 * depois recria cenário de demonstração (vários usuários, dashboards, folha, gestoras).
 * Não execute em produção com dados reais que devam ser preservados.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEMO_PASSWORD = '123456';

const gestoras = ['Carla Mendes', 'Roberto Dias', 'Fernanda Costa', 'Equipe Central'];

function slugBase(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

async function wipeAll() {
  await prisma.transacao.deleteMany();
  await prisma.dashboardAccess.deleteMany();
  await prisma.dashboard.deleteMany();
  await prisma.unidade.deleteMany();
  await prisma.categoria.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  await wipeAll();

  const admin = await prisma.user.create({
    data: {
      email: 'admin@pdca.com',
      name: 'Administrador PDCA',
      password: passwordHash,
      role: 'ADMIN',
      active: true,
    },
  });

  const maria = await prisma.user.create({
    data: {
      email: 'maria.silva@pdca.com',
      name: 'Maria Silva',
      password: passwordHash,
      role: 'USER',
      active: true,
    },
  });

  const carlos = await prisma.user.create({
    data: {
      email: 'carlos.oliveira@pdca.com',
      name: 'Carlos Oliveira',
      password: passwordHash,
      role: 'USER',
      active: true,
    },
  });

  const ana = await prisma.user.create({
    data: {
      email: 'ana.santos@pdca.com',
      name: 'Ana Santos',
      password: passwordHash,
      role: 'USER',
      active: true,
    },
  });

  await prisma.user.create({
    data: {
      email: 'inativo@pdca.com',
      name: 'Usuário Inativo',
      password: passwordHash,
      role: 'USER',
      active: false,
    },
  });

  type UserSeed = typeof admin | typeof maria | typeof carlos;

  async function seedUserData(owner: UserSeed, config: { unidades: string[]; extraDashboard?: boolean }) {
    const unidadeRecords = await Promise.all(
      config.unidades.map((name) =>
        prisma.unidade.create({
          data: { name, userId: owner.id },
        }),
      ),
    );

    const catDefs: { name: string; type: string }[] = [
      { name: 'Serviços Prestados', type: 'RECEITA' },
      { name: 'Vendas de Produtos', type: 'RECEITA' },
      { name: 'Outras Receitas', type: 'RECEITA' },
      { name: 'PROVENTOS', type: 'DESPESA' },
      { name: 'ENCARGOS FOLHA', type: 'DESPESA' },
      { name: 'Infraestrutura e TI', type: 'DESPESA' },
      { name: 'Marketing e Vendas', type: 'DESPESA' },
      { name: 'Fornecedores Gerais', type: 'DESPESA' },
      { name: 'Utilidades e Consumo', type: 'DESPESA' },
    ];

    const categorias = await Promise.all(
      catDefs.map((c) =>
        prisma.categoria.create({
          data: { name: c.name, type: c.type, userId: owner.id },
        }),
      ),
    );

    const catByName = (n: string) => categorias.find((c) => c.name === n)!;

    const slugDefault = `${slugBase(owner.name || owner.email)}-${owner.id.slice(0, 8)}`;
    const dashDefault = await prisma.dashboard.create({
      data: {
        name: `Dashboard — ${owner.name}`,
        slug: slugDefault,
        description: 'Dashboard principal (padrão)',
        ownerId: owner.id,
        isDefault: true,
      },
    });

    if (config.extraDashboard) {
      await prisma.dashboard.create({
        data: {
          name: `Operações — ${owner.name}`,
          slug: `${slugBase(owner.name)}-ops-${owner.id.slice(0, 6)}`,
          description: 'Visão operacional adicional',
          ownerId: owner.id,
          isDefault: false,
        },
      });
    }

    const now = new Date();
    const transacoes: Parameters<typeof prisma.transacao.createMany>[0]['data'] = [];

    for (let m = 0; m < 8; m += 1) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (7 - m), 15, 12, 0, 0, 0));
      const monthLabel = d.toISOString().slice(0, 7);

      for (const un of unidadeRecords) {
        const g = gestoras[Math.floor(Math.random() * gestoras.length)];

        transacoes.push({
          userId: owner.id,
          unidadeId: un.id,
          categoriaId: catByName('Serviços Prestados').id,
          type: 'RECEITA',
          amount: Math.round(randomBetween(18000, 52000) * 100) / 100,
          date: d,
          description: `Faturamento serviços ${monthLabel}`,
          gestora: g,
        });

        transacoes.push({
          userId: owner.id,
          unidadeId: un.id,
          categoriaId: catByName('Vendas de Produtos').id,
          type: 'RECEITA',
          amount: Math.round(randomBetween(4000, 22000) * 100) / 100,
          date: d,
          description: `Vendas produtos ${monthLabel}`,
          gestora: g,
        });

        transacoes.push({
          userId: owner.id,
          unidadeId: un.id,
          categoriaId: catByName('Outras Receitas').id,
          type: 'RECEITA',
          amount: Math.round(randomBetween(500, 4500) * 100) / 100,
          date: d,
          description: `Receitas diversas ${monthLabel}`,
          gestora: g,
        });

        const headcount = 8 + Math.floor(Math.random() * 25);
        transacoes.push({
          userId: owner.id,
          unidadeId: un.id,
          categoriaId: catByName('PROVENTOS').id,
          type: 'DESPESA',
          amount: Math.round(randomBetween(35000, 95000) * 100) / 100,
          date: d,
          description: g,
          gestora: g,
          qtdFunc: headcount,
        });

        transacoes.push({
          userId: owner.id,
          unidadeId: un.id,
          categoriaId: catByName('ENCARGOS FOLHA').id,
          type: 'DESPESA',
          amount: Math.round(randomBetween(8000, 28000) * 100) / 100,
          date: d,
          description: g,
          gestora: g,
          qtdFunc: headcount,
        });

        transacoes.push({
          userId: owner.id,
          unidadeId: un.id,
          categoriaId: catByName('Infraestrutura e TI').id,
          type: 'DESPESA',
          amount: Math.round(randomBetween(2000, 12000) * 100) / 100,
          date: d,
          description: `Cloud e licenças ${monthLabel}`,
          gestora: g,
        });

        transacoes.push({
          userId: owner.id,
          unidadeId: un.id,
          categoriaId: catByName('Marketing e Vendas').id,
          type: 'DESPESA',
          amount: Math.round(randomBetween(1500, 9000) * 100) / 100,
          date: d,
          description: `Campanhas ${monthLabel}`,
          gestora: g,
        });

        transacoes.push({
          userId: owner.id,
          unidadeId: un.id,
          categoriaId: catByName('Fornecedores Gerais').id,
          type: 'DESPESA',
          amount: Math.round(randomBetween(3000, 18000) * 100) / 100,
          date: d,
          description: `Fornecedores ${monthLabel}`,
          gestora: g,
        });

        transacoes.push({
          userId: owner.id,
          unidadeId: un.id,
          categoriaId: catByName('Utilidades e Consumo').id,
          type: 'DESPESA',
          amount: Math.round(randomBetween(800, 5500) * 100) / 100,
          date: d,
          description: `Consumo ${monthLabel}`,
          gestora: g,
        });
      }
    }

    await prisma.transacao.createMany({ data: transacoes });

    return { dashDefault, unidades: unidadeRecords.length, categorias: categorias.length, transacoes: transacoes.length };
  }

  const mariaStats = await seedUserData(maria, {
    unidades: ['Unidade São Paulo', 'Unidade Rio de Janeiro', 'Unidade Curitiba'],
    extraDashboard: true,
  });

  const carlosStats = await seedUserData(carlos, {
    unidades: ['Centro BH', 'Filial Vitória'],
    extraDashboard: false,
  });

  await prisma.dashboardAccess.create({
    data: {
      dashboardId: mariaStats.dashDefault.id,
      userId: ana.id,
      permission: 'VIEW',
    },
  });

  await prisma.dashboard.create({
    data: {
      name: 'Painel consolidado (admin)',
      slug: `admin-visao-${admin.id.slice(0, 8)}`,
      description: 'Dashboard extra do administrador para testes',
      ownerId: admin.id,
      isDefault: false,
    },
  });

  const summary = await prisma.user.count();
  const tx = await prisma.transacao.count();
  const dash = await prisma.dashboard.count();
  const access = await prisma.dashboardAccess.count();

  console.log('');
  console.log('=== Seed PDCA concluído ===');
  console.log(`Usuários: ${summary} | Transações: ${tx} | Dashboards: ${dash} | Acessos compartilhados: ${access}`);
  console.log('');
  console.log('Credenciais (todos com a mesma senha de demonstração):');
  console.log(`  Senha: ${DEMO_PASSWORD}`);
  console.log('  admin@pdca.com          — ADMIN');
  console.log('  maria.silva@pdca.com    — USER (3 unidades, 2 dashboards, muitas transações)');
  console.log('  carlos.oliveira@pdca.com — USER (2 unidades)');
  console.log('  ana.santos@pdca.com     — USER (VIEW no dashboard principal da Maria)');
  console.log('  inativo@pdca.com        — USER inativo (não consegue login)');
  console.log('');
  console.log(`Maria: ${mariaStats.unidades} unidades, ${mariaStats.categorias} categorias, ${mariaStats.transacoes} transações.`);
  console.log(`Carlos: ${carlosStats.unidades} unidades, ${carlosStats.categorias} categorias, ${carlosStats.transacoes} transações.`);
  console.log('');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
