import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function decodeTokenRole(token: string) {
  try {
    const payload = token.split('.')[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(normalized));
    return String(decoded?.role || '').toUpperCase();
  } catch {
    return '';
  }
}

function getLandingPath(role: string) {
  if (role === 'DATA_ENTRY' || role === 'UNIT_ENTRY') return '/lancamentos';
  if (role === 'ADMIN') return '/admin/inteligencia';
  return '/dashboard';
}

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  const isPublicPath = path === '/login';
  const token = request.cookies.get('token')?.value || '';
  const role = decodeTokenRole(token);
  const isDataEntry = role === 'DATA_ENTRY';
  const isUnitEntry = role === 'UNIT_ENTRY';
  const isAdmin = role === 'ADMIN';
  const landingPath = getLandingPath(role);

  if (isPublicPath && token) {
    return NextResponse.redirect(new URL(landingPath, request.nextUrl));
  }

  if (path === '/' && token) {
    return NextResponse.redirect(new URL(landingPath, request.nextUrl));
  }

  if (
    !isPublicPath &&
    !token &&
    (path.startsWith('/dashboard') ||
      path.startsWith('/dashboards') ||
      path.startsWith('/admin') ||
      path.startsWith('/lancamentos'))
  ) {
    return NextResponse.redirect(new URL('/login', request.nextUrl));
  }

  if (token && (isDataEntry || isUnitEntry) && (path.startsWith('/dashboard') || path.startsWith('/dashboards') || path.startsWith('/admin'))) {
    return NextResponse.redirect(new URL('/lancamentos', request.nextUrl));
  }

  if (token && !isDataEntry && !isUnitEntry && path.startsWith('/lancamentos')) {
    return NextResponse.redirect(new URL(landingPath, request.nextUrl));
  }

  if (token && !isAdmin && path.startsWith('/admin')) {
    return NextResponse.redirect(new URL('/dashboard', request.nextUrl));
  }

  if (token && !isAdmin && path.startsWith('/dashboards')) {
    return NextResponse.redirect(new URL('/dashboard', request.nextUrl));
  }
}

export const config = {
  matcher: [
    '/',
    '/login',
    '/lancamentos/:path*',
    '/dashboard/:path*',
    '/dashboards/:path*',
    '/admin/:path*'
  ]
};
