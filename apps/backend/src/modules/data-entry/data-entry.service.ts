import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DATA_ENTRY_TEMPLATE } from './data-entry.templates';

type SaveMonthlyPayload = {
  unitId?: string;
  month?: string;
  entries?: Array<{
    sectionKey?: string;
    rowKey?: string;
    weeklyValues?: number[];
  }>;
};

@Injectable()
export class DataEntryService {
  constructor(private prisma: PrismaService) {}

  private isAdmin(user: any) {
    return String(user?.role || '').toUpperCase() === 'ADMIN';
  }

  private isDataEntry(user: any) {
    return String(user?.role || '').toUpperCase() === 'DATA_ENTRY';
  }

  private ensureCanUseDataEntry(user: any) {
    const role = String(user?.role || '').toUpperCase();
    if (!['ADMIN', 'DATA_ENTRY', 'USER'].includes(role)) {
      throw new ForbiddenException('Acesso restrito ao fluxo de input mensal.');
    }
  }

  private getMonthRange(month: string) {
    const match = String(month || '').match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      throw new BadRequestException('Mes invalido. Use o formato YYYY-MM.');
    }

    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0));

    return { start, end, year, monthIndex };
  }

  private buildInputDate(year: number, monthIndex: number, weekIndex: number) {
    const dayByWeek = [1, 8, 15, 22, 29];
    return new Date(Date.UTC(year, monthIndex, dayByWeek[weekIndex] || 1, 12, 0, 0, 0));
  }

  private async getAccessibleDashboards(user: any, requireEdit = false) {
    if (this.isAdmin(user)) {
      return this.prisma.dashboard.findMany({
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
              template: true,
              unidades: {
                include: {
                  gestora: true,
                },
                orderBy: { name: 'asc' },
              },
            },
          },
        },
        where: {
          owner: {
            active: true,
          },
        },
        orderBy: [{ owner: { name: 'asc' } }, { name: 'asc' }],
      });
    }

    return this.prisma.dashboard.findMany({
      where: {
        OR: [
          { ownerId: user.id },
          {
            access: {
              some: requireEdit
                ? { userId: user.id, permission: { in: ['EDIT'] } }
                : { userId: user.id },
            },
          },
        ],
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            template: true,
            unidades: {
              include: {
                gestora: true,
              },
              orderBy: { name: 'asc' },
            },
          },
        },
      },
      orderBy: [{ owner: { name: 'asc' } }, { name: 'asc' }],
    });
  }

  private async getAccessibleOwnerIds(user: any, requireEdit = false) {
    const dashboards = await this.getAccessibleDashboards(user, requireEdit);
    return new Set(dashboards.map((dashboard) => dashboard.ownerId));
  }

  async getContext(user: any) {
    this.ensureCanUseDataEntry(user);

    const dashboards = await this.getAccessibleDashboards(user);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      template: DATA_ENTRY_TEMPLATE,
      dashboards: dashboards.map((dashboard) => ({
        id: dashboard.id,
        name: dashboard.name,
        owner: dashboard.owner
          ? {
              id: dashboard.owner.id,
              name: dashboard.owner.name,
              email: dashboard.owner.email,
              template: dashboard.owner.template,
            }
          : null,
        units: (dashboard.owner?.unidades || []).map((unit) => ({
          id: unit.id,
          name: unit.name,
          gestora: unit.gestora?.name || null,
          ownerId: unit.userId,
        })),
      })),
    };
  }

  async getLaunches(user: any, dashboardId?: string) {
    this.ensureCanUseDataEntry(user);

    const dashboards = await this.getAccessibleDashboards(user);
    const filteredDashboards = dashboardId
      ? dashboards.filter((dashboard) => dashboard.id === dashboardId)
      : dashboards;

    if (dashboardId && filteredDashboards.length === 0) {
      throw new ForbiddenException('Voce nao pode visualizar os lancamentos deste dashboard.');
    }

    const ownerIds = [...new Set(filteredDashboards.map((dashboard) => dashboard.ownerId))];
    if (ownerIds.length === 0) {
      return { launches: [] };
    }

    const dashboardByOwnerId = new Map(
      filteredDashboards.map((dashboard) => [
        dashboard.ownerId,
        {
          id: dashboard.id,
          name: dashboard.name,
          owner: dashboard.owner,
        },
      ]),
    );

    const transactions = await this.prisma.transacao.findMany({
      where: {
        userId: { in: ownerIds },
        description: { startsWith: 'INPUT|' },
      },
      include: {
        unidade: {
          include: {
            gestora: true,
          },
        },
      },
      orderBy: [{ date: 'desc' }, { updatedAt: 'desc' }],
    });

    const grouped = new Map<
      string,
      {
        dashboardId: string;
        dashboardName: string;
        ownerId: string;
        ownerName: string;
        ownerEmail: string;
        unitId: string;
        unitName: string;
        gestora: string | null;
        month: string;
        receita: number;
        despesa: number;
        resultado: number;
        rowsCount: number;
        updatedAt: Date;
      }
    >();

    for (const transaction of transactions) {
      const month = transaction.date.toISOString().slice(0, 7);
      const key = `${transaction.userId}:${transaction.unidadeId}:${month}`;
      const dashboard = dashboardByOwnerId.get(transaction.userId);
      if (!dashboard) continue;

      if (!grouped.has(key)) {
        grouped.set(key, {
          dashboardId: dashboard.id,
          dashboardName: dashboard.name,
          ownerId: transaction.userId,
          ownerName: dashboard.owner?.name || 'Sem proprietario',
          ownerEmail: dashboard.owner?.email || '—',
          unitId: transaction.unidadeId,
          unitName: transaction.unidade?.name || 'Sem unidade',
          gestora: transaction.unidade?.gestora?.name || transaction.gestora || null,
          month,
          receita: 0,
          despesa: 0,
          resultado: 0,
          rowsCount: 0,
          updatedAt: transaction.updatedAt,
        });
      }

      const item = grouped.get(key)!;
      const amount = Number(transaction.amount || 0);
      if (String(transaction.type || '').toUpperCase() === 'RECEITA') item.receita += amount;
      if (String(transaction.type || '').toUpperCase() === 'DESPESA') item.despesa += amount;
      item.resultado = item.receita - item.despesa;
      item.rowsCount += 1;
      if (transaction.updatedAt > item.updatedAt) item.updatedAt = transaction.updatedAt;
    }

    const launches = Array.from(grouped.values())
      .sort((a, b) => {
        if (a.month !== b.month) return b.month.localeCompare(a.month);
        if (a.ownerName !== b.ownerName) return a.ownerName.localeCompare(b.ownerName, 'pt-BR');
        return a.unitName.localeCompare(b.unitName, 'pt-BR');
      })
      .map((item) => ({
        ...item,
        updatedAt: item.updatedAt.toISOString(),
      }));

    return { launches };
  }

  async getMonthlyInput(user: any, unitId: string, month: string) {
    this.ensureCanUseDataEntry(user);

    const unit = await this.prisma.unidade.findUnique({
      where: { id: unitId },
      include: { gestora: true, user: true },
    });

    if (!unit) {
      throw new NotFoundException('Unidade nao encontrada.');
    }

    const accessibleOwnerIds = await this.getAccessibleOwnerIds(user);
    if (!this.isAdmin(user) && !accessibleOwnerIds.has(unit.userId)) {
      throw new ForbiddenException('Voce nao pode lancar dados para esta unidade.');
    }

    const { start, end } = this.getMonthRange(month);
    const transactions = await this.prisma.transacao.findMany({
      where: {
        userId: unit.userId,
        unidadeId: unit.id,
        date: { gte: start, lt: end },
      },
      include: {
        categoria: true,
      },
      orderBy: { date: 'asc' },
    });

    const summary = transactions.reduce(
      (acc, transaction) => {
        const amount = Number(transaction.amount || 0);
        if (String(transaction.type || '').toUpperCase() === 'RECEITA') acc.receita += amount;
        if (String(transaction.type || '').toUpperCase() === 'DESPESA') acc.despesa += amount;
        return acc;
      },
      { receita: 0, despesa: 0 },
    );

    const manualMap = new Map<string, number[]>();
    for (const transaction of transactions) {
      if (!String(transaction.description || '').startsWith('INPUT|')) continue;
      const parts = String(transaction.description || '').split('|');
      if (parts.length !== 4) continue;

      const [, sectionKey, rowKey, weekMarker] = parts;
      const weekIndex = Math.max(0, Math.min(4, Number(weekMarker.replace('W', '')) - 1));
      const key = `${sectionKey}:${rowKey}`;
      const current = manualMap.get(key) || [0, 0, 0, 0, 0];
      current[weekIndex] += Number(transaction.amount || 0);
      manualMap.set(key, current);
    }

    return {
      unit: {
        id: unit.id,
        name: unit.name,
        gestora: unit.gestora?.name || null,
        owner: {
          id: unit.user.id,
          name: unit.user.name,
          email: unit.user.email,
        },
      },
      month,
      template: DATA_ENTRY_TEMPLATE,
      summary: {
        receita: summary.receita,
        despesa: summary.despesa,
        resultado: summary.receita - summary.despesa,
      },
      entries: DATA_ENTRY_TEMPLATE.flatMap((section) =>
        section.rows.map((row) => ({
          sectionKey: section.key,
          rowKey: row.key,
          weeklyValues: manualMap.get(`${section.key}:${row.key}`) || [0, 0, 0, 0, 0],
        })),
      ),
    };
  }

  async saveMonthlyInput(user: any, payload: SaveMonthlyPayload) {
    this.ensureCanUseDataEntry(user);

    const unitId = String(payload?.unitId || '').trim();
    const month = String(payload?.month || '').trim();
    const entries = Array.isArray(payload?.entries) ? payload.entries : [];

    if (!unitId || !month) {
      throw new BadRequestException('Unidade e mes sao obrigatorios.');
    }

    const unit = await this.prisma.unidade.findUnique({
      where: { id: unitId },
      include: { gestora: true, user: true },
    });

    if (!unit) {
      throw new NotFoundException('Unidade nao encontrada.');
    }

    const accessibleOwnerIds = await this.getAccessibleOwnerIds(user, true);
    if (!this.isAdmin(user) && !accessibleOwnerIds.has(unit.userId)) {
      throw new ForbiddenException('Voce nao pode salvar dados para esta unidade.');
    }

    const { start, end, year, monthIndex } = this.getMonthRange(month);
    const sectionMap = new Map(DATA_ENTRY_TEMPLATE.map((section) => [section.key, section]));

    const sanitizedEntries = entries
      .map((entry) => {
        const section = sectionMap.get(String(entry.sectionKey || ''));
        if (!section) return null;
        const row = section.rows.find((item) => item.key === String(entry.rowKey || ''));
        if (!row) return null;
        const weeklyValues = Array.from({ length: 5 }, (_, index) => {
          const value = Number(entry.weeklyValues?.[index] || 0);
          return Number.isFinite(value) ? value : 0;
        });

        return {
          section,
          row,
          weeklyValues,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    await this.prisma.$transaction(async (tx) => {
      await tx.transacao.deleteMany({
        where: {
          userId: unit.userId,
          unidadeId: unit.id,
          date: { gte: start, lt: end },
          description: { startsWith: 'INPUT|' },
        },
      });

      const categoryKeys = new Map<string, { id: string }>();
      const existingCategories = await tx.categoria.findMany({
        where: { userId: unit.userId },
      });

      for (const category of existingCategories) {
        categoryKeys.set(`${category.name}::${category.type}`, { id: category.id });
      }

      for (const entry of sanitizedEntries) {
        const categoryKey = `${entry.section.categoryName}::${entry.section.type}`;
        let category = categoryKeys.get(categoryKey);
        if (!category) {
          const created = await tx.categoria.create({
            data: {
              userId: unit.userId,
              name: entry.section.categoryName,
              type: entry.section.type,
            },
          });
          category = { id: created.id };
          categoryKeys.set(categoryKey, category);
        }

        const records = entry.weeklyValues
          .map((value, weekIndex) => {
            if (!value) return null;
            return {
              description: `INPUT|${entry.section.key}|${entry.row.key}|W${weekIndex + 1}`,
              gestora: unit.gestora?.name || 'Sem Gestora',
              amount: value,
              date: this.buildInputDate(year, monthIndex, weekIndex),
              type: entry.section.type,
              userId: unit.userId,
              unidadeId: unit.id,
              categoriaId: category!.id,
            };
          })
          .filter((record): record is NonNullable<typeof record> => Boolean(record));

        if (records.length > 0) {
          await tx.transacao.createMany({ data: records });
        }
      }
    });

    return this.getMonthlyInput(user, unit.id, month);
  }
}
