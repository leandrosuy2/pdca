/**
 * Seed base do sistema:
 * - recria a estrutura principal
 * - mantém um admin para gestão
 * - cria os dashboards das diretoras Ellen e Raiclene
 * - registra a hierarquia Gestora > Unidade para servir de base futura
 */
import { DashboardTemplate, Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEMO_PASSWORD = '123456';
const MONTHS_HISTORY = 12;

type UserRow = { id: string; name: string; email: string };

type GestoraSeed = {
  name: string;
  unidades: string[];
};

type SeedProfile = {
  dashboardName?: string;
  dashboardDescription?: string;
  gestoras: GestoraSeed[];
  receitaScale: number;
  months?: number;
};

function normalizeEmailPart(text: string) {
  return slugBase(text).replace(/-+/g, '.');
}

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
  await prisma.gestora.deleteMany();
  await prisma.categoria.deleteMany();
  await prisma.user.deleteMany();
}

async function seedUserData(owner: UserRow, profile: SeedProfile) {
  const months = profile.months ?? MONTHS_HISTORY;
  const receitaScale = profile.receitaScale;

  const gestoraRecords = await Promise.all(
    profile.gestoras.map((gestora) =>
      prisma.gestora.create({
        data: {
          name: gestora.name,
          userId: owner.id,
        },
      }),
    ),
  );

  const gestoraByName = new Map(gestoraRecords.map((gestora) => [gestora.name, gestora]));

  const unidadeRecords = await Promise.all(
    profile.gestoras.flatMap((gestora) =>
      gestora.unidades.map((unidade) =>
        prisma.unidade.create({
          data: {
            name: unidade,
            userId: owner.id,
            gestoraId: gestoraByName.get(gestora.name)!.id,
          },
        }),
      ),
    ),
  );

  const unidadesComGestora = unidadeRecords.map((unidade) => {
    const gestora = profile.gestoras.find((item) => item.unidades.includes(unidade.name));
    return {
      ...unidade,
      gestoraName: gestora?.name || owner.name,
    };
  });

  const catDefs: Array<{ name: string; type: 'RECEITA' | 'DESPESA' }> = [
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
    catDefs.map((categoria) =>
      prisma.categoria.create({
        data: {
          name: categoria.name,
          type: categoria.type,
          userId: owner.id,
        },
      }),
    ),
  );

  const catByName = (name: string) => categorias.find((categoria) => categoria.name === name)!;

  const dashDefault = await prisma.dashboard.create({
    data: {
      name: profile.dashboardName || `Dashboard de ${owner.name}`,
      slug: `${slugBase(owner.name || owner.email)}-${owner.id.slice(0, 8)}`,
      description: profile.dashboardDescription || 'Dashboard principal da diretora',
      ownerId: owner.id,
      template: 'RESTAURANTE',
      isDefault: true,
    },
  });

  const now = new Date();
  const transacoes: Prisma.TransacaoCreateManyInput[] = [];

  for (let m = 0; m < months; m += 1) {
    const monthDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - m), 12, 12, 0, 0, 0),
    );
    const monthLabel = monthDate.toISOString().slice(0, 7);
    const trend = 1 + m * 0.015;

    for (const unidade of unidadesComGestora) {
      const gestoraName = unidade.gestoraName;
      const headcount = 12 + Math.floor(Math.random() * 18);

      transacoes.push({
        userId: owner.id,
        unidadeId: unidade.id,
        categoriaId: catByName('Serviços Prestados').id,
        type: 'RECEITA',
        amount: Math.round(randomBetween(26000, 64000) * receitaScale * trend * 100) / 100,
        date: monthDate,
        description: `Faturamento serviços ${monthLabel}`,
        gestora: gestoraName,
      });

      transacoes.push({
        userId: owner.id,
        unidadeId: unidade.id,
        categoriaId: catByName('Vendas de Produtos').id,
        type: 'RECEITA',
        amount: Math.round(randomBetween(7000, 24000) * receitaScale * trend * 100) / 100,
        date: monthDate,
        description: `Receita complementar ${monthLabel}`,
        gestora: gestoraName,
      });

      transacoes.push({
        userId: owner.id,
        unidadeId: unidade.id,
        categoriaId: catByName('Outras Receitas').id,
        type: 'RECEITA',
        amount: Math.round(randomBetween(1000, 5000) * receitaScale * trend * 100) / 100,
        date: monthDate,
        description: `Outras receitas ${monthLabel}`,
        gestora: gestoraName,
      });

      transacoes.push({
        userId: owner.id,
        unidadeId: unidade.id,
        categoriaId: catByName('PROVENTOS').id,
        type: 'DESPESA',
        amount: Math.round(randomBetween(24000, 52000) * receitaScale * 100) / 100,
        date: monthDate,
        description: gestoraName,
        gestora: gestoraName,
        qtdFunc: headcount,
      });

      transacoes.push({
        userId: owner.id,
        unidadeId: unidade.id,
        categoriaId: catByName('ENCARGOS FOLHA').id,
        type: 'DESPESA',
        amount: Math.round(randomBetween(7000, 17000) * receitaScale * 100) / 100,
        date: monthDate,
        description: gestoraName,
        gestora: gestoraName,
        qtdFunc: headcount,
      });

      transacoes.push({
        userId: owner.id,
        unidadeId: unidade.id,
        categoriaId: catByName('FOPEG').id,
        type: 'DESPESA',
        amount: Math.round(randomBetween(3000, 9000) * receitaScale * 100) / 100,
        date: monthDate,
        description: `FOPEG ${monthLabel}`,
        gestora: gestoraName,
        qtdFunc: headcount,
      });

      transacoes.push({
        userId: owner.id,
        unidadeId: unidade.id,
        categoriaId: catByName('TURNOVER_OPERACIONAL').id,
        type: 'DESPESA',
        amount: Math.round(randomBetween(1800, 6500) * receitaScale * 100) / 100,
        date: monthDate,
        description: `Turnover ${monthLabel}`,
        gestora: gestoraName,
      });

      transacoes.push({
        userId: owner.id,
        unidadeId: unidade.id,
        categoriaId: catByName('Infraestrutura e TI').id,
        type: 'DESPESA',
        amount: Math.round(randomBetween(1600, 7200) * receitaScale * 100) / 100,
        date: monthDate,
        description: `Infraestrutura ${monthLabel}`,
        gestora: gestoraName,
      });

      transacoes.push({
        userId: owner.id,
        unidadeId: unidade.id,
        categoriaId: catByName('Marketing e Vendas').id,
        type: 'DESPESA',
        amount: Math.round(randomBetween(1400, 7800) * receitaScale * 100) / 100,
        date: monthDate,
        description: `Marketing ${monthLabel}`,
        gestora: gestoraName,
      });

      transacoes.push({
        userId: owner.id,
        unidadeId: unidade.id,
        categoriaId: catByName('Fornecedores Gerais').id,
        type: 'DESPESA',
        amount: Math.round(randomBetween(2600, 11000) * receitaScale * 100) / 100,
        date: monthDate,
        description: `Fornecedores ${monthLabel}`,
        gestora: gestoraName,
      });

      transacoes.push({
        userId: owner.id,
        unidadeId: unidade.id,
        categoriaId: catByName('Utilidades e Consumo').id,
        type: 'DESPESA',
        amount: Math.round(randomBetween(900, 4200) * receitaScale * 100) / 100,
        date: monthDate,
        description: `Utilidades ${monthLabel}`,
        gestora: gestoraName,
      });
    }
  }

  await prisma.transacao.createMany({ data: transacoes });

  return {
    dashDefault,
    owner,
    unidadeRecords,
    gestoras: gestoraRecords.length,
    unidades: unidadeRecords.length,
    categorias: categorias.length,
    transacoes: transacoes.length,
  };
}

