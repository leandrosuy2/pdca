'use client';

import { dashboardApiUrl } from '@/lib/api-url';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Cookies from 'js-cookie';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, BarChart3, Sparkles, TrendingUp } from 'lucide-react';

const API = `${dashboardApiUrl}/admin/inteligencia`;

const decodeToken = (token: string) => {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
};

const brl = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n);

const brlFromUnknown = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? brl(n) : '—';
};

const pct = (n: number) => `${n.toFixed(1)}%`;

const axisK = (v: unknown) => `${(Number(v) / 1000).toFixed(0)}k`;

const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}º`);

export default function AdminInteligenciaPage() {
  const router = useRouter();
  const token = Cookies.get('token') || '';
  const currentUser = useMemo(() => decodeToken(token), [token]);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      setLoading(true);
      setError('');
      try {
        const { data: body } = await axios.get(API, {
          params: { year },
          headers: { Authorization: `Bearer ${token}` },
        });
        setData(body);
      } catch (e: any) {
        setError(e.response?.data?.message || 'Não foi possível carregar os dados.');
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token, currentUser, router, year]);

  if (loading && !data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Carregando inteligência…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <header className="flex flex-col gap-4 border-b border-border pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            <Sparkles size={14} />
            Painel global
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Inteligência consolidada</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Consolidação de <strong>todos os usuários</strong>, ranking, trimestres e alertas. Importação Excel: se não
            houver abas nomeadas, as <strong>3 primeiras abas</strong> são tratadas como Faturamento, Turnover (despesas)
            e FOPEG (folha).
          </p>
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Ano
          <input
            type="number"
            min={2020}
            max={2035}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
      </header>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {data?.alerts?.length > 0 && (
        <section className="space-y-2">
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            Alertas
          </h2>
          <ul className="space-y-2">
            {data.alerts.map((a: any, i: number) => (
              <li
                key={i}
                className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2 text-sm text-foreground"
              >
                {a.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Meses com dados', value: data?.months?.length ?? 0 },
          { label: 'Usuários no ranking', value: data?.ranking?.length ?? 0 },
          { label: 'Trimestres', value: data?.quarters?.length ?? 0 },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-card px-5 py-4">
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{c.value}</div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <BarChart3 className="h-4 w-4" />
          Faturamento mensal (global)
        </h2>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data?.months || []}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={axisK} />
              <Tooltip
                formatter={(value, name) => [brlFromUnknown(value), String(name ?? '')]}
                labelFormatter={(l) => `Mês: ${l}`}
                contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))' }}
              />
              <Line type="monotone" dataKey="faturamento" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Faturamento" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Consolidado mensal</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Mês</th>
                <th className="px-3 py-2 font-medium">Faturamento</th>
                <th className="px-3 py-2 font-medium">Turnover %</th>
                <th className="px-3 py-2 font-medium">FOPEG</th>
                <th className="px-3 py-2 font-medium">Margem %</th>
              </tr>
            </thead>
            <tbody>
              {(data?.months || []).map((row: any) => (
                <tr key={row.month} className="border-b border-border/60">
                  <td className="px-3 py-2 font-medium">{row.month}</td>
                  <td className="px-3 py-2 tabular-nums">{brl(row.faturamento)}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{pct(row.turnoverPct)}</td>
                  <td className="px-3 py-2 tabular-nums">{brl(row.fopeg)}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{pct(row.margemPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.months?.length && <p className="py-6 text-center text-sm text-muted-foreground">Sem lançamentos no ano.</p>}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Turnover % = despesas com categoria &quot;TURNOVER&quot; no mês, ou (despesas − FOPEG) ÷ faturamento, o que for maior no numerador.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            Evolução trimestral
          </h2>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.quarters || []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="key" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={axisK} />
                <Tooltip formatter={(value, name) => [brlFromUnknown(value), String(name ?? '')]} />
                <Bar dataKey="faturamento" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} name="Faturamento" />
                <Bar dataKey="fopeg" fill="hsl(220 14% 46%)" radius={[6, 6, 0, 0]} name="FOPEG" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Previsão simples</h2>
          <ul className="space-y-3 text-sm">
            {(data?.forecast || []).map((f: any) => (
              <li key={f.month} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <span className="text-muted-foreground">Próximo mês ({f.month})</span>
                <span className="font-semibold tabular-nums">{brl(f.faturamentoEstimado)}</span>
              </li>
            ))}
            {!data?.forecast?.length && (
              <li className="text-muted-foreground">Dados insuficientes (mínimo 2 meses com faturamento).</li>
            )}
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Ranking de usuários</h2>
        <ul className="divide-y divide-border">
          {(data?.ranking || []).map((r: any) => (
            <li key={r.userId} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0">
              <div className="flex min-w-0 items-center gap-3">
                <span className="text-lg tabular-nums">{medal(r.rank)}</span>
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{r.email}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-right text-xs">
                <div>
                  <div className="text-muted-foreground">Faturamento</div>
                  <div className="font-semibold tabular-nums">{brl(r.faturamento)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Cresc. vs ano ant.</div>
                  <div className="font-semibold tabular-nums">{pct(r.growthYoY * 100)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Eficiência rec/desp</div>
                  <div className="font-semibold tabular-nums">{r.efficiency.toFixed(2)}</div>
                </div>
              </div>
            </li>
          ))}
        </ul>
        {!data?.ranking?.length && <p className="py-4 text-center text-sm text-muted-foreground">Sem dados de ranking.</p>}
      </section>
    </div>
  );
}
