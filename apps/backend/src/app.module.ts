import { existsSync } from 'fs';
import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validate } from './common/env.validation';
import { HealthModule } from './modules/health/health.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { UsersModule } from './modules/users/users.module';

/** Monorepo: cwd costuma ser a raiz; Nest por padrão só lê `.env` do cwd. */
function resolveEnvFilePaths(): string[] {
  const candidates = [
    join(process.cwd(), 'apps', 'backend', '.env'),
    join(__dirname, '..', '.env'),
    join(process.cwd(), '.env'),
  ];
  return candidates.filter((p) => existsSync(p));
}

const envPaths = resolveEnvFilePaths();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ...(envPaths.length ? { envFilePath: envPaths } : {}),
      validate,
    }),
    PrismaModule,
    AuthModule,
    DashboardModule,
    UsersModule,
    HealthModule,
  ],
})
export class AppModule {}
