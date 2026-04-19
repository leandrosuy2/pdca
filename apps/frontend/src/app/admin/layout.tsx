'use client';

import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { ArrowLeft, LogOut, Shield } from 'lucide-react';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/70 backdrop-blur">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Shield className="text-primary" size={22} />
            <div>
              <div className="text-sm font-semibold">Área Administrativa</div>
              <div className="text-xs text-muted-foreground">Gestão de usuários e acessos</div>
            </div>
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

      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
