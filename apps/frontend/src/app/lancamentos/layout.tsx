'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { ClipboardPenLine, LogOut, UserCircle } from 'lucide-react';
import logoVV from '@/assets/logo_vv.png';

export default function LancamentosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  const handleLogout = () => {
    Cookies.remove('token');
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link
            href="/lancamentos"
            className="flex items-center rounded-lg p-1 outline-offset-2 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Ir para lancamentos"
          >
            <Image
              src={logoVV}
              alt=""
              priority
              className="h-9 w-auto max-w-[200px] object-contain"
              height={36}
              width={200}
              sizes="200px"
            />
          </Link>

          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary md:flex">
              <ClipboardPenLine size={14} />
              Input Mensal
            </div>
            <div className="h-6 w-px bg-border" />
            <div className="flex items-center gap-2">
              <UserCircle size={28} className="text-muted-foreground" />
              <span className="hidden text-sm font-medium sm:block">Operacao de lancamentos</span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center space-x-1 text-sm text-destructive transition-colors hover:text-destructive/80"
              title="Sair"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>
      <main className="container mx-auto flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
