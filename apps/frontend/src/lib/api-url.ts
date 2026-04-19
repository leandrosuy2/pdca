/**
 * URL da API NestJS (chamadas a partir do navegador).
 *
 * 1) `NEXT_PUBLIC_API_URL` — URL absoluta quando a API é outro domínio (ex.: CDN + API pública).
 * 2) Sem env no browser: prefixo **`/api`** — o Next faz rewrite para o Nest (`API_INTERNAL_URL`, padrão
 *    `http://127.0.0.1:3001`). Assim HTTPS na 443 não precisa expor a porta 3001 na internet.
 * 3) Sem `window` (build/SSR): `http://127.0.0.1:3001` só se algo rodar fetch no servidor sem URL pública.
 */
export function getApiUrl(): string {
  const fromEnv =
    typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL
      ? String(process.env.NEXT_PUBLIC_API_URL).trim().replace(/\/+$/, '')
      : '';
  if (fromEnv) return fromEnv;

  if (typeof window !== 'undefined') {
    return '/api';
  }

  return 'http://127.0.0.1:3001';
}

export function getDashboardApiUrl(): string {
  return `${getApiUrl()}/dashboard`;
}

export function getAuthLoginUrl(): string {
  return `${getApiUrl()}/auth/login`;
}

export function getUsersApiUrl(): string {
  return `${getApiUrl()}/users`;
}

export function getHealthUrl(): string {
  return `${getApiUrl()}/health`;
}
