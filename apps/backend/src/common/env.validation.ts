import { z } from 'zod';

export const envSchema = z.object({
  PORT: z.string().default('3001').transform(Number),
  DATABASE_URL: z.string().optional(),
  JWT_SECRET: z
    .string()
    .min(1, 'JWT_SECRET é obrigatório — defina em apps/backend/.env (ou na raiz do monorepo com as variáveis da API).'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validate(config: Record<string, unknown>) {
  const result = envSchema.safeParse(config);
  
  if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.format());
    throw new Error('Invalid environment variables');
  }
  
  return result.data;
}
