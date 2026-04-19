import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';

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
        active: true,
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
        active: true,
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
    const lastMap = new Map(lastByUser.map((r) => [r.userId, r._max.date]));

    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    const rows = users.map((u) => {
      const lastTx = lastMap.get(u.id) ?? null;
      const lastActivityAt = lastTx ?? u.updatedAt;
      const recentWindow =
        lastActivityAt && now - new Date(lastActivityAt).getTime() <= sevenDays;

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        active: u.active,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        transactionCount: u._count.transacoes,
        ownedDashboardCount: u._count.dashboards,
        lastActivityAt: lastTx ? lastTx.toISOString() : null,
        /** Sem WebSocket: “pulso” = conta ativa e houve lançamento nos últimos 7 dias */
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
        active: true,
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
      throw new NotFoundException('Usuário não encontrado.');
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
        select: { id: true, name: true, slug: true, isDefault: true, createdAt: true },
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
              owner: { select: { name: true, email: true } },
            },
          },
        },
      }),
    ]);

    return {
      user,
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
    const active = payload.active !== false;

    if (!name || !email || !password) {
      throw new BadRequestException('Nome, e-mail e senha são obrigatórios.');
    }

    if (!['ADMIN', 'USER'].includes(role)) {
      throw new BadRequestException('Perfil inválido. Use ADMIN ou USER.');
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new BadRequestException('Já existe um usuário com este e-mail.');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        name,
        email,
        password: passwordHash,
        role,
        active,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
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
      throw new BadRequestException('Usuário não encontrado.');
    }

    await this.prisma.transacao.deleteMany({ where: { userId } });
    await this.prisma.unidade.deleteMany({ where: { userId } });
    await this.prisma.categoria.deleteMany({ where: { userId } });

    return {
      success: true,
      message: `Dados do dashboard do usuário ${user.name} foram limpos com sucesso.`,
      user,
    };
  }
}
