import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  DASHBOARD_TEMPLATE_DEFINITIONS,
  normalizeDashboardTemplate,
} from '../dashboard/dashboard-templates';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  private ensureAdmin(user: any) {
    if (!user || String(user.role || '').toUpperCase() !== 'ADMIN') {
      throw new ForbiddenException('Acesso permitido apenas para administradores.');
    }
  }

  async listUsers(currentUser: any) {
    this.ensureAdmin(currentUser);

    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        template: true,
        active: true,
        launchUnit: {
          select: {
            id: true,
            name: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });

    return { users };
  }

  async getUsersSummary(currentUser: any) {
    this.ensureAdmin(currentUser);

    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        template: true,
        active: true,
        launchUnit: {
          select: {
            id: true,
            name: true,
          },
        },
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { transacoes: true, dashboards: true },
        },
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });

    const lastByUser = await this.prisma.transacao.groupBy({
      by: ['userId'],
      _max: { date: true },
    });
    const lastMap = new Map<string, Date | null>(lastByUser.map((r) => [r.userId, r._max.date]));

    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    const rows = users.map((u) => {
      const lastTx = lastMap.get(u.id) ?? null;
      const lastActivityAt = lastTx ?? u.updatedAt;
      const recentWindow =
        lastActivityAt && now - new Date(lastActivityAt).getTime() <= sevenDays;
      const template = normalizeDashboardTemplate(u.template);

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        template,
        templateMeta: DASHBOARD_TEMPLATE_DEFINITIONS[template],
        active: u.active,
        launchUnit: u.launchUnit,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        transactionCount: u._count.transacoes,
        ownedDashboardCount: u._count.dashboards,
        lastActivityAt: lastTx ? lastTx.toISOString() : null,
        recentActivity: Boolean(u.active && recentWindow),
      };
    });

    return { users: rows };
  }

  async getUserDetail(currentUser: any, userId: string) {
    this.ensureAdmin(currentUser);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        template: true,
        active: true,
        launchUnit: {
          select: {
            id: true,
            name: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            transacoes: true,
            unidades: true,
            categorias: true,
            dashboards: true,
            dashboardAccess: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario nao encontrado.');
    }

    const [recentTransactions, dashboardsOwned, accessGrants] = await Promise.all([
      this.prisma.transacao.findMany({
        where: { userId },
        orderBy: { date: 'desc' },
        take: 50,
        select: {
          id: true,
          description: true,
          amount: true,
          date: true,
          type: true,
          gestora: true,
          unidade: { select: { name: true } },
          categoria: { select: { name: true } },
        },
      }),
      this.prisma.dashboard.findMany({
        where: { ownerId: userId },
        select: {
          id: true,
          name: true,
          slug: true,
          isDefault: true,
          createdAt: true,
          template: true,
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.dashboardAccess.findMany({
        where: { userId },
        include: {
          dashboard: {
            select: {
              id: true,
              name: true,
              slug: true,
              template: true,
              owner: { select: { name: true, email: true } },
            },
          },
        },
      }),
    ]);

    return {
      user: {
        ...user,
        templateMeta: DASHBOARD_TEMPLATE_DEFINITIONS[normalizeDashboardTemplate(user.template)],
      },
      recentTransactions: recentTransactions.map((t) => ({
        ...t,
        date: t.date.toISOString(),
      })),
      dashboardsOwned,
      dashboardAccess: accessGrants.map((a) => ({
        permission: a.permission,
        dashboard: a.dashboard,
      })),
    };
  }

  async createUser(currentUser: any, payload: Record<string, any>) {
    this.ensureAdmin(currentUser);

    const name = String(payload.name || '').trim();
    const email = String(payload.email || '').trim().toLowerCase();
    const password = String(payload.password || '');
    const role = String(payload.role || 'USER').toUpperCase();
    const template = normalizeDashboardTemplate(payload.template);
    const active = payload.active !== false;
    const launchUnitId = payload.launchUnitId ? String(payload.launchUnitId).trim() : null;

    if (!name || !email || !password) {
      throw new BadRequestException('Nome, e-mail e senha sao obrigatorios.');
    }

    if (!['ADMIN', 'USER', 'DATA_ENTRY', 'UNIT_ENTRY'].includes(role)) {
      throw new BadRequestException('Perfil invalido. Use ADMIN, USER, DATA_ENTRY ou UNIT_ENTRY.');
    }

    if (role === 'UNIT_ENTRY' && !launchUnitId) {
      throw new BadRequestException('Usuarios UNIT_ENTRY precisam de uma unidade vinculada.');
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new BadRequestException('Ja existe um usuario com este e-mail.');
    }

    if (launchUnitId) {
      const unit = await this.prisma.unidade.findUnique({
        where: { id: launchUnitId },
        select: {
          id: true,
          name: true,
          launchInputUser: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!unit) {
        throw new BadRequestException('Unidade vinculada nao encontrada.');
      }

      if (unit.launchInputUser) {
        throw new BadRequestException('Esta unidade ja possui um usuario de lancamento vinculado.');
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        name,
        email,
        password: passwordHash,
        role,
        template,
        active,
        launchUnitId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        template: true,
        active: true,
        launchUnit: {
          select: {
            id: true,
            name: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    return { user };
  }

  async updateUser(currentUser: any, userId: string, payload: Record<string, any>) {
    this.ensureAdmin(currentUser);

    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        launchUnitId: true,
      },
    });

    if (!existingUser) {
      throw new NotFoundException('Usuario nao encontrado.');
    }

    const name = String(payload.name || '').trim();
    const email = String(payload.email || '').trim().toLowerCase();
    const password = String(payload.password || '');
    const role = String(payload.role || existingUser.role).toUpperCase();
    const template = normalizeDashboardTemplate(payload.template);
    const active = payload.active !== false;
    const launchUnitId =
      payload.launchUnitId === undefined
        ? existingUser.launchUnitId
        : payload.launchUnitId
          ? String(payload.launchUnitId).trim()
          : null;

    if (!name || !email) {
      throw new BadRequestException('Nome e e-mail sao obrigatorios.');
    }

    if (!['ADMIN', 'USER', 'DATA_ENTRY', 'UNIT_ENTRY'].includes(role)) {
      throw new BadRequestException('Perfil invalido. Use ADMIN, USER, DATA_ENTRY ou UNIT_ENTRY.');
    }

    if (role === 'UNIT_ENTRY' && !launchUnitId) {
      throw new BadRequestException('Usuarios UNIT_ENTRY precisam de uma unidade vinculada.');
    }

    const duplicatedEmail = await this.prisma.user.findFirst({
      where: {
        email,
        id: { not: userId },
      },
      select: { id: true },
    });

    if (duplicatedEmail) {
      throw new BadRequestException('Ja existe um usuario com este e-mail.');
    }

    if (launchUnitId) {
      const unit = await this.prisma.unidade.findUnique({
        where: { id: launchUnitId },
        select: {
          id: true,
          launchInputUser: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!unit) {
        throw new BadRequestException('Unidade vinculada nao encontrada.');
      }

      if (unit.launchInputUser && unit.launchInputUser.id !== userId) {
        throw new BadRequestException('Esta unidade ja possui um usuario de lancamento vinculado.');
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name,
        email,
        role,
        template,
        active,
        launchUnitId: role === 'UNIT_ENTRY' ? launchUnitId : null,
        ...(password ? { password: await bcrypt.hash(password, 10) } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        template: true,
        active: true,
        launchUnit: {
          select: {
            id: true,
            name: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    return { user };
  }

  async clearUserDashboardData(currentUser: any, userId: string) {
    this.ensureAdmin(currentUser);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      throw new BadRequestException('Usuario nao encontrado.');
    }

    await this.prisma.transacao.deleteMany({ where: { userId } });
    await this.prisma.unidade.deleteMany({ where: { userId } });
    await this.prisma.categoria.deleteMany({ where: { userId } });

    return {
      success: true,
      message: `Dados do dashboard do usuario ${user.name} foram limpos com sucesso.`,
      user,
    };
  }

  async deleteUser(currentUser: any, userId: string) {
    this.ensureAdmin(currentUser);

    if (String(currentUser?.id || currentUser?.sub || '') === String(userId)) {
      throw new BadRequestException('Voce nao pode excluir o seu proprio usuario.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        _count: {
          select: {
            dashboards: true,
            transacoes: true,
            unidades: true,
            categorias: true,
          },
        },
      },
    });

    if (!user) {
      throw new BadRequestException('Usuario nao encontrado.');
    }

    await this.prisma.user.delete({
      where: { id: userId },
    });

    return {
      success: true,
      message: `Usuario ${user.name} excluido com sucesso.`,
      deleted: {
        id: user.id,
        name: user.name,
        email: user.email,
        dashboards: user._count.dashboards,
        transacoes: user._count.transacoes,
        unidades: user._count.unidades,
        categorias: user._count.categorias,
      },
    };
  }
}
