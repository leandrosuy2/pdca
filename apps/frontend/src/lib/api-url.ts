/**
 * URL da API NestJS.
 *
 * 1) `NEXT_PUBLIC_API_URL` no `.env` (ex.: `https://api.seudominio.com`) — obrigatório quando a API está em
 *    outro host ou em painéis (Easypanel, etc.) em que o front é HTTPS na 443 e a porta **3001** do mesmo
 *    domínio **não** está acessível na internet.
 * 2) No navegador, se não houver env: mesmo **hostname** do front + `NEXT_PUBLIC_API_PORT` (padrão **3001**).
 *    Ex.: front em `http://31.97.166.208:3000` → API `http://31.97.166.208:3001`.
 * 3) Fallback local: `http://localhost:3001`.
 */
export function getApiUrl(): string {
  const fromEnv =
    typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL
      ? String(process.env.NEXT_PUBLIC_API_URL).trim().replace(/\/+$/, '')
      : '';
  if (fromEnv) return fromEnv;

  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      const apiPort =
        (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_PORT?.trim()) || '3001';
      return `${protocol}//${hostname}:${apiPort}`;
    }
  }

  return 'http://localhost:3001';
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
