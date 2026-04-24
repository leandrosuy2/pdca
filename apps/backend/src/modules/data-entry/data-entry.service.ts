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

type ValidateColumnPayload = {
  unitId?: string;
  month?: string;
  sectionKey?: string;
  weekIndex?: number;
  validated?: boolean;
};

@Injectable()
export class DataEntryService {
  constructor(private prisma: PrismaService) {}

  private readonly financialSummarySectionKey = 'resumo_financeiro';
  private readonly receitaSectionKey = 'receita';
  private readonly massaSalarialRowKey = 'massa_salarial';
  private readonly encargosFolhaRowKey = 'encargos_folha';
  private readonly despesaAdmRowKey = 'despesa_adm';
  private readonly impostosRowKey = 'impostos';

  private isAdmin(user: any) {
    return String(user?.role || '').toUpperCase() === 'ADMIN';
  }

  private isDataEntry(user: any) {
    return String(user?.role || '').toUpperCase() === 'DATA_ENTRY';
  }

  private isUnitEntry(user: any) {
    return String(user?.role || '').toUpperCase() === 'UNIT_ENTRY';
  }

  private isLaunchManager(user: any) {
    return this.isAdmin(user) || this.isDataEntry(user);
  }

  private canEditLaunchValues(user: any) {
    return this.isAdmin(user) || this.isDataEntry(user) || this.isUnitEntry(user);
  }

  private canEditFinancialSummary(user: any) {
    return this.isAdmin(user) || this.isDataEntry(user);
  }

  private getValidatedColumnKey(sectionKey: string, weekIndex: number) {
    return `${sectionKey}:${weekIndex}`;
  }

  private roundCurrency(value: number) {
    return Number(Number(value || 0).toFixed(2));
  }

  private getEntryMapValue(entryMap: Map<string, number[]>, sectionKey: string, rowKey: string) {
    return entryMap.get(`${sectionKey}:${rowKey}`) || [0, 0, 0, 0, 0];
  }

  private getSectionWeeklyTotals(entryMap: Map<string, number[]>, sectionKey: string) {
    const section = DATA_ENTRY_TEMPLATE.find((item) => item.key === sectionKey);
    const totals = [0, 0, 0, 0, 0];

    if (!section) return totals;

    for (const row of section.rows) {
      const values = this.getEntryMapValue(entryMap, sectionKey, row.key);
      for (let index = 0; index < 5; index += 1) {
        totals[index] += Number(values[index] || 0);
      }
    }

    return totals.map((value) => this.roundCurrency(value));
  }

  private applyAutomaticFinancialSummary(entryMap: Map<string, number[]>) {
    const receitaWeekly = this.getSectionWeeklyTotals(entryMap, this.receitaSectionKey);
    const massaSalarialWeekly = this.getEntryMapValue(
      entryMap,
      this.financialSummarySectionKey,
      this.massaSalarialRowKey,
    ).map((value) => this.roundCurrency(Number(value || 0)));

    entryMap.set(
      `${this.financialSummarySectionKey}:${this.encargosFolhaRowKey}`,
      massaSalarialWeekly.map((value) => this.roundCurrency(value * 1.05)),
    );
    entryMap.set(
      `${this.financialSummarySectionKey}:${this.despesaAdmRowKey}`,
      receitaWeekly.map((value) => this.roundCurrency(value * 0.07)),
    );
    entryMap.set(
      `${this.financialSummarySectionKey}:${this.impostosRowKey}`,
      receitaWeekly.map((value) => this.roundCurrency(value * 0.096)),
    );
  }

  private ensureCanUseDataEntry(user: any) {
    const role = String(user?.role || '').toUpperCase();
    if (!['ADMIN', 'DATA_ENTRY', 'USER', 'UNIT_ENTRY'].includes(role)) {
      throw new ForbiddenException('Acesso restrito ao fluxo de input mensal.');
    }
  }

