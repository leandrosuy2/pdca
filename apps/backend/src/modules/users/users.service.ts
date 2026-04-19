import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  private ensureAdmin(user: any) {
    if (!user || user.role !== 'ADMIN') {
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
