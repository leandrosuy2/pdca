'use client';

import { usersApiUrl } from '@/lib/api-url';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import Cookies from 'js-cookie';
import {
  ArrowLeft,
  LayoutDashboard,
  Link2,
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

function formatShort(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export default function AdminResumoDetalhePage() {
  const router = useRouter();
  const params = useParams();
  const userId = String(params.userId || '');

  const [data, setData] = useState<any>(null);
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
    if (!userId) return;

    const load = async () => {
      try {
        const { data: body } = await axios.get(`${API}/${userId}/detail`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setData(body);
      } catch (e: any) {
        setError(e.response?.data?.message || 'Não foi possível carregar o usuário.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token, currentUser, router, userId]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  if (error || !data?.user) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <p className="text-sm text-destructive">{error || 'Usuário não encontrado.'}</p>
        <button
          type="button"
          onClick={() => router.push('/admin/resumo')}
          className="text-sm text-primary underline"
        >
          Voltar ao resumo
        </button>
      </div>
    );
  }

  const { user, recentTransactions, dashboardsOwned, dashboardAccess } = data;
  const c = user._count;

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <button
        type="button"
        onClick={() => router.push('/admin/resumo')}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar ao resumo
      </button>

      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {user.role === 'ADMIN' ? (
                <Shield className="h-5 w-5 text-primary" />
              ) : (
                <User className="h-5 w-5 text-muted-foreground" />
              )}
              <h1 className="text-2xl font-semibold tracking-tight">{user.name}</h1>
            </div>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-border px-3 py-1 text-xs font-medium">{user.role}</span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                user.active ? 'bg-emerald-500/10 text-emerald-600' : 'bg-zinc-500/15 text-zinc-500'
              }`}
            >
              {user.active ? 'Conta ativa' : 'Conta inativa'}
            </span>
          </div>
        </div>
        <dl className="mt-6 grid gap-4 border-t border-border pt-6 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cadastro</dt>
            <dd className="mt-1 text-sm">{formatShort(user.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Atualizado</dt>
            <dd className="mt-1 text-sm">{formatShort(user.updatedAt)}</dd>
          </div>
        </dl>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Números</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ['Lançamentos', c.transacoes],
            ['Unidades', c.unidades],
            ['Categorias', c.categorias],
            ['Dashboards (dono)', c.dashboards],
            ['Acessos recebidos', c.dashboardAccess],
          ].map(([label, val]) => (
            <div key={String(label)} className="rounded-xl border border-border bg-card px-4 py-3">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{val}</div>
            </div>
          ))}
        </div>
      </section>

      {dashboardsOwned?.length > 0 && (
        <section>
          <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <LayoutDashboard className="h-4 w-4" />
            Dashboards próprios
          </h2>
          <ul className="space-y-2 rounded-xl border border-border bg-card p-4">
            {dashboardsOwned.map((d: any) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium">{d.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{d.slug}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {dashboardAccess?.length > 0 && (
        <section>
          <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Link2 className="h-4 w-4" />
            Acessos compartilhados
          </h2>
          <ul className="space-y-2 rounded-xl border border-border bg-card p-4">
            {dashboardAccess.map((a: any) => (
              <li key={a.dashboard.id} className="text-sm">
                <span className="font-medium">{a.dashboard.name}</span>
                <span className="mx-2 text-muted-foreground">·</span>
                <span className="text-muted-foreground">{a.permission}</span>
                <span className="mx-2 text-muted-foreground">—</span>
                <span className="text-xs text-muted-foreground">
                  dono: {a.dashboard.owner?.name || a.dashboard.owner?.email}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Lançamentos recentes</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Valor</th>
                <th className="px-3 py-2 font-medium">Unidade</th>
                <th className="px-3 py-2 font-medium">Categoria</th>
                <th className="px-3 py-2 font-medium">Descrição</th>
              </tr>
            </thead>
            <tbody>
              {recentTransactions?.length ? (
                recentTransactions.map((t: any) => (
                  <tr key={t.id} className="border-b border-border/60 last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatShort(t.date)}</td>
                    <td className="px-3 py-2">{t.type}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.amount)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{t.unidade?.name || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{t.categoria?.name || '—'}</td>
                    <td className="max-w-[220px] truncate px-3 py-2 text-muted-foreground" title={t.description}>
                      {t.description}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    Nenhum lançamento registrado para este usuário.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