  private async getAssignedUnit(user: any) {
    if (!this.isUnitEntry(user)) return null;

    const assignment = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        launchUnit: {
          include: {
            gestora: true,
            user: true,
          },
        },
      },
    });

    if (!assignment?.launchUnit) {
      throw new ForbiddenException('Usuario de unidade sem unidade vinculada.');
    }

    return assignment.launchUnit;
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
    if (this.isUnitEntry(user)) {
      const assignedUnit = await this.getAssignedUnit(user);
      const ownerDashboard =
        (await this.prisma.dashboard.findFirst({
          where: {
            ownerId: assignedUnit.userId,
          },
          include: {
            owner: {
              select: {
                id: true,
                name: true,
                email: true,
                template: true,
              },
            },
          },
          orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        })) || null;

      if (!ownerDashboard) {
        return [];
      }

      return [
        {
          ...ownerDashboard,
          owner: ownerDashboard.owner
            ? {
                ...ownerDashboard.owner,
                unidades: [assignedUnit],
              }
            : null,
        },
      ];
    }

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
    const assignedUnit = this.isUnitEntry(user) ? await this.getAssignedUnit(user) : null;

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      permissions: {
        canManageAllLaunches: this.isLaunchManager(user),
        canDeleteLaunches: this.isLaunchManager(user),
        canEditLaunchValues: this.canEditLaunchValues(user),
        canEditFinancialSummary: this.canEditFinancialSummary(user),
        assignedUnitId: assignedUnit?.id || null,
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

    const assignedUnit = this.isUnitEntry(user) ? await this.getAssignedUnit(user) : null;

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
        ...(assignedUnit ? { unidadeId: assignedUnit.id } : {}),
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

    const assignedUnit = await this.getAssignedUnit(user);
    const accessibleOwnerIds = await this.getAccessibleOwnerIds(user);
    if (assignedUnit && assignedUnit.id !== unit.id) {
      throw new ForbiddenException('Voce nao pode visualizar lancamentos de outra unidade.');
    }
    if (!this.isAdmin(user) && !assignedUnit && !accessibleOwnerIds.has(unit.userId)) {
      throw new ForbiddenException('Voce nao pode lancar dados para esta unidade.');
    }

    const { start, end } = this.getMonthRange(month);
    const [transactions, validations] = await Promise.all([
      this.prisma.transacao.findMany({
        where: {
          userId: unit.userId,
          unidadeId: unit.id,
          date: { gte: start, lt: end },
        },
        include: {
          categoria: true,
        },
        orderBy: { date: 'asc' },
      }),
      this.prisma.inputColumnValidation.findMany({
        where: {
          unitId: unit.id,
          month,
        },
        include: {
          validatedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: [{ sectionKey: 'asc' }, { weekIndex: 'asc' }],
      }),
    ]);

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

    this.applyAutomaticFinancialSummary(manualMap);

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
      validatedColumns: validations.map((item) => ({
        sectionKey: item.sectionKey,
        weekIndex: item.weekIndex,
        validatedAt: item.updatedAt.toISOString(),
        validatedBy: item.validatedBy,
      })),
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

    if (!this.canEditLaunchValues(user)) {
      throw new ForbiddenException('Somente o administrador de input pode alterar os valores lancados.');
    }

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

    const assignedUnit = await this.getAssignedUnit(user);
    const accessibleOwnerIds = await this.getAccessibleOwnerIds(user, true);
    if (assignedUnit && assignedUnit.id !== unit.id) {
      throw new ForbiddenException('Voce nao pode salvar dados em outra unidade.');
    }
    if (!this.isAdmin(user) && !assignedUnit && !accessibleOwnerIds.has(unit.userId)) {
      throw new ForbiddenException('Voce nao pode salvar dados para esta unidade.');
    }

    const { start, end, year, monthIndex } = this.getMonthRange(month);
    const sectionMap = new Map(DATA_ENTRY_TEMPLATE.map((section) => [section.key, section]));
    const validations = await this.prisma.inputColumnValidation.findMany({
      where: {
        unitId: unit.id,
        month,
      },
      select: {
        sectionKey: true,
        weekIndex: true,
      },
    });
    const validatedColumns = new Set(
      validations.map((item) => this.getValidatedColumnKey(item.sectionKey, item.weekIndex)),
    );

    const sanitizedEntries = entries
      .map((entry) => {
        const section = sectionMap.get(String(entry.sectionKey || ''));
        if (!section) return null;
        const row = section.rows.find((item) => item.key === String(entry.rowKey || ''));
        if (!row) return null;
        if (
          section.key === this.financialSummarySectionKey &&
          row.key !== this.massaSalarialRowKey &&
          !this.canEditFinancialSummary(user)
        ) {
          return null;
        }
        if (
          section.key === this.financialSummarySectionKey &&
          row.key !== this.massaSalarialRowKey
        ) {
          return null;
        }
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

    const entryValueMap = new Map<string, number[]>();
    for (const entry of sanitizedEntries) {
      entryValueMap.set(`${entry.section.key}:${entry.row.key}`, entry.weeklyValues);
    }
    this.applyAutomaticFinancialSummary(entryValueMap);

    const automaticFinancialRows = [
      this.encargosFolhaRowKey,
      this.despesaAdmRowKey,
      this.impostosRowKey,
    ].map((rowKey) => {
      const section = sectionMap.get(this.financialSummarySectionKey)!;
      const row = section.rows.find((item) => item.key === rowKey)!;
      return {
        section,
        row,
        weeklyValues: this.getEntryMapValue(entryValueMap, this.financialSummarySectionKey, rowKey),
      };
    });

    const persistedEntries = [
      ...sanitizedEntries,
      ...automaticFinancialRows,
    ];

    await this.prisma.$transaction(async (tx) => {
      const existingManualTransactions = await tx.transacao.findMany({
        where: {
          userId: unit.userId,
          unidadeId: unit.id,
          date: { gte: start, lt: end },
          description: { startsWith: 'INPUT|' },
        },
        select: {
          id: true,
          description: true,
        },
      });

      const deletableIds = existingManualTransactions
        .filter((transaction) => {
          const parts = String(transaction.description || '').split('|');
          if (parts.length !== 4) return true;
          const [, sectionKey, , weekMarker] = parts;
          const weekIndex = Math.max(0, Math.min(4, Number(weekMarker.replace('W', '')) - 1));

          if (
            sectionKey === this.financialSummarySectionKey &&
            !this.canEditFinancialSummary(user)
          ) {
            return false;
          }

          if (!this.isLaunchManager(user) && validatedColumns.has(this.getValidatedColumnKey(sectionKey, weekIndex))) {
            return false;
          }

          return true;
        })
        .map((transaction) => transaction.id);

      if (deletableIds.length > 0) {
        await tx.transacao.deleteMany({
          where: {
            id: { in: deletableIds },
          },
        });
      }

      const categoryKeys = new Map<string, { id: string }>();
      const existingCategories = await tx.categoria.findMany({
        where: { userId: unit.userId },
      });

      for (const category of existingCategories) {
        categoryKeys.set(`${category.name}::${category.type}`, { id: category.id });
      }

      for (const entry of persistedEntries) {
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
            if (!this.isLaunchManager(user) && validatedColumns.has(this.getValidatedColumnKey(entry.section.key, weekIndex))) {
              return null;
            }
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

  async validateColumn(user: any, payload: ValidateColumnPayload) {
    this.ensureCanUseDataEntry(user);

    if (!this.isLaunchManager(user)) {
      throw new ForbiddenException('Somente o administrador de input pode validar colunas.');
    }

    const unitId = String(payload?.unitId || '').trim();
    const month = String(payload?.month || '').trim();
    const sectionKey = String(payload?.sectionKey || '').trim();
    const weekIndex = Number(payload?.weekIndex);
    const validated = payload?.validated !== false;

    if (!unitId || !month || !sectionKey || !Number.isInteger(weekIndex) || weekIndex < 0 || weekIndex > 4) {
      throw new BadRequestException('Dados invalidos para validacao da coluna.');
    }

    const unit = await this.prisma.unidade.findUnique({
      where: { id: unitId },
      include: { user: true },
    });

    if (!unit) {
      throw new NotFoundException('Unidade nao encontrada.');
    }

    const accessibleOwnerIds = await this.getAccessibleOwnerIds(user, true);
    if (!this.isAdmin(user) && !accessibleOwnerIds.has(unit.userId)) {
      throw new ForbiddenException('Voce nao pode validar colunas desta unidade.');
    }

    const sectionExists = DATA_ENTRY_TEMPLATE.some((section) => section.key === sectionKey);
    if (!sectionExists) {
      throw new BadRequestException('Secao invalida para validacao.');
    }

    if (validated) {
      await this.prisma.inputColumnValidation.upsert({
        where: {
          unitId_month_sectionKey_weekIndex: {
            unitId,
            month,
            sectionKey,
            weekIndex,
          },
        },
        create: {
          unitId,
          month,
          sectionKey,
          weekIndex,
          validatedById: user.id,
        },
        update: {
          validatedById: user.id,
        },
      });
    } else {
      await this.prisma.inputColumnValidation.deleteMany({
        where: {
          unitId,
          month,
          sectionKey,
          weekIndex,
        },
      });
    }

    return this.getMonthlyInput(user, unitId, month);
  }

  async deleteMonthlyInput(user: any, unitId: string, month: string) {
    this.ensureCanUseDataEntry(user);

    if (!this.isLaunchManager(user)) {
      throw new ForbiddenException('Somente o administrador de lancamentos pode excluir lancamentos.');
    }

    const normalizedUnitId = String(unitId || '').trim();
    const normalizedMonth = String(month || '').trim();

    if (!normalizedUnitId || !normalizedMonth) {
      throw new BadRequestException('Unidade e mes sao obrigatorios.');
    }

    const unit = await this.prisma.unidade.findUnique({
      where: { id: normalizedUnitId },
      include: { user: true },
    });

    if (!unit) {
      throw new NotFoundException('Unidade nao encontrada.');
    }

    const accessibleOwnerIds = await this.getAccessibleOwnerIds(user, true);
    if (!this.isAdmin(user) && !accessibleOwnerIds.has(unit.userId)) {
      throw new ForbiddenException('Voce nao pode excluir dados desta unidade.');
    }

    const { start, end } = this.getMonthRange(normalizedMonth);
    const deleted = await this.prisma.transacao.deleteMany({
      where: {
        userId: unit.userId,
        unidadeId: unit.id,
        date: { gte: start, lt: end },
        description: { startsWith: 'INPUT|' },
      },
    });

    return {
      success: true,
      deletedCount: deleted.count,
      unit: {
        id: unit.id,
        name: unit.name,
      },
      month: normalizedMonth,
    };
  }
}
