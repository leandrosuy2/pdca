'use client';

import { getDashboardApiUrl } from '@/lib/api-url';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Cookies from 'js-cookie';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, BarChart3, Sparkles, TrendingUp } from 'lucide-react';

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
const brlCompact = (n: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);

const brlFromUnknown = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? brl(n) : '-';
};

const pct = (n: number) => `${n.toFixed(1)}%`;
const axisK = (v: unknown) => `${(Number(v) / 1000).toFixed(0)}k`;
const medal = (rank: number) => (rank === 1 ? '1o' : rank === 2 ? '2o' : rank === 3 ? '3o' : `${rank}o`);

export default function AdminInteligenciaPage() {
  const router = useRouter();
  const token = Cookies.get('token') || '';
  const currentUser = useMemo(() => decodeToken(token), [token]);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [gestao, setGestao] = useState('all');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const months = useMemo(() => data?.months || [], [data]);
  const quarters = useMemo(() => data?.quarters || [], [data]);
  const topMonth = useMemo(
    () =>
      months.reduce(
        (best: any, month: any) => (Number(month?.faturamento || 0) > Number(best?.faturamento || 0) ? month : best),
        months[0] || null,
      ),
    [months],
  );
  const totalFaturamento = useMemo(
    () => months.reduce((sum: number, month: any) => sum + Number(month?.faturamento || 0), 0),
    [months],
  );
  const totalFopeg = useMemo(
    () => quarters.reduce((sum: number, quarter: any) => sum + Number(quarter?.fopeg || 0), 0),
    [quarters],
  );
  const totalDespesa = useMemo(
    () => months.reduce((sum: number, month: any) => sum + Number(month?.despesaTotal || 0), 0),
    [months],
  );
  const totalTurnover = useMemo(
    () => months.reduce((sum: number, month: any) => sum + Number(month?.turnoverPct || 0), 0),
    [months],
  );

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
        const { data: body } = await axios.get(`${getDashboardApiUrl()}/admin/inteligencia`, {
          params: { year, ...(gestao !== 'all' ? { gestao } : {}) },
          headers: { Authorization: `Bearer ${token}` },
        });
        setData(body);
      } catch (e: any) {
        setError(e.response?.data?.message || 'Nao foi possivel carregar os dados.');
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token, currentUser, router, year, gestao]);

  if (loading && !data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Carregando inteligencia...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <header className="border-b border-border pb-8">
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              <Sparkles size={14} />
              Painel global
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Inteligencia consolidada</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Consolidacao geral da empresa por gestao, com ranking, trimestres, alertas e previsao simples.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-4">
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
            <div className="flex flex-col gap-2 text-xs font-medium text-muted-foreground">
              <span>Gestao</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setGestao('all')}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    gestao === 'all'
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-primary/5'
                  }`}
                >
                  Todas
                </button>
                {(data?.managements || []).map((item: string) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setGestao(item)}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                      gestao === item
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-primary/5'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card px-5 py-4">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Gestao ativa</div>
          <div className="mt-2 text-lg font-semibold text-foreground">{data?.selectedGestao || 'Todas as gestoras'}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card px-5 py-4">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Gestoras no ano</div>
          <div className="mt-2 text-lg font-semibold text-foreground">{(data?.managements || []).length}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card px-5 py-4">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Filtro aplicado</div>
          <div className="mt-2 text-lg font-semibold text-foreground">
            {gestao === 'all' ? 'Consolidado geral' : 'Visao por gestao'}
          </div>
        </div>
      </section>

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
          { label: 'Gestoes no ranking', value: data?.ranking?.length ?? 0 },
          { label: 'Trimestres', value: data?.quarters?.length ?? 0 },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-card px-5 py-4">
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{c.value}</div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <BarChart3 className="h-4 w-4" />
              Receita x despesa mensal
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Comparativo visual entre faturamento e despesa total, sempre respeitando o filtro atual de gestao.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/70 bg-background px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Faturamento acumulado</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{brl(totalFaturamento)}</div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Despesa acumulada</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-rose-600">{brl(totalDespesa)}</div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Melhor mes</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {topMonth ? brl(topMonth.faturamento) : '-'}
              </div>
              <div className="text-xs text-muted-foreground">{topMonth?.month || 'Sem dados'}</div>
            </div>
          </div>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data?.months || []}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={axisK} />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
              <Tooltip
                formatter={(value, name) => [brlFromUnknown(value), String(name ?? '')]}
                labelFormatter={(l) => `Mes: ${l}`}
                contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))' }}
              />
              <ReferenceLine y={0} stroke="hsl(var(--border))" />
              <Line
                type="monotone"
                dataKey="faturamento"
                stroke="hsl(var(--primary))"
                strokeWidth={3}
                dot={{ r: 4, strokeWidth: 2, fill: 'hsl(var(--background))' }}
                activeDot={{ r: 6 }}
                name="Faturamento"
              >
                <LabelList dataKey="faturamento" position="top" formatter={(value: unknown) => brlCompact(Number(value || 0))} />
              </Line>
              <Line
                type="monotone"
                dataKey="despesaTotal"
                stroke="hsl(0 72% 52%)"
                strokeWidth={3}
                dot={{ r: 4, strokeWidth: 2, fill: 'hsl(var(--background))' }}
                activeDot={{ r: 6 }}
                name="Despesa"
              >
                <LabelList dataKey="despesaTotal" position="bottom" formatter={(value: unknown) => brlCompact(Number(value || 0))} />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 rounded-2xl border border-border/70 bg-background px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Turnover medio no filtro</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">
            {months.length ? pct(totalTurnover / months.length) : '-'}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Consolidado mensal</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Mes</th>
                <th className="px-3 py-2 font-medium">Faturamento</th>
                <th className="px-3 py-2 font-medium">Despesa</th>
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
                  <td className="px-3 py-2 tabular-nums text-rose-600">{brl(row.despesaTotal)}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{pct(row.turnoverPct)}</td>
                  <td className="px-3 py-2 tabular-nums">{brl(row.fopeg)}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{pct(row.margemPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.months?.length && <p className="py-6 text-center text-sm text-muted-foreground">Sem lancamentos no ano.</p>}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-6 space-y-5">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <TrendingUp className="h-4 w-4" />
                Evolucao trimestral
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Comparativo direto entre faturamento, despesa total e FOPEG para leitura rapida por trimestre.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-border/70 bg-background px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Faturamento anual</div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{brl(totalFaturamento)}</div>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Despesa anual</div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-rose-600">{brl(totalDespesa)}</div>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">FOPEG anual</div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{brl(totalFopeg)}</div>
              </div>
            </div>
          </div>
          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.quarters || []} barCategoryGap={28} margin={{ top: 28, right: 12, left: 6, bottom: 12 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="key" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={axisK} />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '18px' }} />
                <Tooltip formatter={(value, name) => [brlFromUnknown(value), String(name ?? '')]} />
                <Bar dataKey="faturamento" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} name="Faturamento">
                  <LabelList dataKey="faturamento" position="top" formatter={(value: unknown) => brlCompact(Number(value || 0))} />
                </Bar>
                <Bar dataKey="despesaTotal" fill="hsl(0 72% 52%)" radius={[6, 6, 0, 0]} name="Despesa">
                  <LabelList dataKey="despesaTotal" position="top" formatter={(value: unknown) => brlCompact(Number(value || 0))} />
                </Bar>
                <Bar dataKey="fopeg" fill="hsl(220 14% 46%)" radius={[6, 6, 0, 0]} name="FOPEG">
                  <LabelList dataKey="fopeg" position="top" formatter={(value: unknown) => brlCompact(Number(value || 0))} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Previsao simples</h2>
          <ul className="space-y-3 text-sm">
            {(data?.forecast || []).map((f: any) => (
              <li key={f.month} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <span className="text-muted-foreground">Proximo mes ({f.month})</span>
                <span className="font-semibold tabular-nums">{brl(f.faturamentoEstimado)}</span>
              </li>
            ))}
            {!data?.forecast?.length && (
              <li className="text-muted-foreground">Dados insuficientes (minimo 2 meses com faturamento).</li>
            )}
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Ranking de gestoes</h2>
        <ul className="divide-y divide-border">
          {(data?.ranking || []).map((r: any) => (
            <li key={r.gestao} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0">
              <div className="flex min-w-0 items-center gap-3">
                <span className="text-lg tabular-nums">{medal(r.rank)}</span>
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.gestao}</div>
                  <div className="truncate text-xs text-muted-foreground">Resumo consolidado por gestao</div>
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
                  <div className="text-muted-foreground">Eficiencia rec/desp</div>
                  <div className="font-semibold tabular-nums">{r.efficiency.toFixed(2)}</div>
                </div>
              </div>
            </li>
          ))}
        </ul>
        {!data?.ranking?.length && <p className="py-4 text-center text-sm text-muted-foreground">Sem dados de ranking por gestao.</p>}
      </section>
    </div>
  );
}
