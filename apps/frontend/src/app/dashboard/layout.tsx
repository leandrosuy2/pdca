'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { LogOut, Bell, Search, UserCircle } from 'lucide-react';
import logoVV from '@/assets/logo_vv.png';

export default function DashboardLayout({
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
      <header className="border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            href="/dashboards"
            className="flex items-center rounded-lg p-1 outline-offset-2 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Ir para início"
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
          
          <div className="flex items-center space-x-6">
            <div className="relative hidden md:block">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
              <input
                type="search"
                placeholder="Pesquisar..."
                className="pl-9 pr-4 py-1.5 h-9 bg-secondary/50 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary w-64"
              />
            </div>
            <button className="text-muted-foreground hover:text-foreground transition-colors relative">
              <Bell size={20} />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-destructive rounded-full"></span>
            </button>
            <div className="h-6 w-px bg-border"></div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <UserCircle size={28} className="text-muted-foreground" />
                <span className="text-sm font-medium hidden sm:block">Admin</span>
              </div>
              <button 
                onClick={handleLogout}
                className="flex items-center space-x-1 text-sm text-destructive hover:text-destructive/80 transition-colors"
                title="Sair"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
