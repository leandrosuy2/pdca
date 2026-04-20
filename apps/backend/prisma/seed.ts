/**
 * Seed completo: apaga transações, acessos, dashboards, unidades, categorias e usuários,
 * recria cenário rico para dashboards, importação, inteligência admin e ranking.
 * Não execute em produção com dados reais que devam ser preservados.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEMO_PASSWORD = '123456';
/** Meses de histórico (inteligência YoY + trimestres) */
const MONTHS_HISTORY = 24;

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

type UserRow = { id: string; name: string; email: string };

type SeedProfile = {
  unidades: string[];
  extraDashboard?: boolean;
  /** Multiplicador de receitas (ranking) */
  receitaScale: number;
  /** Meses efetivos (ex.: Ana com menos histórico) */
  months?: number;
};

async function seedUserData(owner: UserRow, profile: SeedProfile) {
  const months = profile.months ?? MONTHS_HISTORY;
  const sc = profile.receitaScale;

  const unidadeRecords = await Promise.all(
    profile.unidades.map((name) =>
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
    { name: 'FOPEG', type: 'DESPESA' },
    { name: 'TURNOVER_OPERACIONAL', type: 'DESPESA' },
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
      template: 'RESTAURANTE',
      isDefault: true,
    },
  });

  if (profile.extraDashboard) {
    await prisma.dashboard.create({
      data: {
        name: `Operações — ${owner.name}`,
        slug: `${slugBase(owner.name)}-ops-${owner.id.slice(0, 6)}`,
        description: 'Visão operacional adicional',
        ownerId: owner.id,
        template: 'RESTAURANTE',
        isDefault: false,
      },
    });
  }

  const now = new Date();
  const transacoes: Prisma.TransacaoCreateManyInput[] = [];

  for (let m = 0; m < months; m += 1) {
    const monthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - m), 12, 12, 0, 0, 0));
    const monthLabel = monthDate.toISOString().slice(0, 7);
    const trend = 1 + m * 0.012;

    for (const un of unidadeRecords) {
      const g = gestoras[Math.floor(Math.random() * gestoras.length)];

      transacoes.push({
        userId: owner.id,
        unidadeId: un.id,
        categoriaId: catByName('Serviços Prestados').id,
        type: 'RECEITA',
        amount: Math.round(randomBetween(22000, 58000) * sc * trend * 100) / 100,
        date: monthDate,
        description: `Faturamento serviços ${monthLabel}`,
        gestora: g,
      });

      transacoes.push({
        userId: owner.id,
        unidadeId: un.id,
        categoriaId: catByName('Vendas de Produtos').id,
        type: 'RECEITA',
        amount: Math.round(randomBetween(5000, 26000) * sc * trend * 100) / 100,
        date: monthDate,
        description: `Vendas produtos ${monthLabel}`,
        gestora: g,
      });

      transacoes.push({
        userId: owner.id,
        unidadeId: un.id,
        categoriaId: catByName('Outras Receitas').id,
        type: 'RECEITA',
        amount: Math.round(randomBetween(800, 5200) * sc * trend * 100) / 100,
        date: monthDate,
        description: `Receitas diversas ${monthLabel}`,
        gestora: g,
      });

      const headcount = 10 + Math.floor(Math.random() * 22);
      transacoes.push({
        userId: owner.id,
        unidadeId: un.id,
        categoriaId: catByName('PROVENTOS').id,
        type: 'DESPESA',
        amount: Math.round(randomBetween(38000, 92000) * sc * 100) / 100,
        date: monthDate,
        description: g,
        gestora: g,
        qtdFunc: headcount,
      });

      transacoes.push({
        userId: owner.id,
        unidadeId: un.id,
        categoriaId: catByName('ENCARGOS FOLHA').id,
        type: 'DESPESA',
        amount: Math.round(randomBetween(9000, 32000) * sc * 100) / 100,
        date: monthDate,
        description: g,
        gestora: g,
        qtdFunc: headcount,
      });

      transacoes.push({
        userId: owner.id,
        unidadeId: un.id,
        categoriaId: catByName('FOPEG').id,
        type: 'DESPESA',
        amount: Math.round(randomBetween(4000, 18000) * sc * 100) / 100,
        date: monthDate,
        description: `FOPEG ${monthLabel}`,
        gestora: g,
        qtdFunc: headcount,
      });

      transacoes.push({
        userId: owner.id,
        unidadeId: un.id,
        categoriaId: catByName('TURNOVER_OPERACIONAL').id,
        type: 'DESPESA',
        amount: Math.round(randomBetween(2500, 12000) * sc * 100) / 100,
        date: monthDate,
        description: `Turnover ${monthLabel}`,
        gestora: g,
      });

      transacoes.push({
        userId: owner.id,
        unidadeId: un.id,
        categoriaId: catByName('Infraestrutura e TI').id,
        type: 'DESPESA',
        amount: Math.round(randomBetween(2200, 14000) * sc * 100) / 100,
        date: monthDate,
        description: `Cloud ${monthLabel}`,
        gestora: g,
      });

      transacoes.push({
        userId: owner.id,
        unidadeId: un.id,
        categoriaId: catByName('Marketing e Vendas').id,
        type: 'DESPESA',
        amount: Math.round(randomBetween(1800, 10000) * sc * 100) / 100,
        date: monthDate,
        description: `Marketing ${monthLabel}`,
        gestora: g,
      });

      transacoes.push({
        userId: owner.id,
        unidadeId: un.id,
        categoriaId: catByName('Fornecedores Gerais').id,
        type: 'DESPESA',
        amount: Math.round(randomBetween(3500, 20000) * sc * 100) / 100,
        date: monthDate,
        description: `Fornecedores ${monthLabel}`,
        gestora: g,
      });

      transacoes.push({
        userId: owner.id,
        unidadeId: un.id,
        categoriaId: catByName('Utilidades e Consumo').id,
        type: 'DESPESA',
        amount: Math.round(randomBetween(900, 6000) * sc * 100) / 100,
        date: monthDate,
        description: `Utilidades ${monthLabel}`,
        gestora: g,
      });
    }
  }

  await prisma.transacao.createMany({ data: transacoes });

  return {
    dashDefault,
    unidades: unidadeRecords.length,
    categorias: categorias.length,
    transacoes: transacoes.length,
  };
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
      template: 'RESTAURANTE',
      active: true,
    },
  });

  const maria = await prisma.user.create({
    data: {
      email: 'maria.silva@pdca.com',
      name: 'Maria Silva',
      password: passwordHash,
      role: 'USER',
      template: 'RESTAURANTE',
      active: true,
    },
  });

  const joao = await prisma.user.create({
    data: {
      email: 'joao.souza@pdca.com',
      name: 'João Souza',
      password: passwordHash,
      role: 'USER',
      template: 'RESTAURANTE',
      active: true,
    },
  });

  const carlos = await prisma.user.create({
    data: {
      email: 'carlos.oliveira@pdca.com',
      name: 'Carlos Oliveira',
      password: passwordHash,
      role: 'USER',
      template: 'RESTAURANTE',
      active: true,
    },
  });

  const pedro = await prisma.user.create({
    data: {
      email: 'pedro.lima@pdca.com',
      name: 'Pedro Lima',
      password: passwordHash,
      role: 'USER',
      template: 'RESTAURANTE',
      active: true,
    },
  });

  const ana = await prisma.user.create({
    data: {
      email: 'ana.santos@pdca.com',
      name: 'Ana Santos',
      password: passwordHash,
      role: 'USER',
      template: 'RESTAURANTE',
      active: true,
    },
  });

  await prisma.user.create({
    data: {
      email: 'inativo@pdca.com',
      name: 'Usuário Inativo',
      password: passwordHash,
      role: 'USER',
      template: 'RESTAURANTE',
      active: false,
    },
  });

  const adminStats = await seedUserData(admin, {
    unidades: ['Matriz Admin'],
    receitaScale: 0.35,
    months: MONTHS_HISTORY,
  });

  const mariaStats = await seedUserData(maria, {
    unidades: ['Unidade São Paulo', 'Unidade Rio de Janeiro', 'Unidade Curitiba'],
    extraDashboard: true,
    receitaScale: 1,
    months: MONTHS_HISTORY,
  });

  const joaoStats = await seedUserData(joao, {
    unidades: ['Hub João — Sul', 'Hub João — Norte'],
    receitaScale: 1.45,
    months: MONTHS_HISTORY,
  });

  const carlosStats = await seedUserData(carlos, {
    unidades: ['Centro BH', 'Filial Vitória'],
    receitaScale: 0.85,
    months: MONTHS_HISTORY,
  });

  const pedroStats = await seedUserData(pedro, {
    unidades: ['Loja Pedro'],
    receitaScale: 0.5,
    months: MONTHS_HISTORY,
  });

  const anaStats = await seedUserData(ana, {
    unidades: ['Projeto Ana'],
    receitaScale: 0.55,
    months: 14,
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
      description: 'Dashboard extra do administrador',
      ownerId: admin.id,
      template: 'RESTAURANTE',
      isDefault: false,
    },
  });

  const summary = await prisma.user.count();
  const tx = await prisma.transacao.count();
  const dash = await prisma.dashboard.count();
  const access = await prisma.dashboardAccess.count();

  console.log('');
  console.log('=== Seed PDCA concluído ===');
  console.log(`Histórico: ${MONTHS_HISTORY} meses (Ana: 14 meses) | Categorias: FOPEG + TURNOVER_OPERACIONAL para inteligência admin.`);
  console.log(`Usuários: ${summary} | Transações: ${tx} | Dashboards: ${dash} | Acessos: ${access}`);
  console.log('');
  console.log(`Senha de todos: ${DEMO_PASSWORD}`);
  console.log('  admin@pdca.com           ADMIN  (dados leves)');
  console.log('  joao.souza@pdca.com      USER   (maior faturamento — ranking)');
  console.log('  maria.silva@pdca.com     USER   (3 unidades, 2 dashboards)');
  console.log('  carlos.oliveira@pdca.com USER');
  console.log('  pedro.lima@pdca.com      USER   (menor escala — ranking)');
  console.log('  ana.santos@pdca.com      USER   (VIEW dashboard Maria)');
  console.log('  inativo@pdca.com         inativo');
  console.log('');
  console.log(`Transações: admin ${adminStats.transacoes} | maria ${mariaStats.transacoes} | joão ${joaoStats.transacoes} | carlos ${carlosStats.transacoes} | pedro ${pedroStats.transacoes} | ana ${anaStats.transacoes}`);
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
