'use client';

import { getAuthLoginUrl } from '@/lib/api-url';
import Image from 'next/image';
import logoVV from '@/assets/logo_vv.png';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import axios from 'axios';
import { Lock, Mail, Loader2 } from 'lucide-react';

const getPostLoginPath = (role: unknown) => {
  const normalized = String(role || '').toUpperCase();
  if (normalized === 'DATA_ENTRY' || normalized === 'UNIT_ENTRY') return '/lancamentos';
  if (normalized === 'ADMIN') return '/admin/inteligencia';
  return '/dashboard';
};

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await axios.post(getAuthLoginUrl(), {
        email,
        password,
      });

      if (response.data.access_token) {
        Cookies.set('token', response.data.access_token, { expires: 1 });
        router.push(getPostLoginPath(response.data.user?.role));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Left side presentation */}
      <div className="hidden lg:flex flex-col flex-1 bg-card items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary via-background to-background"></div>
        <div className="z-10 text-center max-w-lg space-y-6">
          <div className="flex flex-col items-center justify-center mb-8">
            <Image
              src={logoVV}
              alt="FinDash Pro"
              priority
              className="h-14 w-auto max-w-[min(100%,280px)] object-contain sm:h-16"
              height={64}
              width={320}
              sizes="(max-width: 1024px) 240px, 320px"
            />
          </div>
          <h2 className="text-3xl font-semibold opacity-90">Inteligência Financeira em Tempo Real</h2>
          <p className="text-muted-foreground text-lg">
            Tenha controle absoluto de todas as suas unidades, despesas e receitas em um cockpit de altíssimo nível.
          </p>
        </div>
      </div>

      {/* Right side login */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center lg:hidden flex flex-col items-center mb-8">
            <Image
              src={logoVV}
              alt="FinDash Pro"
              priority
              className="h-12 w-auto max-w-[min(100%,260px)] object-contain"
              height={48}
              width={280}
              sizes="260px"
            />
          </div>

          <div className="space-y-2 text-center">
            <h2 className="text-3xl font-bold tracking-tight">Bem-vindo(a)</h2>
            <p className="text-sm text-muted-foreground">Insira suas credenciais para acessar sua conta</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6 mt-8">
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive text-destructive rounded-md text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <input
                  type="email"
                  placeholder="Seu E-mail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-secondary/50 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  required
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <input
                  type="password"
                  placeholder="Sua Senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-secondary/50 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center py-2.5 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-md transition-colors disabled:opacity-70"
            >
              {loading ? <Loader2 className="animate-spin h-5 w-5" /> : 'Entrar na Plataforma'}
            </button>
            <p className="text-center text-xs text-muted-foreground">

            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
