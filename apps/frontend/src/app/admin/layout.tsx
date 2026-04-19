'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { ArrowLeft, BarChart3, LogOut, Shield, Sparkles, Users } from 'lucide-react';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const nav = [
    { href: '/admin/inteligencia', label: 'Inteligência', icon: Sparkles },
    { href: '/admin/resumo', label: 'Resumo', icon: BarChart3 },
    { href: '/admin/users', label: 'Usuários', icon: Users },
  ] as const;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/70 backdrop-blur">
        <div className="container mx-auto flex h-16 flex-wrap items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 flex-1 items-center gap-6">
            <div className="flex items-center gap-3">
              <Shield className="shrink-0 text-primary" size={22} />
              <div>
                <div className="text-sm font-semibold">Área Administrativa</div>
                <div className="text-xs text-muted-foreground">Apenas administradores</div>
              </div>
            </div>
            <nav className="hidden items-center gap-1 sm:flex">
              {nav.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                      active
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                    }`}
                  >
                    <Icon size={16} />
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/dashboards')}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft size={16} />
              Voltar
            </button>
            <button
              onClick={() => {
                Cookies.remove('token');
                router.push('/login');
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-destructive transition hover:bg-destructive/10"
            >
              <LogOut size={16} />
              Sair
            </button>
          </div>
        </div>
      </header>

      <div className="border-b border-border bg-card/40 sm:hidden">
        <nav className="container mx-auto flex gap-1 px-4 py-2">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-medium ${
                  active ? 'bg-primary/15 text-primary' : 'text-muted-foreground'
                }`}
              >
                <Icon size={14} />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
