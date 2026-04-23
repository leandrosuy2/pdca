'use client';

import { getDataEntryApiUrl } from '@/lib/api-url';
import { startTransition, useEffect, useState } from 'react';
import axios from 'axios';
import Cookies from 'js-cookie';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CalendarRange,
  CheckCircle2,
  ClipboardPenLine,
  Eye,
  Loader2,
  PencilLine,
  Plus,
  Save,
  Wallet,
} from 'lucide-react';

type TemplateSection = {
  key: string;
  label: string;
  type: 'RECEITA' | 'DESPESA';
  categoryName: string;
  rows: Array<{ key: string; label: string }>;
};

type DashboardOption = {
  id: string;
  name: string;
  owner: {
    id: string;
    name: string;
    email: string;
    template: string;
  } | null;
  units: Array<{
    id: string;
    name: string;
    gestora: string | null;
    ownerId: string;
  }>;
};

type MonthlyResponse = {
  unit: {
    id: string;
    name: string;
    gestora: string | null;
    owner: {
      id: string;
      name: string;
      email: string;
    };
  };
  month: string;
  summary: {
    receita: number;
    despesa: number;
    resultado: number;
  };
  entries: Array<{
    sectionKey: string;
    rowKey: string;
    weeklyValues: number[];
  }>;
  template: TemplateSection[];
};

