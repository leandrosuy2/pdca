import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as xlsx from 'xlsx';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';
import { buildDynamicKpis } from './kpi-builder';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  private isAdminUser(user: any) {
    return String(user?.role || '').toUpperCase() === 'ADMIN';
  }

  private normalizeText(value: any) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase();
  }

  private isFolhaDefinition(value: any) {
    const def = this.normalizeText(value);
    return def === 'PROVENTOS' || def === 'ENCARGOS FOLHA' || def === 'FOPEG';
  }

  private isFolhaTransaction(t: { type: string; categoria?: { name?: string | null } | null; description?: string | null; qtdFunc?: number | null }) {
    if (String(t.type || '').toUpperCase() !== 'DESPESA') return false;
    if (this.isFolhaDefinition(t.categoria?.name)) return true;
    if (!t.categoria?.name && this.isFolhaDefinition(t.description)) return true;
    return false;
  }

  private calculateFopag(
    transactions: Array<{
      type: string;
      amount: number;
      categoria?: { name?: string | null } | null;
      description?: string | null;
    }>,
  ) {
    return transactions
      .filter((t) => this.isFolhaTransaction(t))
      .reduce((acc, t) => acc + Number(t.amount || 0), 0);
  }

  private divideSafely(numerator: number, denominator: number) {
    return denominator !== 0 ? numerator / denominator : 0;
  }

  private serializeExpenseDefinitionsMonthly(
    monthlyMap: Map<string, Map<string, number>>,
  ) {
    return Array.from(monthlyMap.entries())
      .map(([name, valuesByMonth]) => ({
        name,
        monthly: Array.from(valuesByMonth.entries())
          .map(([month, value]) => ({ month, value }))
          .sort((a, b) => a.month.localeCompare(b.month)),
      }))
      .sort((a, b) => {
        const totalA = a.monthly.reduce((acc, item) => acc + item.value, 0);
        const totalB = b.monthly.reduce((acc, item) => acc + item.value, 0);
        return totalB - totalA;
      });
  }

  private buildTransactionWhere(scopedUserId: string, month?: string) {
    const where: any = { userId: scopedUserId };
    const monthMatch = String(month || '').match(/^(\d{4})-(\d{2})$/);

    if (monthMatch) {
      const year = Number(monthMatch[1]);
      const monthIndex = Number(monthMatch[2]) - 1;
      const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
      const end = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0));
      where.date = { gte: start, lt: end };
    }

    return where;
  }

  private buildMonthlyEmployeeTotals(transactions: Array<{ date: Date; qtdFunc: number | null; unidadeId: string }>) {
    const monthByUnit = new Map<string, Map<string, number>>();

    for (const t of transactions) {
      if (!Number.isFinite(t.qtdFunc) || (t.qtdFunc as number) < 0) continue;
      const month = t.date.toISOString().substring(0, 7);
      const unitKey = t.unidadeId || 'SEM_UNIDADE';
      const qtd = Number(t.qtdFunc || 0);

      if (!monthByUnit.has(month)) monthByUnit.set(month, new Map<string, number>());
      const unitMap = monthByUnit.get(month)!;
      const current = unitMap.get(unitKey) || 0;
      unitMap.set(unitKey, Math.max(current, qtd));
    }

    const monthTotals = new Map<string, number>();
    monthByUnit.forEach((unitMap, month) => {
      const total = Array.from(unitMap.values()).reduce((acc, curr) => acc + curr, 0);
      monthTotals.set(month, total);
    });

    return monthTotals;
  }

  private buildLatestEmployeeByUnit(transactions: Array<{ date: Date; qtdFunc: number | null; unidadeId: string }>) {
    const latestByUnit = new Map<string, { month: string; value: number }>();

    for (const t of transactions) {
      if (!Number.isFinite(t.qtdFunc) || (t.qtdFunc as number) < 0) continue;
      const unitKey = t.unidadeId || '';
      if (!unitKey) continue;

      const month = t.date.toISOString().substring(0, 7);
      const qtd = Number(t.qtdFunc || 0);
      const existing = latestByUnit.get(unitKey);

      if (!existing || month > existing.month) {
        latestByUnit.set(unitKey, { month, value: qtd });
      } else if (month === existing.month) {
        latestByUnit.set(unitKey, { month, value: Math.max(existing.value, qtd) });
      }
    }

    return new Map<string, number>(
      Array.from(latestByUnit.entries()).map(([unitId, data]) => [unitId, data.value]),
    );
  }

  private async ensureDefaultDashboard(user: any) {
    const existing = await this.prisma.dashboard.findFirst({
      where: { ownerId: user.id, isDefault: true }
    });

    if (existing) return existing;

    const slugBase = `${user.name || user.email || 'dashboard'}-${user.id.slice(0, 8)}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return this.prisma.dashboard.create({
      data: {
        name: `Dashboard de ${user.name || user.email}`,
        slug: slugBase,
        description: 'Dashboard principal do usuario',
        ownerId: user.id,
        isDefault: true,
      }
    });
  }

  private async ensureDefaultDashboardsForAllUsers() {
    const users = await this.prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, active: true }
    });

    for (const user of users) {
      await this.ensureDefaultDashboard(user);
    }
  }

  private async resolveDashboardContext(user: any, dashboardId?: string) {
    if (!dashboardId) {
      const dashboard = await this.ensureDefaultDashboard(user);
      return { dashboard, scopedUserId: dashboard.ownerId };
    }

    const dashboard = await this.prisma.dashboard.findUnique({
      where: { id: dashboardId },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        access: { where: { userId: user.id } }
      }
    });

    if (!dashboard) {
      throw new NotFoundException('Dashboard nao encontrado.');
    }

    const isAdmin = this.isAdminUser(user);
    const hasAccess = dashboard.ownerId === user.id || dashboard.access.length > 0;

    if (!isAdmin && !hasAccess) {
      throw new ForbiddenException('Voce nao tem permissao para acessar este dashboard.');
    }

    return { dashboard, scopedUserId: dashboard.ownerId };
  }

  async listDashboards(user: any) {
    if (this.isAdminUser(user)) {
      await this.ensureDefaultDashboardsForAllUsers();
      const dashboards = await this.prisma.dashboard.findMany({
        include: { owner: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: [{ owner: { name: 'asc' } }, { name: 'asc' }]
      });
      return { dashboards };
    }

    await this.ensureDefaultDashboard(user);

    const dashboards = await this.prisma.dashboard.findMany({
      where: {
        OR: [
          { ownerId: user.id },
          { access: { some: { userId: user.id } } }
        ]
      },
      include: { owner: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: [{ owner: { name: 'asc' } }, { name: 'asc' }]
    });

    return { dashboards };
  }

  async getDashboardMeta(user: any, dashboardId: string) {
    const { dashboard } = await this.resolveDashboardContext(user, dashboardId);
    return dashboard;
  }

  async getOverview(user: any, dashboardId?: string, month?: string) {
    const { scopedUserId } = await this.resolveDashboardContext(user, dashboardId);
    const transactions = await this.prisma.transacao.findMany({
      where: this.buildTransactionWhere(scopedUserId, month),
      include: { categoria: true, unidade: true }
    });

    const typeKpis = buildDynamicKpis({
      items: transactions,
      bucketSelector: (t) => String(t.type || ''),
      valueSelector: (t) => Number(t.amount || 0),
      primaryBuckets: ['RECEITA', 'DESPESA'],
      sourceColumn: 'Tipo',
      labelMap: {
        RECEITA: 'Receita',
        DESPESA: 'Despesa',
      },
    });
    const typeTotals = typeKpis.totals;

    const receitaTotal = typeKpis.primaryTotals['RECEITA'] || 0;
    const despesaTotal = typeKpis.primaryTotals['DESPESA'] || 0;
    const lucro = receitaTotal - despesaTotal;
    const margemPercent = this.divideSafely(lucro, receitaTotal);
    const percentualSobreFaturamento = this.divideSafely(despesaTotal, receitaTotal);
    const fopag = this.calculateFopag(transactions);
    
    // Group by month for chart
    const monthlyDataMap = new Map<string, any>();
    
    transactions.forEach(t => {
      const month = t.date.toISOString().substring(0, 7); // YYYY-MM
      if (!monthlyDataMap.has(month)) {
        monthlyDataMap.set(month, { month, receita: 0, despesa: 0, lucro: 0 });
      }
      const data = monthlyDataMap.get(month)!;
      const type = String(t.type || '').toUpperCase();
      if (type === 'RECEITA') {
        data.receita = (data.receita || 0) + t.amount;
      } else if (type === 'DESPESA') {
        data.despesa = (data.despesa || 0) + t.amount;
      } else {
        const dynamicKey = type.toLowerCase();
        data[dynamicKey] = (data[dynamicKey] || 0) + t.amount;
      }
    });

    monthlyDataMap.forEach(data => {
      data.lucro = (data.receita || 0) - (data.despesa || 0);
    });

    let chartData = Array.from(monthlyDataMap.values()).sort((a,b) => a.month.localeCompare(b.month));

    // Ranking by unit
    const unitMap = new Map<string, number>();
    transactions.filter(t => t.type === 'RECEITA').forEach(t => {
      unitMap.set(t.unidade.name, (unitMap.get(t.unidade.name) || 0) + t.amount);
    });
    const ranking = Array.from(unitMap.entries()).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);

    // Employee logic (QTD FUNC) - usa max por unidade no mês para evitar duplicidade por linhas
    const monthFuncs = this.buildMonthlyEmployeeTotals(
      transactions.map((t) => ({ date: t.date, qtdFunc: t.qtdFunc, unidadeId: t.unidadeId })),
    );
    
    // Sort months chronologically
    const sortedMonths = Array.from(monthFuncs.keys()).sort();
    let funcionariosInfo = { current: 0, variance: 0 };
    if (sortedMonths.length > 0) {
      const currentMonth = sortedMonths[sortedMonths.length - 1];
      const previousMonth = sortedMonths.length > 1 ? sortedMonths[sortedMonths.length - 2] : null;
      const current = monthFuncs.get(currentMonth) || 0;
      const previous = previousMonth ? (monthFuncs.get(previousMonth) || 0) : current;
      funcionariosInfo = { current, variance: current - previous };
    }

    chartData = chartData.map((item) => ({
      ...item,
      funcionarios: monthFuncs.get(item.month) || 0,
    }));

    const currentMonthData = chartData.length > 0 ? chartData[chartData.length - 1] : null;
    const previousMonthData = chartData.length > 1 ? chartData[chartData.length - 2] : null;
    const faturamentoAtual = currentMonthData?.receita || 0;
    const faturamentoAnterior = previousMonthData?.receita || 0;
    const crescimentoMes =
      faturamentoAnterior !== 0 ? (faturamentoAtual - faturamentoAnterior) / faturamentoAnterior : 0;
    const projecaoFaturamento = faturamentoAtual * (1 + crescimentoMes);

    const colaboradoresAtuais = funcionariosInfo.current || 0;
    const colaboradoresAnteriores =
      sortedMonths.length > 1 ? colaboradoresAtuais - (funcionariosInfo.variance || 0) : colaboradoresAtuais;
    const crescimentoColaboradores =
      colaboradoresAnteriores !== 0
        ? (colaboradoresAtuais - colaboradoresAnteriores) / colaboradoresAnteriores
        : 0;
    const projecaoColaboradores = colaboradoresAtuais * (1 + crescimentoColaboradores);
    const fopagPercent = this.divideSafely(fopag, receitaTotal);
    const fopagPorFuncionario = this.divideSafely(fopag, colaboradoresAtuais);
    const receitaPorFuncionario = this.divideSafely(receitaTotal, colaboradoresAtuais);
    const custoOperacional = despesaTotal - fopag;
    const custoOperacionalPercent = this.divideSafely(custoOperacional, receitaTotal);

    return {
      kpis: {
        receitaTotal,
        receita: receitaTotal,
        despesaTotal,
        despesa: despesaTotal,
        lucro,
        margemPercent,
        percentualSobreFaturamento,
        fopag,
        fopagPercent,
        fopagPorFuncionario,
        receitaPorFuncionario,
        custoOperacional,
        custoOperacionalPercent,
        massaSalarial: fopag,
        lucroPercent: margemPercent,
        funcionarios: funcionariosInfo,
        crescimentoMes,
        projecaoFaturamento,
        projecaoColaboradores,
        typeTotals,
        dynamicKpis: typeKpis.dynamicKpis,
      },
      chartData,
      ranking: ranking.slice(0, 5) // top 5
    };
  }

  async getUnits(user: any, dashboardId?: string, month?: string) {
    const { scopedUserId } = await this.resolveDashboardContext(user, dashboardId);
    const transactions = await this.prisma.transacao.findMany({
      where: this.buildTransactionWhere(scopedUserId, month),
      include: { unidade: true, categoria: true }
    });

    const units = await this.prisma.unidade.findMany({ where: { userId: scopedUserId }});
    
    const radarData = units.map(un => {
      const unitTrans = transactions.filter(t => t.unidadeId === un.id);
      const rec = unitTrans.filter(t => t.type === 'RECEITA').reduce((a, b) => a + b.amount, 0);
      const des = unitTrans.filter(t => t.type === 'DESPESA').reduce((a, b) => a + b.amount, 0);
      const expenseDefinitionMap = new Map<string, number>();
      const expenseDefinitionsMonthlyMap = new Map<string, Map<string, number>>();
      const monthlyDataMap = new Map<string, { month: string; receita: number; despesa: number; lucro: number }>();

      unitTrans.forEach(t => {
        const month = t.date.toISOString().substring(0, 7);
        if (!monthlyDataMap.has(month)) {
          monthlyDataMap.set(month, { month, receita: 0, despesa: 0, lucro: 0 });
        }

        const data = monthlyDataMap.get(month)!;
        if (t.type === 'RECEITA') data.receita += t.amount;
        if (t.type === 'DESPESA') {
          data.despesa += t.amount;
          const categoryName = t.categoria?.name || 'Outros';
          expenseDefinitionMap.set(categoryName, (expenseDefinitionMap.get(categoryName) || 0) + t.amount);
          if (!expenseDefinitionsMonthlyMap.has(categoryName)) {
            expenseDefinitionsMonthlyMap.set(categoryName, new Map<string, number>());
          }
          const categoryMonthly = expenseDefinitionsMonthlyMap.get(categoryName)!;
          categoryMonthly.set(month, (categoryMonthly.get(month) || 0) + t.amount);
        }
      });

      monthlyDataMap.forEach(data => {
        data.lucro = data.receita - data.despesa;
      });

      return {
        unit: un.name,
        receita: rec,
        despesa: des,
        margem: rec > 0 ? ((rec - des) / rec) * 100 : 0,
        monthly: Array.from(monthlyDataMap.values()).sort((a, b) => a.month.localeCompare(b.month)),
        expenseDefinitions: Array.from(expenseDefinitionMap.entries())
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value),
        expenseDefinitionsMonthly: this.serializeExpenseDefinitionsMonthly(expenseDefinitionsMonthlyMap),
      };
    });

    return { units: radarData };
  }

  async getCosts(user: any, dashboardId?: string, month?: string) {
    const { scopedUserId } = await this.resolveDashboardContext(user, dashboardId);
    const transactions = await this.prisma.transacao.findMany({
      where: { ...this.buildTransactionWhere(scopedUserId, month), type: 'DESPESA' },
      include: { categoria: true }
    });

    const catMap = new Map<string, number>();
    transactions.forEach(t => {
      catMap.set(t.categoria.name, (catMap.get(t.categoria.name) || 0) + t.amount);
    });

    const despesas = Array.from(catMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    
    const despesaTotal = despesas.reduce((acc, curr) => acc + curr.value, 0);

    return { despesas, total: despesaTotal };
  }
  async getManagers(user: any, dashboardId?: string, month?: string) {
    const { scopedUserId } = await this.resolveDashboardContext(user, dashboardId);
    const transactions = await this.prisma.transacao.findMany({
      where: this.buildTransactionWhere(scopedUserId, month),
      include: { unidade: true, categoria: true },
      orderBy: { date: 'asc' }
    });

    const managerMap = new Map<string, any>();

    transactions.forEach((t) => {
      const managerName = String(t.gestora || '').trim() || 'Sem Gestora';

      if (!managerMap.has(managerName)) {
        managerMap.set(managerName, {
          name: managerName,
          receita: 0,
          despesa: 0,
          lucro: 0,
          expenseDefinitionsMap: new Map<string, number>(),
          expenseDefinitionsMonthlyMap: new Map<string, Map<string, number>>(),
          unitsMap: new Map<string, any>(),
          monthlyMap: new Map<string, any>()
        });
      }

      const manager = managerMap.get(managerName)!;
      const isReceita = t.type === 'RECEITA';
      const isDespesa = t.type === 'DESPESA';
      const month = t.date.toISOString().substring(0, 7);

      if (isReceita) manager.receita += t.amount;
      if (isDespesa) manager.despesa += t.amount;

      const unitName = t.unidade?.name || 'Sem Unidade';
      if (!manager.unitsMap.has(unitName)) {
        manager.unitsMap.set(unitName, {
          unit: unitName,
          receita: 0,
          despesa: 0,
          lucro: 0,
          margem: 0,
          expenseDefinitionsMap: new Map<string, number>(),
          expenseDefinitionsMonthlyMap: new Map<string, Map<string, number>>(),
          monthlyMap: new Map<string, any>()
        });
      }

      const unitData = manager.unitsMap.get(unitName)!;
      if (isReceita) unitData.receita += t.amount;
      if (isDespesa) {
        unitData.despesa += t.amount;
        const categoryName = t.categoria?.name || 'Outros';
        unitData.expenseDefinitionsMap.set(
          categoryName,
          (unitData.expenseDefinitionsMap.get(categoryName) || 0) + t.amount,
        );
        if (!unitData.expenseDefinitionsMonthlyMap.has(categoryName)) {
          unitData.expenseDefinitionsMonthlyMap.set(categoryName, new Map<string, number>());
        }
        const unitCategoryMonthly = unitData.expenseDefinitionsMonthlyMap.get(categoryName)!;
        unitCategoryMonthly.set(month, (unitCategoryMonthly.get(month) || 0) + t.amount);

        manager.expenseDefinitionsMap.set(
          categoryName,
          (manager.expenseDefinitionsMap.get(categoryName) || 0) + t.amount,
        );
        if (!manager.expenseDefinitionsMonthlyMap.has(categoryName)) {
          manager.expenseDefinitionsMonthlyMap.set(categoryName, new Map<string, number>());
        }
        const managerCategoryMonthly = manager.expenseDefinitionsMonthlyMap.get(categoryName)!;
        managerCategoryMonthly.set(month, (managerCategoryMonthly.get(month) || 0) + t.amount);
      }

      if (!unitData.monthlyMap.has(month)) {
        unitData.monthlyMap.set(month, { month, receita: 0, despesa: 0, lucro: 0 });
      }
      const unitMonthlyData = unitData.monthlyMap.get(month)!;
      if (isReceita) unitMonthlyData.receita += t.amount;
      if (isDespesa) unitMonthlyData.despesa += t.amount;

      if (!manager.monthlyMap.has(month)) {
        manager.monthlyMap.set(month, { month, receita: 0, despesa: 0, lucro: 0 });
      }

      const monthlyData = manager.monthlyMap.get(month)!;
      if (isReceita) monthlyData.receita += t.amount;
      if (isDespesa) monthlyData.despesa += t.amount;
    });

    const gestoras = Array.from(managerMap.values()).map((manager) => {
      manager.lucro = manager.receita - manager.despesa;

      const units = Array.from(manager.unitsMap.values())
        .map((unit: any) => ({
          ...unit,
          lucro: unit.receita - unit.despesa,
          margem: unit.receita > 0 ? ((unit.receita - unit.despesa) / unit.receita) * 100 : 0,
          expenseDefinitions: Array.from(unit.expenseDefinitionsMap.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a: any, b: any) => b.value - a.value),
          expenseDefinitionsMonthly: this.serializeExpenseDefinitionsMonthly(unit.expenseDefinitionsMonthlyMap),
          monthly: Array.from(unit.monthlyMap.values())
            .map((item: any) => ({
              ...item,
              lucro: item.receita - item.despesa
            }))
            .sort((a: any, b: any) => a.month.localeCompare(b.month))
        }))
        .sort((a: any, b: any) => b.receita - a.receita);

      const monthly = Array.from(manager.monthlyMap.values())
        .map((item: any) => ({
          ...item,
          lucro: item.receita - item.despesa
        }))
        .sort((a: any, b: any) => a.month.localeCompare(b.month));

      return {
        name: manager.name,
        receita: manager.receita,
        despesa: manager.despesa,
        lucro: manager.lucro,
        margem: manager.receita > 0 ? (manager.lucro / manager.receita) * 100 : 0,
        expenseDefinitions: Array.from(manager.expenseDefinitionsMap.entries())
          .map(([name, value]) => ({ name, value }))
          .sort((a: any, b: any) => b.value - a.value),
        expenseDefinitionsMonthly: this.serializeExpenseDefinitionsMonthly(manager.expenseDefinitionsMonthlyMap),
        units,
        monthly
      };
    }).sort((a, b) => b.receita - a.receita);

    return { gestoras };
  }

  async getTrends(user: any, dashboardId?: string, month?: string) {
    const { scopedUserId } = await this.resolveDashboardContext(user, dashboardId);
    const transactions = await this.prisma.transacao.findMany({
      where: this.buildTransactionWhere(scopedUserId, month),
      orderBy: { date: 'asc' }
    });

    const monthlyTotals = new Map<string, { receita: number; despesa: number }>();

    transactions.forEach((t) => {
      const month = t.date.toISOString().substring(0, 7);
      if (!monthlyTotals.has(month)) {
        monthlyTotals.set(month, { receita: 0, despesa: 0 });
      }
      const current = monthlyTotals.get(month)!;
      if (t.type === 'RECEITA') current.receita += t.amount;
      if (t.type === 'DESPESA') current.despesa += t.amount;
    });

    let recAcumulada = 0;
    let despAcumulada = 0;
    const trends = Array.from(monthlyTotals.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, values]) => {
        recAcumulada += values.receita;
        despAcumulada += values.despesa;
        return { month, receitaAcumulada: recAcumulada, despesaAcumulada: despAcumulada };
      });

    return { trends };
  }

  async getPeople(user: any, dashboardId?: string, month?: string) {
    const { scopedUserId } = await this.resolveDashboardContext(user, dashboardId);
    const units = await this.prisma.unidade.findMany({ where: { userId: scopedUserId }});
    const allTrans = await this.prisma.transacao.findMany({
      where: this.buildTransactionWhere(scopedUserId, month),
      include: { categoria: true }
    });

    const latestQtdByUnit = this.buildLatestEmployeeByUnit(
      allTrans.map((t) => ({ date: t.date, qtdFunc: t.qtdFunc, unidadeId: t.unidadeId })),
    );

    const people = units.map((u) => {
       const unitTrans = allTrans.filter(t => t.unidadeId === u.id);
       const folhaUnit = this.calculateFopag(unitTrans);

       const qtd = latestQtdByUnit.get(u.id) || 0;

       return {
         unidade: u.name,
         funcionarios: qtd,
         fopag: folhaUnit
       };
    });

    return { people, totalFopag: people.reduce((acc, p) => acc + p.fopag, 0) };
  }

  async importExcel(fileBuffer: Buffer, user: any, dashboardId?: string) {
    if (this.isAdminUser(user) && !dashboardId) {
      throw new BadRequestException(
        'Para importar como administrador, selecione um dashboard especifico.',
      );
    }

    const { dashboard } = await this.resolveDashboardContext(user, dashboardId);
    const isAdmin = this.isAdminUser(user);
    const canImport = isAdmin || dashboard.ownerId === user.id;

    if (!canImport) {
      throw new ForbiddenException('Voce nao tem permissao para importar neste dashboard.');
    }
    const targetUserId = dashboard.ownerId;
    const targetDashboardId = dashboard.id;

    const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheetName || !sheet) {
      throw new BadRequestException('Planilha invalida: nenhuma aba encontrada.');
    }

    const data: any[] = xlsx.utils.sheet_to_json(sheet, { defval: '' });

    const MODEL_ALIASES = {
      month: ['MES', 'MÊS', 'COMPETENCIA', 'COMPETÊNCIA', 'PERIODO', 'PERÍODO', 'DATA', 'MES_ANO', 'MÊS/ANO'],
      unit: ['UNIDADE', 'UNID', 'CENTRO DE CUSTO'],
      value: ['VALOR', 'VALOR TOTAL', 'VLR', 'VLR_TOTAL'],
      type: ['TIPO', 'TIPO_LANCAMENTO'],
      category: ['DEFINICAO', 'DEFINIÇÃO', 'CATEGORIA', 'NATUREZA'],
      manager: ['GESTORA', 'GESTOR', 'RESPONSAVEL', 'RESPONSÁVEL'],
      year: ['ANO', 'EXERCICIO', 'EXERCÍCIO', 'DATA'],
      headcount: ['QTD FUNC', 'QTD_FUNC', 'QTD FUNCIONARIOS', 'QTD_FUNCIONARIOS', 'QTD'],
    } as const;

    const normalizeHeader = (value: string) =>
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

    const getByAliases = (row: Record<string, any>, aliases: string[]) => {
      for (const alias of aliases) {
        const key = normalizeHeader(alias);
        if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
          return row[key];
        }
      }
      return undefined;
    };

    const getByHeaderPatterns = (
      row: Record<string, any>,
      patterns: Array<string | RegExp>,
      excludePatterns: Array<string | RegExp> = [],
    ) => {
      const entries = Object.entries(row);
      for (const [key, value] of entries) {
        if (value === undefined || value === null || String(value).trim() === '') continue;

        const matchesPattern = patterns.some((pattern) =>
          typeof pattern === 'string' ? key.includes(normalizeHeader(pattern)) : pattern.test(key),
        );
        if (!matchesPattern) continue;

        const matchesExclude = excludePatterns.some((pattern) =>
          typeof pattern === 'string' ? key.includes(normalizeHeader(pattern)) : pattern.test(key),
        );
        if (matchesExclude) continue;

        return value;
      }
      return undefined;
    };

    const parseAmount = (raw: any) => {
      if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;

      const value = String(raw ?? '').trim();
      if (!value) return 0;

      const negativeByParentheses = value.startsWith('(') && value.endsWith(')');
      const cleaned = value
        .replace(/[R$\s]/gi, '')
        .replace(/[^\d,.\-()]/g, '')
        .replace(/[()]/g, '');

      if (!cleaned) return 0;

      const lastDot = cleaned.lastIndexOf('.');
      const lastComma = cleaned.lastIndexOf(',');

      let normalized = cleaned;
      if (lastDot !== -1 && lastComma !== -1) {
        if (lastComma > lastDot) {
          normalized = cleaned.replace(/\./g, '').replace(',', '.');
        } else {
          normalized = cleaned.replace(/,/g, '');
        }
      } else if (lastComma !== -1) {
        const digitsAfter = cleaned.length - lastComma - 1;
        normalized =
          digitsAfter === 3 ? cleaned.replace(/,/g, '') : cleaned.replace(',', '.');
      } else if (lastDot !== -1) {
        const digitsAfter = cleaned.length - lastDot - 1;
        normalized = digitsAfter === 3 ? cleaned.replace(/\./g, '') : cleaned;
      }

      const parsed = Number(normalized);
      if (!Number.isFinite(parsed)) return 0;
      return negativeByParentheses ? -Math.abs(parsed) : parsed;
    };

    const normalizeType = (raw: any) => {
      const type = normalizeHeader(String(raw || ''));
      if (!type) return 'DESPESA';

      if (
        type.includes('RECEITA') ||
        type.includes('ENTRADA') ||
        type.includes('CREDITO') ||
        type.includes('PROVENTO') ||
        type.includes('FATURAMENTO')
      ) {
        return 'RECEITA';
      }

      if (
        type.includes('DESPESA') ||
        type.includes('SAIDA') ||
        type.includes('DEBITO') ||
        type.includes('CUSTO') ||
        type.includes('GASTO')
      ) {
        return 'DESPESA';
      }

      return type;
    };

    const monthMap: Record<string, string> = {
      JANEIRO: '01',
      JAN: '01',
      FEVEREIRO: '02',
      FEV: '02',
      MARCO: '03',
      MAR: '03',
      ABRIL: '04',
      ABR: '04',
      MAIO: '05',
      MAI: '05',
      JUNHO: '06',
      JUN: '06',
      JULHO: '07',
      JUL: '07',
      AGOSTO: '08',
      AGO: '08',
      SETEMBRO: '09',
      SET: '09',
      OUTUBRO: '10',
      OUT: '10',
      NOVEMBRO: '11',
      NOV: '11',
      DEZEMBRO: '12',
      DEZ: '12',
    };

    const extractYear = (value: any, fallbackYear: number) => {
      const digits = String(value ?? '').match(/\b(19\d{2}|20\d{2}|21\d{2})\b/);
      if (digits) return Number(digits[1]);

      const shortYear = String(value ?? '').match(/(?:^|[^\d])(\d{2})(?:$|[^\d])/);
      if (shortYear) {
        const yy = Number(shortYear[1]);
        if (Number.isFinite(yy)) return yy >= 70 ? 1900 + yy : 2000 + yy;
      }

      return fallbackYear;
    };

    const parseDateFromRow = (rawMonth: any, rawYear: any) => {
      const currentYear = new Date().getFullYear();
      let year = Number(String(rawYear ?? '').replace(/\D/g, ''));
      if (!Number.isFinite(year) || year < 1900 || year > 2100) {
        year = extractYear(rawMonth, currentYear);
      }
      if (!Number.isFinite(year) || year < 1900 || year > 2100) year = currentYear;

      if (rawMonth instanceof Date && !Number.isNaN(rawMonth.getTime())) {
        return new Date(Date.UTC(rawMonth.getUTCFullYear(), rawMonth.getUTCMonth(), 1));
      }

      if (typeof rawMonth === 'number') {
        if (rawMonth >= 1 && rawMonth <= 12) {
          return new Date(`${year}-${String(rawMonth).padStart(2, '0')}-01T00:00:00.000Z`);
        }

        const parsedExcelDate = xlsx.SSF.parse_date_code(rawMonth);
        if (parsedExcelDate?.y && parsedExcelDate?.m) {
          return new Date(
            `${String(parsedExcelDate.y)}-${String(parsedExcelDate.m).padStart(2, '0')}-01T00:00:00.000Z`,
          );
        }
      }

      const rawMonthText = String(rawMonth ?? '').trim();
      const normalizedMonthText = normalizeHeader(rawMonthText);

      const mmYyyyMatch = rawMonthText.match(/\b(\d{1,2})[\/\-](\d{2,4})\b/);
      if (mmYyyyMatch) {
        const month = Number(mmYyyyMatch[1]);
        let matchedYear = Number(mmYyyyMatch[2]);
        if (matchedYear < 100) matchedYear = matchedYear >= 70 ? 1900 + matchedYear : 2000 + matchedYear;
        if (month >= 1 && month <= 12) {
          return new Date(
            `${String(matchedYear).padStart(4, '0')}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`,
          );
        }
      }

      const ddMmYyyyMatch = rawMonthText.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
      if (ddMmYyyyMatch) {
        const month = Number(ddMmYyyyMatch[2]);
        let matchedYear = Number(ddMmYyyyMatch[3]);
        if (matchedYear < 100) matchedYear = matchedYear >= 70 ? 1900 + matchedYear : 2000 + matchedYear;
        if (month >= 1 && month <= 12) {
          return new Date(
            `${String(matchedYear).padStart(4, '0')}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`,
          );
        }
      }

      const monthNumFromName = Object.entries(monthMap).find(([key]) => normalizedMonthText.includes(key))?.[1];
      if (monthNumFromName) {
        const inferredYear = extractYear(rawMonthText, year);
        return new Date(`${String(inferredYear)}-${monthNumFromName}-01T00:00:00.000Z`);
      }

      const digitsOnlyMonth = Number(rawMonthText.replace(/\D/g, ''));
      if (digitsOnlyMonth >= 1 && digitsOnlyMonth <= 12) {
        return new Date(`${year}-${String(digitsOnlyMonth).padStart(2, '0')}-01T00:00:00.000Z`);
      }

      return new Date(`${year}-01-01T00:00:00.000Z`);
    };

    const cleanText = (value: any) =>
      String(value ?? '')
        .replace(/\u00A0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const isFilledCell = (value: any) => {
      if (value instanceof Date) return !Number.isNaN(value.getTime());
      if (typeof value === 'number') return Number.isFinite(value);
      return cleanText(value) !== '';
    };

    const firstFilledCell = (row: any[], startIndex = 0) => {
      for (let i = startIndex; i < row.length; i += 1) {
        if (isFilledCell(row[i])) return row[i];
      }
      return undefined;
    };

    const findSheetByAliases = (aliases: string[]) => {
      const normalizedAliases = aliases.map((alias) => normalizeHeader(alias));
      return workbook.SheetNames.find((name) => normalizedAliases.includes(normalizeHeader(name)));
    };

    const createParsedRow = ({
      unidadeName,
      amount,
      date,
      tipo,
      catName,
      descr,
      gestora,
      qtdFunc = null,
    }: {
      unidadeName: string;
      amount: number;
      date: Date;
      tipo: string;
      catName: string;
      descr: string;
      gestora: string;
      qtdFunc?: number | null;
    }) => {
      const numericAmount = parseAmount(amount);
      if (!unidadeName || !Number.isFinite(numericAmount) || numericAmount === 0) return null;
      return {
        unidadeName: cleanText(unidadeName),
        amount: numericAmount,
        date,
        tipo,
        catName: cleanText(catName) || 'Outros',
        descr: cleanText(descr) || 'Sem descricao',
        gestora: cleanText(gestora) || 'Sem Gestora',
        qtdFunc,
      };
    };

    const structuredManagerByUnit = new Map<string, string>();

    const parseStructuredFaturamentoSheet = (forcedSheetName?: string) => {
      const sheetName =
        forcedSheetName && workbook.Sheets[forcedSheetName]
          ? forcedSheetName
          : findSheetByAliases(['FATURAMENTO', 'FATURACAO', 'RECEITA']);
      if (!sheetName || !workbook.Sheets[sheetName]) return [];

      const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' }) as any[][];
      const metaRow = rows.find((row) => normalizeHeader(cleanText(row[0])) === 'UNIDADE');
      const metaText = cleanText(firstFilledCell(metaRow || [], 1));
      const [unitFromMeta, periodFromMeta] = metaText.split('/').map((part) => cleanText(part));
      const unidadeName = unitFromMeta || cleanText(metaText);

      const headerRowIndex = rows.findIndex((row) => {
        const normalized = row.map((cell) => normalizeHeader(cleanText(cell)));
        return normalized[0] === 'DATA' && normalized.includes('PIX');
      });

      if (!unidadeName || headerRowIndex < 0) return [];

      const headerRow = rows[headerRowIndex] || [];
      const revenueColumns = headerRow
        .map((cell, index) => ({ key: normalizeHeader(cleanText(cell)), label: cleanText(cell), index }))
        .filter((item) => ['PIX', 'CREDITO', 'DEBITO', 'NOTA_FISCAL'].includes(item.key));

      const gestoraName = structuredManagerByUnit.get(unidadeName) || unidadeName;

      return rows
        .slice(headerRowIndex + 1)
        .flatMap((row) => {
          const rawDate = row[0];
          if (!isFilledCell(rawDate)) return [];

          const date = parseDateFromRow(rawDate, periodFromMeta || metaText);
          return revenueColumns
            .map((column) =>
              createParsedRow({
                unidadeName,
                amount: row[column.index],
                date,
                tipo: 'RECEITA',
                catName: column.label,
                descr: gestoraName,
                gestora: gestoraName,
              }),
            )
            .filter((item): item is NonNullable<typeof item> => Boolean(item));
        });
    };

    const parseStructuredDespesasSheet = (forcedSheetName?: string) => {
      const sheetName =
        forcedSheetName && workbook.Sheets[forcedSheetName]
          ? forcedSheetName
          : findSheetByAliases(['DESPESAS', 'CUSTOS']);
      if (!sheetName || !workbook.Sheets[sheetName]) return [];

      const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' }) as any[][];
      const unitRow = rows.find((row) => row.some((cell) => normalizeHeader(cleanText(cell)) === 'UNIDADE'));
      const gestorRow = rows.find((row) => row.some((cell) => normalizeHeader(cleanText(cell)) === 'GESTOR'));
      const headerRowIndex = rows.findIndex((row) => row.some((cell) => normalizeHeader(cleanText(cell)) === 'FORNECEDOR'));
      if (!unitRow || headerRowIndex < 0) return [];

      const unitIndex = unitRow.findIndex((cell) => normalizeHeader(cleanText(cell)) === 'UNIDADE');
      const periodIndex = unitRow.findIndex((cell) => normalizeHeader(cleanText(cell)).startsWith('PERIODO'));
      const unidadeName = cleanText(firstFilledCell(unitRow, unitIndex + 1));
      const periodRaw = periodIndex >= 0 ? firstFilledCell(unitRow, periodIndex + 1) : undefined;
      const date = parseDateFromRow(periodRaw, periodRaw);
      const gestor = gestorRow ? cleanText(firstFilledCell(gestorRow, 1)) : '';
      const gestoraName = gestor || unidadeName;

      if (!unidadeName) return [];
      structuredManagerByUnit.set(unidadeName, gestoraName);

      let currentCategory = 'Outros';
      return rows
        .slice(headerRowIndex + 1)
        .flatMap((row) => {
          const firstCell = cleanText(row[0]);
          const normalizedFirst = normalizeHeader(firstCell);
          const weekValues = row.slice(3, 8).map((value) => parseAmount(value));
          const weeklyAmount = weekValues.reduce((acc, value) => acc + (Number.isFinite(value) ? value : 0), 0);
          const totalAmount = parseAmount(row[8]);
          const amount = weeklyAmount !== 0 ? weeklyAmount : totalAmount;

          if (!firstCell && amount === 0) return [];
          if (normalizedFirst.startsWith('TOTAL')) return [];

          if (amount === 0) {
            if (firstCell && !['FORNECEDOR', 'UNIDADE', 'GESTOR'].includes(normalizedFirst)) {
              currentCategory = firstCell;
            }
            return [];
          }

          const parsed = createParsedRow({
            unidadeName,
            amount,
            date,
            tipo: 'DESPESA',
            catName: currentCategory,
            descr: gestoraName,
            gestora: gestoraName,
          });
          return parsed ? [parsed] : [];
        });
    };

    const parseStructuredSalariosSheet = (forcedSheetName?: string, folhaCategoria = 'PROVENTOS') => {
      const sheetName =
        forcedSheetName && workbook.Sheets[forcedSheetName]
          ? forcedSheetName
          : findSheetByAliases(['SALARIOS', 'SALÁRIOS', 'FOLHA', 'FOPEG']);
      if (!sheetName || !workbook.Sheets[sheetName]) return [];

      const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' }) as any[][];
      const metaRow = rows.find((row) => row.some((cell) => normalizeHeader(cleanText(cell)) === 'UNIDADE'));
      const headerRowIndex = rows.findIndex((row) => row.some((cell) => normalizeHeader(cleanText(cell)) === 'NOME'));
      if (!metaRow || headerRowIndex < 0) return [];

      const unitIndex = metaRow.findIndex((cell) => normalizeHeader(cleanText(cell)) === 'UNIDADE');
      const periodIndex = metaRow.findIndex((cell) => normalizeHeader(cleanText(cell)).startsWith('PERIODO'));
      const unidadeName = cleanText(firstFilledCell(metaRow, unitIndex + 1));
      const periodRaw = periodIndex >= 0 ? firstFilledCell(metaRow, periodIndex + 1) : undefined;
      const date = parseDateFromRow(periodRaw, periodRaw);
      const gestoraName = structuredManagerByUnit.get(unidadeName) || unidadeName;
      const headerRow = rows[headerRowIndex].map((cell) => normalizeHeader(cleanText(cell)));

      const nameIndex = headerRow.findIndex((cell) => cell === 'NOME');
      const salaryIndexes = headerRow
        .map((cell, index) => ({ cell, index }))
        .filter(({ cell }) =>
          ['SALARIO', 'SALARIO_FAMILIA', 'ADICIONAL_NOTURNO', 'INSALUBRIDADE', 'EXTRA_50', 'EXTRA_100'].includes(cell),
        )
        .map(({ index }) => index);

      const employeeRows = rows
        .slice(headerRowIndex + 1)
        .filter((row) => cleanText(row[nameIndex]) !== '');

      const qtdFunc = employeeRows.length;
      return employeeRows
        .map((row) =>
          createParsedRow({
            unidadeName,
            amount: salaryIndexes.reduce((acc, index) => acc + parseAmount(row[index]), 0),
            date,
            tipo: 'DESPESA',
            catName: folhaCategoria,
            descr: gestoraName,
            gestora: gestoraName,
            qtdFunc,
          }),
        )
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
    };

    const parseGenericRowsFromFlatSheet = (sheetData: any[]) =>
      sheetData
        .map((rawRow) => {
          const row: Record<string, any> = {};
          for (const key of Object.keys(rawRow)) {
            row[normalizeHeader(key)] = rawRow[key];
          }

          const unidadeName = String(getByAliases(row, [...MODEL_ALIASES.unit]) || '').trim();
          const valorBruto = getByAliases(row, [...MODEL_ALIASES.value]);

          if (!unidadeName || valorBruto === undefined || String(valorBruto).trim() === '') {
            return null;
          }

          const amount = parseAmount(valorBruto);
          if (!Number.isFinite(amount) || amount === 0) return null;

          const monthValue =
            getByAliases(row, [...MODEL_ALIASES.month]) ||
            getByHeaderPatterns(
              row,
              ['MES', 'MÊS', 'COMPET', 'PERIODO', 'PERÍODO', 'DATA', 'REFERENCIA', 'REFERÊNCIA'],
              ['QTD', 'VALOR', 'TIPO'],
            ) ||
            'JANEIRO';
          const yearValue =
            getByAliases(row, [...MODEL_ALIASES.year]) ||
            getByHeaderPatterns(
              row,
              ['ANO', 'EXERC', 'DATA', 'REFERENCIA', 'REFERÊNCIA'],
              ['QTD', 'VALOR', 'TIPO'],
            );
          const date = parseDateFromRow(monthValue, yearValue);

          const tipoRaw = getByAliases(row, [...MODEL_ALIASES.type]);
          const tipoInformado = String(tipoRaw ?? '').trim();
          const tipoNormalizado = normalizeType(tipoRaw);
          const tipo = tipoInformado
            ? tipoNormalizado
            : amount >= 0
              ? 'RECEITA'
              : 'DESPESA';
          const catName = String(
            getByAliases(row, [...MODEL_ALIASES.category]) || 'Outros',
          ).trim();
          const managerValue = getByAliases(row, [...MODEL_ALIASES.manager]);
          const gestora = String(managerValue || 'Sem Gestora').trim();
          const descr = String(unidadeName || catName || 'Sem descricao').trim();

          const qtdFuncRaw = getByAliases(row, [...MODEL_ALIASES.headcount]);
          const qtdFuncParsed = Number.parseInt(String(qtdFuncRaw ?? '').replace(/\D/g, ''), 10);
          const qtdFunc = Number.isFinite(qtdFuncParsed) ? qtdFuncParsed : null;

          return {
            unidadeName,
            amount,
            date,
            tipo,
            catName: catName || 'Outros',
            descr: descr || 'Sem descricao',
            gestora: gestora || 'Sem Gestora',
            qtdFunc,
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row));

    let structuredRows = [
      ...parseStructuredDespesasSheet(),
      ...parseStructuredFaturamentoSheet(),
      ...parseStructuredSalariosSheet(),
    ];

    if (structuredRows.length === 0 && workbook.SheetNames.length >= 3) {
      const [n0, n1, n2] = workbook.SheetNames;
      structuredRows = [
        ...parseStructuredFaturamentoSheet(n0),
        ...parseStructuredDespesasSheet(n1),
        ...parseStructuredSalariosSheet(n2, 'FOPEG'),
      ];
    }

    let parsedRows =
      structuredRows.length > 0 ? structuredRows : parseGenericRowsFromFlatSheet(data);

    const dedupeKey = (r: (typeof parsedRows)[0]) =>
      `${r.unidadeName}|${r.date.toISOString().slice(0, 10)}|${r.tipo}|${r.catName}|${r.amount}|${r.descr}|${r.gestora}`;
    const seen = new Set<string>();
    parsedRows = parsedRows.filter((r) => {
      const k = dedupeKey(r);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    if (parsedRows.length === 0) {
      throw new BadRequestException(
        'Nenhuma linha valida encontrada. Verifique se a planilha possui colunas de Unidade e Valor.',
      );
    }

    await this.prisma.$transaction(
      async (tx) => {
        await tx.transacao.deleteMany({ where: { userId: targetUserId } });
        await tx.unidade.deleteMany({ where: { userId: targetUserId } });
        await tx.categoria.deleteMany({ where: { userId: targetUserId } });

        const unidadeNames = [...new Set(parsedRows.map((r) => r.unidadeName))];
        const unidadeIdByName = new Map<string, string>();
        for (const name of unidadeNames) {
          const unidade = await tx.unidade.create({
            data: { name, userId: targetUserId },
          });
          unidadeIdByName.set(name, unidade.id);
        }

        const categoriaKey = (r: (typeof parsedRows)[0]) => `${r.catName}::${r.tipo}`;
        const categoriaMetaByKey = new Map<string, { name: string; type: string }>();
        for (const row of parsedRows) {
          const key = categoriaKey(row);
          if (!categoriaMetaByKey.has(key)) {
            categoriaMetaByKey.set(key, { name: row.catName, type: row.tipo });
          }
        }
        const categoriaIdByKey = new Map<string, string>();
        for (const [key, meta] of categoriaMetaByKey) {
          const categoria = await tx.categoria.create({
            data: { name: meta.name, type: meta.type, userId: targetUserId },
          });
          categoriaIdByKey.set(key, categoria.id);
        }

        const chunkSize = 500;
        for (let i = 0; i < parsedRows.length; i += chunkSize) {
          const slice = parsedRows.slice(i, i + chunkSize);
          await tx.transacao.createMany({
            data: slice.map((row) => ({
              description: row.descr,
              gestora: row.gestora,
              amount: row.amount,
              date: row.date,
              type: row.tipo,
              userId: targetUserId,
              unidadeId: unidadeIdByName.get(row.unidadeName)!,
              categoriaId: categoriaIdByKey.get(categoriaKey(row))!,
              qtdFunc: row.qtdFunc,
            })),
          });
        }
      },
      {
        maxWait: 60_000,
        timeout: 300_000,
      },
    );

    return {
      message: 'Planilha importada com sucesso!',
      totalImportado: parsedRows.length,
      dashboardId: targetDashboardId,
      ownerUserId: targetUserId,
    };
  }

  private ensureAdminAnalytics(user: any) {
    if (!this.isAdminUser(user)) {
      throw new ForbiddenException('Acesso restrito a administradores.');
    }
  }

  async getAdminGlobalConsolidated(user: any, yearStr?: string) {
    this.ensureAdminAnalytics(user);
    const y = yearStr && /^\d{4}$/.test(yearStr) ? Number(yearStr) : new Date().getUTCFullYear();
    const start = new Date(Date.UTC(y, 0, 1));
    const end = new Date(Date.UTC(y + 1, 0, 1));

    const txs = await this.prisma.transacao.findMany({
      where: { date: { gte: start, lt: end } },
      include: { categoria: true },
    });

    const monthMap = new Map<string, { receita: number; despesa: number; fopeg: number; turnoverCat: number }>();

    for (const t of txs) {
      const m = t.date.toISOString().slice(0, 7);
      if (!monthMap.has(m)) monthMap.set(m, { receita: 0, despesa: 0, fopeg: 0, turnoverCat: 0 });
      const row = monthMap.get(m)!;
      const type = String(t.type || '').toUpperCase();
      const amt = Number(t.amount || 0);
      if (type === 'RECEITA') row.receita += amt;
      if (type === 'DESPESA') {
        row.despesa += amt;
        if (this.isFolhaTransaction(t)) row.fopeg += amt;
        const cn = this.normalizeText(t.categoria?.name);
        if (cn.includes('TURNOVER')) row.turnoverCat += amt;
      }
    }

    const months = Array.from(monthMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, v]) => {
        const turnoverBase = v.turnoverCat > 0 ? v.turnoverCat : Math.max(0, v.despesa - v.fopeg);
        return {
          month,
          faturamento: v.receita,
          fopeg: v.fopeg,
          turnoverPct: this.divideSafely(turnoverBase, v.receita) * 100,
          despesaTotal: v.despesa,
          margemPct: this.divideSafely(v.receita - v.despesa, v.receita) * 100,
        };
      });

    const alerts: Array<{ type: string; severity: string; message: string }> = [];
    for (let i = 1; i < months.length; i++) {
      const prev = months[i - 1].faturamento;
      const cur = months[i].faturamento;
      if (prev > 0 && cur < prev * 0.9) {
        alerts.push({
          type: 'faturamento_queda',
          severity: 'warning',
          message: `Queda de faturamento acima de 10% em ${months[i].month} frente a ${months[i - 1].month}.`,
        });
      }
      const prevT = months[i - 1].turnoverPct;
      const curT = months[i].turnoverPct;
      if (curT > prevT + 5) {
        alerts.push({
          type: 'turnover_subida',
          severity: 'info',
          message: `Índice turnover (desp. não-folha vs fat.) subiu mais de 5 p.p. em ${months[i].month}.`,
        });
      }
    }

    return { year: y, months, alerts };
  }

  async getAdminUserRanking(user: any, yearStr?: string) {
    this.ensureAdminAnalytics(user);
    const y = yearStr && /^\d{4}$/.test(yearStr) ? Number(yearStr) : new Date().getUTCFullYear();
    const start = new Date(Date.UTC(y, 0, 1));
    const end = new Date(Date.UTC(y + 1, 0, 1));
    const prevStart = new Date(Date.UTC(y - 1, 0, 1));
    const prevEnd = new Date(Date.UTC(y, 0, 1));

    const users = await this.prisma.user.findMany({
      select: { id: true, name: true, email: true, active: true, role: true },
    });

    const sumsCurrent = await this.prisma.transacao.groupBy({
      by: ['userId'],
      where: { type: 'RECEITA', date: { gte: start, lt: end } },
      _sum: { amount: true },
    });
    const sumsPrev = await this.prisma.transacao.groupBy({
      by: ['userId'],
      where: { type: 'RECEITA', date: { gte: prevStart, lt: prevEnd } },
      _sum: { amount: true },
    });
    const desCurrent = await this.prisma.transacao.groupBy({
      by: ['userId'],
      where: { type: 'DESPESA', date: { gte: start, lt: end } },
      _sum: { amount: true },
    });

    const curM = new Map(sumsCurrent.map((x) => [x.userId, Number(x._sum.amount || 0)]));
    const prevM = new Map(sumsPrev.map((x) => [x.userId, Number(x._sum.amount || 0)]));
    const desM = new Map(desCurrent.map((x) => [x.userId, Number(x._sum.amount || 0)]));

    const ranking = users
      .map((u) => {
        const rec = curM.get(u.id) || 0;
        const prev = prevM.get(u.id) || 0;
        const des = desM.get(u.id) || 0;
        const growthYoY = prev > 0 ? (rec - prev) / prev : rec > 0 ? 1 : 0;
        const efficiency = this.divideSafely(rec, des + 1);
        return {
          userId: u.id,
          name: u.name,
          email: u.email,
          active: u.active,
          role: u.role,
          faturamento: rec,
          growthYoY,
          efficiency,
        };
      })
      .sort((a, b) => b.faturamento - a.faturamento)
      .map((r, idx) => ({ ...r, rank: idx + 1 }));

    return { year: y, ranking };
  }

  async getAdminQuarterly(user: any, yearStr?: string) {
    this.ensureAdminAnalytics(user);
    const y = yearStr && /^\d{4}$/.test(yearStr) ? Number(yearStr) : new Date().getUTCFullYear();
    const start = new Date(Date.UTC(y, 0, 1));
    const end = new Date(Date.UTC(y + 1, 0, 1));

    const txs = await this.prisma.transacao.findMany({
      where: { date: { gte: start, lt: end } },
      include: { categoria: true },
    });

    const qMap = new Map<string, { receita: number; despesa: number; fopeg: number }>();
    const qKey = (d: Date) => {
      const m = d.getUTCMonth();
      const q = Math.floor(m / 3) + 1;
      return `${d.getUTCFullYear()}-Q${q}`;
    };

    for (const t of txs) {
      const key = qKey(new Date(t.date));
      if (!qMap.has(key)) qMap.set(key, { receita: 0, despesa: 0, fopeg: 0 });
      const z = qMap.get(key)!;
      const type = String(t.type || '').toUpperCase();
      const amt = Number(t.amount || 0);
      if (type === 'RECEITA') z.receita += amt;
      if (type === 'DESPESA') {
        z.despesa += amt;
        if (this.isFolhaTransaction(t)) z.fopeg += amt;
      }
    }

    const quarters = Array.from(qMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, v]) => ({
        key,
        faturamento: v.receita,
        fopeg: v.fopeg,
        turnoverPct: this.divideSafely(v.despesa - v.fopeg, v.receita) * 100,
        margemPct: this.divideSafely(v.receita - v.despesa, v.receita) * 100,
      }));

    return { year: y, quarters };
  }

  async getAdminInteligencia(user: any, yearStr?: string) {
    this.ensureAdminAnalytics(user);
    const [consolidated, ranking, quarterly] = await Promise.all([
      this.getAdminGlobalConsolidated(user, yearStr),
      this.getAdminUserRanking(user, yearStr),
      this.getAdminQuarterly(user, yearStr),
    ]);

    const ms = consolidated.months;
    let forecast: Array<{ month: string; faturamentoEstimado: number; method: string }> = [];
    if (ms.length >= 2) {
      const last = ms[ms.length - 1];
      const prev = ms[ms.length - 2];
      const trend = last.faturamento - prev.faturamento;
      const [y, m] = last.month.split('-').map(Number);
      const nextD = new Date(Date.UTC(y, m, 1));
      const nextMonth = nextD.toISOString().slice(0, 7);
      forecast = [
        {
          month: nextMonth,
          faturamentoEstimado: Math.max(0, last.faturamento + trend),
          method: 'tendencia_ultimos_2_meses',
        },
      ];
    }

    return { ...consolidated, ranking: ranking.ranking, quarters: quarterly.quarters, forecast };
  }
}

