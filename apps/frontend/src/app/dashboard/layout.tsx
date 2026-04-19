'use client';

import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { LogOut, TrendingUp, Bell, Search, UserCircle } from 'lucide-react';

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
          <div className="flex items-center space-x-3">
            <TrendingUp size={28} className="text-primary" />
            <h1 className="text-xl font-bold tracking-tight">FinDash Pro</h1>
          </div>
          
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