async function createUnitEntryUsers(
  owner: UserRow & { template?: DashboardTemplate },
  units: Array<{ id: string; name: string }>,
  passwordHash: string,
) {
  let created = 0;

  for (const unit of units) {
    const email = `lanc.${normalizeEmailPart(owner.name || owner.email)}.${normalizeEmailPart(unit.name)}@pdca.com`;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) continue;

    await prisma.user.create({
      data: {
        email,
        name: `Lancamento ${unit.name}`,
        password: passwordHash,
        role: 'UNIT_ENTRY',
        template: owner.template || 'RESTAURANTE',
        active: true,
        launchUnitId: unit.id,
      },
    });
    created += 1;
  }

  return created;
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

  const ellen = await prisma.user.create({
    data: {
      email: 'ellen@pdca.com',
      name: 'Ellen',
      password: passwordHash,
      role: 'USER',
      template: 'RESTAURANTE',
      active: true,
    },
  });

  const raiclene = await prisma.user.create({
    data: {
      email: 'raiclene@pdca.com',
      name: 'Raiclene',
      password: passwordHash,
      role: 'USER',
      template: 'RESTAURANTE',
      active: true,
    },
  });

  const operadorInput = await prisma.user.create({
    data: {
      email: 'input@pdca.com',
      name: 'Operador de Input',
      password: passwordHash,
      role: 'DATA_ENTRY',
      template: 'RESTAURANTE',
      active: true,
    },
  });

  const adminStats = await seedUserData(admin, {
    dashboardName: 'Dashboard Administrativo',
    dashboardDescription: 'Base administrativa interna',
    gestoras: [
      {
        name: 'Administrativo',
        unidades: ['Administrativo Central'],
      },
    ],
    receitaScale: 0.3,
  });

  const ellenStats = await seedUserData(ellen, {
    dashboardName: 'Dashboard de Ellen',
    dashboardDescription: 'Base operacional da diretora Ellen',
    gestoras: [
      {
        name: 'Ellen',
        unidades: ['Unidade Centro', 'Unidade Cohab', 'Unidade Shopping'],
      },
    ],
    receitaScale: 1.05,
  });

  const raicleneStats = await seedUserData(raiclene, {
    dashboardName: 'Dashboard de Raiclene',
    dashboardDescription: 'Base operacional da diretora Raiclene',
    gestoras: [
      {
        name: 'Raiclene',
        unidades: ['Unidade Cidade Nova', 'Unidade Ponta Negra', 'Unidade Vieiralves'],
      },
    ],
    receitaScale: 0.95,
  });

  await prisma.dashboardAccess.createMany({
    data: [
      {
        dashboardId: ellenStats.dashDefault.id,
        userId: operadorInput.id,
        permission: 'EDIT',
      },
      {
        dashboardId: raicleneStats.dashDefault.id,
        userId: operadorInput.id,
        permission: 'EDIT',
      },
    ],
  });

  const createdEllenUnitUsers = await createUnitEntryUsers(ellen, ellenStats.unidadeRecords, passwordHash);
  const createdRaicleneUnitUsers = await createUnitEntryUsers(raiclene, raicleneStats.unidadeRecords, passwordHash);

  const summary = await prisma.user.count();
  const tx = await prisma.transacao.count();
  const dash = await prisma.dashboard.count();
  const gestoras = await prisma.gestora.count();
  const unidades = await prisma.unidade.count();

  console.log('');
  console.log('=== Seed base do sistema concluído ===');
  console.log(`Histórico: ${MONTHS_HISTORY} meses`);
  console.log(`Usuários: ${summary} | Dashboards: ${dash} | Gestoras: ${gestoras} | Unidades: ${unidades} | Transações: ${tx}`);
  console.log('');
  console.log(`Senha padrão: ${DEMO_PASSWORD}`);
  console.log('  admin@pdca.com      ADMIN');
  console.log('  ellen@pdca.com      USER');
  console.log('  raiclene@pdca.com   USER');
  console.log('  input@pdca.com      DATA_ENTRY');
  console.log('');
  console.log(`Base admin: ${adminStats.gestoras} gestora(s), ${adminStats.unidades} unidade(s), ${adminStats.transacoes} transações`);
  console.log(`Base Ellen: ${ellenStats.gestoras} gestora(s), ${ellenStats.unidades} unidade(s), ${ellenStats.transacoes} transações`);
  console.log(`Base Raiclene: ${raicleneStats.gestoras} gestora(s), ${raicleneStats.unidades} unidade(s), ${raicleneStats.transacoes} transações`);
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