type LaunchItem = {
  dashboardId: string;
  dashboardName: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  unitId: string;
  unitName: string;
  gestora: string | null;
  month: string;
  receita: number;
  despesa: number;
  resultado: number;
  rowsCount: number;
  updatedAt: string;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const currentMonthValue = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export default function LancamentosPage() {
  const [loadingContext, setLoadingContext] = useState(true);
  const [loadingLaunches, setLoadingLaunches] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [template, setTemplate] = useState<TemplateSection[]>([]);
  const [dashboards, setDashboards] = useState<DashboardOption[]>([]);
  const [launches, setLaunches] = useState<LaunchItem[]>([]);
  const [selectedDashboardId, setSelectedDashboardId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue());
  const [monthlyData, setMonthlyData] = useState<MonthlyResponse | null>(null);
  const [entryValues, setEntryValues] = useState<Record<string, number[]>>({});
  const [editorMode, setEditorMode] = useState<'list' | 'form'>('list');

  const selectedDashboard = dashboards.find((dashboard) => dashboard.id === selectedDashboardId) || null;
  const availableUnits = selectedDashboard?.units || [];
  const selectedUnit = availableUnits.find((unit) => unit.id === selectedUnitId) || null;

  const loadLaunches = async (dashboardId?: string) => {
    setLoadingLaunches(true);
    try {
      const token = Cookies.get('token') || '';
      const response = await axios.get(`${getDataEntryApiUrl()}/launches`, {
        headers: { Authorization: `Bearer ${token}` },
        params: dashboardId ? { dashboardId } : undefined,
      });
      setLaunches(response.data?.launches || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Nao foi possivel carregar os lancamentos ja existentes.');
    } finally {
      setLoadingLaunches(false);
    }
  };

  useEffect(() => {
    const loadContext = async () => {
      setLoadingContext(true);
      setError('');

      try {
        const token = Cookies.get('token') || '';
        const response = await axios.get(`${getDataEntryApiUrl()}/context`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const nextDashboards = response.data?.dashboards || [];
        const nextTemplate = response.data?.template || [];
        setDashboards(nextDashboards);
        setTemplate(nextTemplate);

        if (nextDashboards.length > 0) {
          const firstDashboard = nextDashboards[0];
          setSelectedDashboardId(firstDashboard.id);
          setSelectedUnitId(firstDashboard.units?.[0]?.id || '');
          await loadLaunches(firstDashboard.id);
        }
      } catch (err: any) {
        setError(err.response?.data?.message || 'Nao foi possivel carregar o contexto de lancamentos.');
      } finally {
        setLoadingContext(false);
      }
    };

    loadContext();
  }, []);

  useEffect(() => {
    if (!selectedDashboard) return;
    if (!selectedDashboard.units.some((unit) => unit.id === selectedUnitId)) {
      setSelectedUnitId(selectedDashboard.units?.[0]?.id || '');
    }
  }, [selectedDashboardId, selectedDashboard, selectedUnitId]);

  useEffect(() => {
    if (!selectedDashboardId) return;
    loadLaunches(selectedDashboardId);
  }, [selectedDashboardId]);

  useEffect(() => {
    const loadMonthly = async () => {
      if (editorMode !== 'form') return;
      if (!selectedUnitId || !selectedMonth) return;

      setLoadingMonth(true);
      setSuccessMessage('');

      try {
        const token = Cookies.get('token') || '';
        const response = await axios.get(`${getDataEntryApiUrl()}/monthly`, {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            unitId: selectedUnitId,
            month: selectedMonth,
          },
        });

        const data = response.data as MonthlyResponse;
        const nextTemplate = data.template || [];
        setTemplate(nextTemplate);
        setMonthlyData(data);

        const mappedValues: Record<string, number[]> = {};
        for (const entry of data.entries || []) {
          mappedValues[`${entry.sectionKey}:${entry.rowKey}`] = Array.from(
            { length: 5 },
            (_, index) => Number(entry.weeklyValues?.[index] || 0),
          );
        }
        setEntryValues(mappedValues);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Nao foi possivel carregar os lancamentos do mes.');
      } finally {
        setLoadingMonth(false);
      }
    };

    loadMonthly();
  }, [editorMode, selectedUnitId, selectedMonth]);

  const updateValue = (sectionKey: string, rowKey: string, weekIndex: number, rawValue: string) => {
    const parsed = Number(rawValue);
    const key = `${sectionKey}:${rowKey}`;

    startTransition(() => {
      setEntryValues((current) => {
        const existing = current[key] ? [...current[key]] : [0, 0, 0, 0, 0];
        existing[weekIndex] = Number.isFinite(parsed) ? parsed : 0;
        return {
          ...current,
          [key]: existing,
        };
      });
    });
  };

  const handleSave = async () => {
    if (!selectedUnitId || !selectedMonth) return;

    setSaving(true);
    setError('');
    setSuccessMessage('');

    try {
      const payload = {
        unitId: selectedUnitId,
        month: selectedMonth,
        entries: template.flatMap((section) =>
          section.rows.map((row) => ({
            sectionKey: section.key,
            rowKey: row.key,
            weeklyValues: entryValues[`${section.key}:${row.key}`] || [0, 0, 0, 0, 0],
          })),
        ),
      };

      const token = Cookies.get('token') || '';
      const response = await axios.post(`${getDataEntryApiUrl()}/monthly`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = response.data as MonthlyResponse;

      setMonthlyData(data);
      const mappedValues: Record<string, number[]> = {};
      for (const entry of data.entries || []) {
        mappedValues[`${entry.sectionKey}:${entry.rowKey}`] = Array.from(
          { length: 5 },
          (_, index) => Number(entry.weeklyValues?.[index] || 0),
        );
      }
      setEntryValues(mappedValues);
      setSuccessMessage('Lancamentos mensais salvos com sucesso.');
      await loadLaunches(selectedDashboardId || undefined);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Nao foi possivel salvar os lancamentos.');
    } finally {
      setSaving(false);
    }
  };

  if (loadingContext) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Carregando operacao de input...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border bg-card p-8 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              <Wallet size={14} />
              Lancamento Mensal por Unidade
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Administracao de input operacional</h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                Escolha um lancamento ja existente para editar ou inicie um novo. A unidade continua vinculada automaticamente a gestora-base para consolidacao no dashboard.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setSelectedMonth(currentMonthValue());
                setSelectedUnitId(selectedDashboard?.units?.[0]?.id || '');
                setMonthlyData(null);
                setEntryValues({});
                setSuccessMessage('');
                setError('');
                setEditorMode('form');
              }}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              <Plus size={16} />
              Novo lancamento
            </button>
            <div className="rounded-2xl border border-border bg-background/60 px-4 py-3 text-sm text-muted-foreground">
              <div className="font-semibold text-foreground">Regra ativa</div>
              <div className="mt-1">Unidade selecionada = gestora herdada automaticamente no salvamento.</div>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Lancamentos ja cadastrados</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Veja o que ja foi lancado e clique em editar para abrir o formulario no registro certo.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setEditorMode((current) => (current === 'list' ? 'form' : 'list'))}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted/60"
          >
            {editorMode === 'list' ? <ClipboardPenLine size={16} /> : <Eye size={16} />}
            {editorMode === 'list' ? 'Abrir formulario' : 'Ver lista'}
          </button>
        </div>

        {loadingLaunches ? (
          <div className="flex min-h-[160px] items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Carregando lancamentos...
          </div>
        ) : launches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-background/60 p-8 text-center text-sm text-muted-foreground">
            Nenhum lancamento manual encontrado para este dashboard.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-background/60 text-left text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Mes</th>
                  <th className="px-4 py-3 font-semibold">Unidade</th>
                  <th className="px-4 py-3 font-semibold">Gestora</th>
                  <th className="px-4 py-3 font-semibold">Receita</th>
                  <th className="px-4 py-3 font-semibold">Despesa</th>
                  <th className="px-4 py-3 font-semibold">Resultado</th>
                  <th className="px-4 py-3 font-semibold">Itens</th>
                  <th className="px-4 py-3 font-semibold">Atualizado</th>
                  <th className="px-4 py-3 font-semibold text-right">Acao</th>
                </tr>
              </thead>
              <tbody>
                {launches.map((launch) => (
                  <tr key={`${launch.unitId}-${launch.month}`} className="border-b border-border/70">
                    <td className="px-4 py-4 font-medium text-foreground">{launch.month}</td>
                    <td className="px-4 py-4 text-foreground">{launch.unitName}</td>
                    <td className="px-4 py-4 text-muted-foreground">{launch.gestora || 'Sem gestora'}</td>
                    <td className="px-4 py-4 text-foreground">{formatCurrency(launch.receita)}</td>
                    <td className="px-4 py-4 text-foreground">{formatCurrency(launch.despesa)}</td>
                    <td className={`px-4 py-4 font-semibold ${launch.resultado >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                      {formatCurrency(launch.resultado)}
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">{launch.rowsCount}</td>
                    <td className="px-4 py-4 text-muted-foreground">
                      {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(launch.updatedAt))}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDashboardId(launch.dashboardId);
                          setSelectedUnitId(launch.unitId);
                          setSelectedMonth(launch.month);
                          setSuccessMessage('');
                          setError('');
                          setEditorMode('form');
                        }}
                        className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary transition hover:bg-primary/15"
                      >
                        <PencilLine size={14} />
                        Editar
                        <ArrowRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editorMode === 'form' && (
        <>
          <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <Building2 size={15} />
                Contexto do Lancamento
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-2 text-sm">
                  <span className="font-medium text-foreground">Dashboard</span>
                  <select
                    value={selectedDashboardId}
                    onChange={(event) => setSelectedDashboardId(event.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    {dashboards.map((dashboard) => (
                      <option key={dashboard.id} value={dashboard.id}>
                        {dashboard.name} - {dashboard.owner?.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2 text-sm">
                  <span className="font-medium text-foreground">Unidade</span>
                  <select
                    value={selectedUnitId}
                    onChange={(event) => setSelectedUnitId(event.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    {availableUnits.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2 text-sm">
                  <span className="font-medium text-foreground">Mes de referencia</span>
                  <div className="relative">
                    <CalendarRange className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(event) => setSelectedMonth(event.target.value)}
                      className="w-full rounded-xl border border-border bg-background px-10 py-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </label>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-border bg-background/70 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Gestora herdada</div>
                  <div className="mt-2 text-lg font-semibold text-foreground">{selectedUnit?.gestora || 'Sem gestora'}</div>
                </div>
                <div className="rounded-2xl border border-border bg-background/70 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Responsavel</div>
                  <div className="mt-2 text-lg font-semibold text-foreground">{selectedDashboard?.owner?.name || '-'}</div>
                </div>
                <div className="rounded-2xl border border-border bg-background/70 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Template</div>
                  <div className="mt-2 text-lg font-semibold text-foreground">{selectedDashboard?.owner?.template || '-'}</div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
              <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Receita do mes</div>
                <div className="mt-3 text-2xl font-bold text-foreground">{formatCurrency(monthlyData?.summary.receita || 0)}</div>
              </div>
              <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Despesa do mes</div>
                <div className="mt-3 text-2xl font-bold text-foreground">{formatCurrency(monthlyData?.summary.despesa || 0)}</div>
              </div>
              <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Resultado do mes</div>
                <div
                  className={`mt-3 text-2xl font-bold ${
                    (monthlyData?.summary.resultado || 0) >= 0 ? 'text-emerald-600' : 'text-destructive'
                  }`}
                >
                  {formatCurrency(monthlyData?.summary.resultado || 0)}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Grade semanal de lancamentos</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Preencha somente os valores necessarios. Ao salvar, esta tela atualiza apenas os lancamentos manuais do mes selecionado.
                </p>
              </div>

              <button
                onClick={handleSave}
                disabled={saving || loadingMonth || !selectedUnitId}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={16} />}
                Salvar lancamentos
              </button>
            </div>

            {loadingMonth ? (
              <div className="flex min-h-[240px] items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Carregando valores do mes...
              </div>
            ) : (
              <div className="space-y-8">
                {template.map((section) => (
                  <div key={section.key} className="overflow-hidden rounded-2xl border border-border">
                    <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-4">
                      <div>
                        <h3 className="text-base font-semibold text-foreground">{section.label}</h3>
                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                          {section.type} • Categoria {section.categoryName}
                        </p>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full border-collapse">
                        <thead>
                          <tr className="border-b border-border bg-background/70 text-left text-xs uppercase tracking-[0.16em] text-muted-foreground">
                            <th className="px-4 py-3 font-semibold">Fornecedor / Linha</th>
                            <th className="px-4 py-3 font-semibold">1 Semana</th>
                            <th className="px-4 py-3 font-semibold">2 Semana</th>
                            <th className="px-4 py-3 font-semibold">3 Semana</th>
                            <th className="px-4 py-3 font-semibold">4 Semana</th>
                            <th className="px-4 py-3 font-semibold">5 Semana</th>
                            <th className="px-4 py-3 font-semibold">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.rows.map((row) => {
                            const values = entryValues[`${section.key}:${row.key}`] || [0, 0, 0, 0, 0];
                            const total = values.reduce((sum, value) => sum + Number(value || 0), 0);

                            return (
                              <tr key={row.key} className="border-b border-border/80 last:border-b-0">
                                <td className="px-4 py-3 font-medium text-foreground">{row.label}</td>
                                {values.map((value, weekIndex) => (
                                  <td key={`${row.key}-${weekIndex}`} className="px-4 py-3">
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={value === 0 ? '' : value}
                                      onChange={(event) =>
                                        updateValue(section.key, row.key, weekIndex, event.target.value)
                                      }
                                      placeholder="0,00"
                                      className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                                    />
                                  </td>
                                ))}
                                <td className="px-4 py-3 text-sm font-semibold text-foreground">{formatCurrency(total)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
