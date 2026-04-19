const raw = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export const apiUrl = raw.replace(/\/+$/, '');

export const dashboardApiUrl = `${apiUrl}/dashboard`;

export const authLoginUrl = `${apiUrl}/auth/login`;

export const usersApiUrl = `${apiUrl}/users`;

export const healthUrl = `${apiUrl}/health`;
