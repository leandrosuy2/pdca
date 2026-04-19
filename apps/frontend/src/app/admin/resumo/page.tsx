'use client';

import { usersApiUrl } from '@/lib/api-url';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Cookies from 'js-cookie';
import {
  Activity,
  BarChart3,
  ChevronRight,
  Clock,
  LayoutDashboard,
  Shield,
  User,
} from 'lucide-react';

const API = usersApiUrl;

const decodeToken = (token: string) => {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
};

function formatShort(iso: string | null) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
}

type SummaryRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  transactionCount: number;
  ownedDashboardCount: number;
  lastActivityAt: string | null;
  recentActivity: boolean;
};

export default function AdminResumoPage() {
  const router = useRouter();
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const token = Cookies.get('token') || '';
  const currentUser = useMemo(() => decodeToken(token), [token]);

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }
    if (String(currentUser?.role || '').toUpperCase() !== 'ADMIN') {
      router.push('/dashboards');
      return;
    }

    const load = async () => {
      try {
        const { data } = await axios.get<{ users: SummaryRow[] }>(`${API}/summary`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setRows(data.users || []);
      } catch (e: any) {
        setError(e.response?.data?.message || 'Não foi possível carregar o resumo.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token, currentUser, router]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
        Carregando resumo…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
          <BarChart3 size={14} />
          Resumo administrativo
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Usuários do sistema</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Visão geral por conta. <strong>Lançamentos</strong> são transações financeiras no PDCA. Não há presença online em
          tempo real: mostramos conta ativa/inativa e movimento recente nos dados.
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
        {rows.map((u) => (
          <li key={u.id}>
            <button
              type="button"
              onClick={() => router.push(`/admin/resumo/${u.id}`)}
              className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-muted/40"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background">
                {u.role === 'ADMIN' ? <Shield className="h-4 w-4 text-primary" /> : <User className="h-4 w-4 text-muted-foreground" />}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{u.name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      u.active ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-zinc-500/15 text-zinc-500'
                    }`}
                  >
                    {u.active ? 'Conta ativa' : 'Conta inativa'}
                  </span>
                  {u.active && u.recentActivity && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      <Activity className="h-3 w-3" />
                      Movimento recente
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <BarChart3 className="h-3.5 w-3.5 opacity-70" />
                    {u.transactionCount} lançamentos
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <LayoutDashboard className="h-3.5 w-3.5 opacity-70" />
                    {u.ownedDashboardCount} dashboards
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 opacity-70" />
                    Última atividade: {formatShort(u.lastActivityAt)}
                  </span>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>

      {!rows.length && !error && (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhum usuário cadastrado.</p>
      )}
    </div>
  );
}
