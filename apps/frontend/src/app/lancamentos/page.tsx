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
  ChevronDown,
  ClipboardPenLine,
  Eye,
  Lock,
  Loader2,
  PencilLine,
  Plus,
  Save,
  Trash2,
  Unlock,
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
  validatedColumns?: Array<{
    sectionKey: string;
    weekIndex: number;
    validatedAt: string;
    validatedBy?: {
      id: string;
      name: string;
      email: string;
    };
  }>;
  template: TemplateSection[];
};

type ValidatedColumn = NonNullable<MonthlyResponse['validatedColumns']>[number];

type DataEntryContextResponse = {
  user?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  permissions?: {
    canManageAllLaunches?: boolean;
    canDeleteLaunches?: boolean;
    canEditLaunchValues?: boolean;
    canEditFinancialSummary?: boolean;
    canValidateColumns?: boolean;
    assignedUnitId?: string | null;
  };
  template?: TemplateSection[];
  dashboards?: DashboardOption[];
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

const getEntryTotal = (entryValues: Record<string, number[]>, sectionKey: string, rowKey: string) =>
  (entryValues[`${sectionKey}:${rowKey}`] || [0, 0, 0, 0, 0]).reduce((sum, value) => sum + Number(value || 0), 0);

const getSectionTotal = (entryValues: Record<string, number[]>, section?: TemplateSection) =>
  section ? section.rows.reduce((sum, row) => sum + getEntryTotal(entryValues, section.key, row.key), 0) : 0;

export default function LancamentosPage() {
  const [loadingContext, setLoadingContext] = useState(true);
  const [loadingLaunches, setLoadingLaunches] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [deletingLaunchKey, setDeletingLaunchKey] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [template, setTemplate] = useState<TemplateSection[]>([]);
  const [dashboards, setDashboards] = useState<DashboardOption[]>([]);
  const [launches, setLaunches] = useState<LaunchItem[]>([]);
  const [entryRole, setEntryRole] = useState('');
  const [canDeleteLaunches, setCanDeleteLaunches] = useState(false);
  const [canEditLaunchValues, setCanEditLaunchValues] = useState(false);
  const [canEditFinancialSummary, setCanEditFinancialSummary] = useState(false);
  const [canValidateColumns, setCanValidateColumns] = useState(false);
  const [assignedUnitId, setAssignedUnitId] = useState('');
  const [selectedDashboardId, setSelectedDashboardId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue());
  const [monthlyData, setMonthlyData] = useState<MonthlyResponse | null>(null);
  const [entryValues, setEntryValues] = useState<Record<string, number[]>>({});
  const [parcelInfo, setParcelInfo] = useState<Record<string, { current: string; total: string }>>({});
  const [editorMode, setEditorMode] = useState<'list' | 'form'>('list');
  const [expandedGestoras, setExpandedGestoras] = useState<string[]>([]);
  const [selectedListUnitId, setSelectedListUnitId] = useState('');
  const [validatingColumnKey, setValidatingColumnKey] = useState('');

  const selectedDashboard = dashboards.find((dashboard) => dashboard.id === selectedDashboardId) || null;
  const availableUnits = selectedDashboard?.units || [];
  const selectedUnit = availableUnits.find((unit) => unit.id === selectedUnitId) || null;
  const sectionsByKey = Object.fromEntries(template.map((section) => [section.key, section])) as Record<
    string,
    TemplateSection | undefined
  >;
  const proteinasTotal = getSectionTotal(entryValues, sectionsByKey.proteinas);
  const estivasTotal = getSectionTotal(entryValues, sectionsByKey.estivas);
  const hortifrutTotal = getSectionTotal(entryValues, sectionsByKey.hortifrut);
  const padariasTotal = getSectionTotal(entryValues, sectionsByKey.padarias);
  const sucosTotal = getSectionTotal(entryValues, sectionsByKey.sucos);
  const descartaveisTotal = getEntryTotal(entryValues, 'nao_alimentar_central', 'descartaveis');
  const limpezaTotal = getEntryTotal(entryValues, 'nao_alimentar_central', 'limpeza');
  const gasTotal = getEntryTotal(entryValues, 'nao_alimentar_operacao', 'amazon_gas');
  const diversosTotal =
    getSectionTotal(entryValues, sectionsByKey.nao_alimentar_operacao) - gasTotal;
  const faturamentoMensal = getSectionTotal(entryValues, sectionsByKey.receita);
  const ticketsTotal = getEntryTotal(entryValues, 'receita', 'tickets');
  const custoTotal =
    proteinasTotal +
    estivasTotal +
    hortifrutTotal +
    padariasTotal +
    sucosTotal +
    descartaveisTotal +
    limpezaTotal +
    gasTotal +
    diversosTotal;
  const massaSalarialTotal = getEntryTotal(entryValues, 'resumo_financeiro', 'massa_salarial');
  const encargosFolhaTotal = getEntryTotal(entryValues, 'resumo_financeiro', 'encargos_folha');
  const despesaAdmTotal = getEntryTotal(entryValues, 'resumo_financeiro', 'despesa_adm');
  const impostosTotal = getEntryTotal(entryValues, 'resumo_financeiro', 'impostos');
  const totalDespesaResumo =
    custoTotal + massaSalarialTotal + encargosFolhaTotal + despesaAdmTotal + impostosTotal;
  const margemTotal = faturamentoMensal - totalDespesaResumo;
  const margemPercentual = faturamentoMensal > 0 ? (margemTotal / faturamentoMensal) * 100 : 0;
  const validatedColumnsMap = new Map(
    (monthlyData?.validatedColumns || []).map((item) => [`${item.sectionKey}:${item.weekIndex}`, item]),
  );
  const groupedLaunches = launches.reduce<
    Array<{
      gestora: string;
      units: Array<{
        unitId: string;
        unitName: string;
        ownerName: string;
        ownerEmail: string;
        dashboardId: string;
        dashboardName: string;
        launches: LaunchItem[];
      }>;
    }>
  >((groups, launch) => {
    const gestoraName = launch.gestora || 'Sem gestora';
    let gestoraGroup = groups.find((group) => group.gestora === gestoraName);

    if (!gestoraGroup) {
      gestoraGroup = { gestora: gestoraName, units: [] };
      groups.push(gestoraGroup);
    }

    let unitGroup = gestoraGroup.units.find((unit) => unit.unitId === launch.unitId);
    if (!unitGroup) {
      unitGroup = {
        unitId: launch.unitId,
        unitName: launch.unitName,
        ownerName: launch.ownerName,
        ownerEmail: launch.ownerEmail,
        dashboardId: launch.dashboardId,
        dashboardName: launch.dashboardName,
        launches: [],
      };
      gestoraGroup.units.push(unitGroup);
    }

    unitGroup.launches.push(launch);
    return groups;
  }, []);

  groupedLaunches.sort((a, b) => a.gestora.localeCompare(b.gestora, 'pt-BR'));
  for (const group of groupedLaunches) {
    group.units.sort((a, b) => a.unitName.localeCompare(b.unitName, 'pt-BR'));
    for (const unit of group.units) {
      unit.launches.sort((a, b) => b.month.localeCompare(a.month));
    }
  }

  const selectedListUnit =
    groupedLaunches.flatMap((group) => group.units).find((unit) => unit.unitId === selectedListUnitId) || null;

  const loadLaunches = async (dashboardId?: string) => {
    setLoadingLaunches(true);
    try {
      const token = Cookies.get('token') || '';
      const response = await axios.get(`${getDataEntryApiUrl()}/launches`, {
        headers: { Authorization: `Bearer ${token}` },
        params: dashboardId ? { dashboardId } : undefined,
      });
      const nextLaunches: LaunchItem[] = response.data?.launches || [];
      setLaunches(nextLaunches);

      const nextGrouped = nextLaunches.reduce<Record<string, string[]>>((acc, launch) => {
        const gestoraName = launch.gestora || 'Sem gestora';
        acc[gestoraName] = acc[gestoraName] || [];
        if (!acc[gestoraName].includes(launch.unitId)) {
          acc[gestoraName].push(launch.unitId);
        }
        return acc;
      }, {});

      const gestoraNames = Object.keys(nextGrouped).sort((a, b) => a.localeCompare(b, 'pt-BR'));
      setExpandedGestoras((current) =>
        current.length > 0 ? current.filter((item) => gestoraNames.includes(item)) : gestoraNames.slice(0, 1),
      );
      setSelectedListUnitId((current) => {
        if (current && nextLaunches.some((launch) => launch.unitId === current)) return current;
        const firstGestora = gestoraNames[0];
        return firstGestora ? nextGrouped[firstGestora]?.[0] || '' : '';
      });
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
        const context = response.data as DataEntryContextResponse;
        const nextDashboards = context?.dashboards || [];
        const nextTemplate = context?.template || [];
        setDashboards(nextDashboards);
        setTemplate(nextTemplate);
        setEntryRole(String(context?.user?.role || '').toUpperCase());
        setCanDeleteLaunches(Boolean(context?.permissions?.canDeleteLaunches));
        setCanEditLaunchValues(Boolean(context?.permissions?.canEditLaunchValues));
        setCanEditFinancialSummary(Boolean(context?.permissions?.canEditFinancialSummary));
        setCanValidateColumns(Boolean(context?.permissions?.canManageAllLaunches));
        setAssignedUnitId(String(context?.permissions?.assignedUnitId || ''));

        if (nextDashboards.length > 0) {
          const firstDashboard = nextDashboards[0];
          setSelectedDashboardId(firstDashboard.id);
          setSelectedUnitId(String(context?.permissions?.assignedUnitId || firstDashboard.units?.[0]?.id || ''));
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
      setSelectedUnitId(assignedUnitId || selectedDashboard.units?.[0]?.id || '');
    }
  }, [assignedUnitId, selectedDashboardId, selectedDashboard, selectedUnitId]);

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

  useEffect(() => {
    setParcelInfo((current) => {
      const next = { ...current };

      for (const section of template) {
        for (const row of section.rows) {
          if (!row.key.startsWith('parcelas_') || next[row.key]) continue;
          const match = row.label.match(/(\d+)\s*\/\s*(\d+)$/);
          next[row.key] = {
            current: match?.[1] || '',
            total: match?.[2] || '',
          };
        }
      }

      return next;
    });
  }, [template]);

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

  const updateParcelInfo = (rowKey: string, field: 'current' | 'total', value: string) => {
    setParcelInfo((current) => ({
      ...current,
      [rowKey]: {
        current: current[rowKey]?.current || '',
        total: current[rowKey]?.total || '',
        [field]: value.replace(/\D/g, ''),
      },
    }));
  };

  const toggleGestora = (gestora: string) => {
    setExpandedGestoras((current) =>
      current.includes(gestora) ? current.filter((item) => item !== gestora) : [...current, gestora],
    );
  };

  const handleSave = async () => {
    if (!canEditLaunchValues || !selectedUnitId || !selectedMonth) return;

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

  const handleDeleteLaunch = async (launch: LaunchItem) => {
    if (!canDeleteLaunches) return;

    const confirmed = window.confirm(
      `Excluir os lancamentos manuais de ${launch.unitName} em ${launch.month}? Essa acao remove o mes inteiro dessa unidade.`,
    );
    if (!confirmed) return;

    setDeletingLaunchKey(`${launch.unitId}:${launch.month}`);
    setError('');
    setSuccessMessage('');

    try {
      const token = Cookies.get('token') || '';
      await axios.delete(`${getDataEntryApiUrl()}/monthly`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          unitId: launch.unitId,
          month: launch.month,
        },
      });

      setSuccessMessage(`Lancamentos de ${launch.unitName} em ${launch.month} removidos com sucesso.`);
      await loadLaunches(selectedDashboardId || undefined);
      if (selectedUnitId === launch.unitId && selectedMonth === launch.month) {
        setMonthlyData(null);
        setEntryValues({});
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Nao foi possivel excluir o lancamento.');
    } finally {
      setDeletingLaunchKey('');
    }
  };

  const handleToggleColumnValidation = async (sectionKey: string, weekIndex: number) => {
    if (!canValidateColumns || !selectedUnitId || !selectedMonth) return;

    const validationKey = `${sectionKey}:${weekIndex}`;
    const isValidated = validatedColumnsMap.has(validationKey);
    setValidatingColumnKey(validationKey);
    setError('');
    setSuccessMessage('');

    try {
      const token = Cookies.get('token') || '';
      const response = await axios.post(
        `${getDataEntryApiUrl()}/validate-column`,
        {
          unitId: selectedUnitId,
          month: selectedMonth,
          sectionKey,
          weekIndex,
          validated: !isValidated,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const data = response.data as MonthlyResponse;
      setMonthlyData(data);
      setSuccessMessage(
        !isValidated
          ? `Coluna da ${weekIndex + 1} semana validada com sucesso.`
          : `Validacao removida da ${weekIndex + 1} semana.`,
      );
    } catch (err: any) {
      setError(err.response?.data?.message || 'Nao foi possivel validar esta coluna.');
    } finally {
      setValidatingColumnKey('');
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
              <h1 className="text-3xl font-bold tracking-tight">
                {entryRole === 'UNIT_ENTRY' ? 'Lancamento da sua unidade' : 'Administracao de input operacional'}
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                {entryRole === 'UNIT_ENTRY'
                  ? 'Voce pode lancar e atualizar somente a unidade vinculada ao seu usuario. A gestora continua sendo herdada automaticamente.'
                  : 'Escolha um lancamento ja existente para editar, excluir ou inicie um novo. A unidade continua vinculada automaticamente a gestora-base para consolidacao no dashboard.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setSelectedMonth(currentMonthValue());
                setSelectedUnitId(assignedUnitId || selectedDashboard?.units?.[0]?.id || '');
                setMonthlyData(null);
                setEntryValues({});
                setSuccessMessage('');
                setError('');
                setEditorMode('form');
              }}
              disabled={!canEditLaunchValues}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus size={16} />
              Novo lancamento
            </button>
            <div className="rounded-2xl border border-border bg-background/60 px-4 py-3 text-sm text-muted-foreground">
              <div className="font-semibold text-foreground">
                {entryRole === 'UNIT_ENTRY' ? 'Escopo da sua unidade' : 'Regra ativa'}
              </div>
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
          <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
            <div className="rounded-2xl border border-border bg-background/50 p-4">
              <div className="mb-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Filtro por gestora</div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Clique na gestora para abrir as unidades. Depois escolha uma unidade para ver os lancamentos ja feitos.
                </p>
              </div>

              <div className="space-y-3">
                {groupedLaunches.map((group) => {
                  const isExpanded = expandedGestoras.includes(group.gestora);
                  const totalItems = group.units.reduce((sum, unit) => sum + unit.launches.length, 0);

                  return (
                    <div key={group.gestora} className="rounded-2xl border border-border bg-card">
                      <button
                        type="button"
                        onClick={() => toggleGestora(group.gestora)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
                      >
                        <div>
                          <div className="text-sm font-semibold text-foreground">{group.gestora}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {group.units.length} unidades • {totalItems} lancamentos
                          </div>
                        </div>
                        <ChevronDown
                          size={16}
                          className={`shrink-0 text-muted-foreground transition ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </button>

                      {isExpanded && (
                        <div className="border-t border-border px-3 py-3">
                          <div className="space-y-2">
                            {group.units.map((unit) => {
                              const isActive = selectedListUnitId === unit.unitId;

                              return (
                                <button
                                  key={unit.unitId}
                                  type="button"
                                  onClick={() => setSelectedListUnitId(unit.unitId)}
                                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                                    isActive
                                      ? 'border-primary/30 bg-primary/10'
                                      : 'border-border bg-background hover:bg-muted/40'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <div className="text-sm font-semibold text-foreground">{unit.unitName}</div>
                                      <div className="mt-1 text-xs text-muted-foreground">{unit.launches.length} meses lancados</div>
                                    </div>
                                    <ArrowRight size={14} className={isActive ? 'text-primary' : 'text-muted-foreground'} />
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-background/50 p-4">
              {selectedListUnit ? (
                <>
                  <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 md:flex-row md:items-end md:justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Unidade selecionada</div>
                      <h3 className="mt-2 text-xl font-semibold text-foreground">{selectedListUnit.unitName}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Gestora {selectedListUnit.launches[0]?.gestora || 'Sem gestora'} • Dashboard {selectedListUnit.dashboardName}
                      </p>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Responsavel: <span className="font-medium text-foreground">{selectedListUnit.ownerName}</span>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border bg-background/60 text-left text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          <th className="px-4 py-3 font-semibold">Mes</th>
                          <th className="px-4 py-3 font-semibold">Receita</th>
                          <th className="px-4 py-3 font-semibold">Despesa</th>
                          <th className="px-4 py-3 font-semibold">Resultado</th>
                          <th className="px-4 py-3 font-semibold">Itens</th>
                          <th className="px-4 py-3 font-semibold">Atualizado</th>
                          <th className="px-4 py-3 font-semibold text-right">Acao</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedListUnit.launches.map((launch) => (
                          <tr key={`${launch.unitId}-${launch.month}`} className="border-b border-border/70">
                            <td className="px-4 py-4 font-medium text-foreground">{launch.month}</td>
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
                              <div className="flex items-center justify-end gap-2">
                                {canDeleteLaunches && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteLaunch(launch)}
                                    disabled={deletingLaunchKey === `${launch.unitId}:${launch.month}`}
                                    className="inline-flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive transition hover:bg-destructive/15 disabled:cursor-not-allowed disabled:opacity-70"
                                  >
                                    {deletingLaunchKey === `${launch.unitId}:${launch.month}` ? (
                                      <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                      <Trash2 size={14} />
                                    )}
                                    Excluir
                                  </button>
                                )}
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
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
                  Escolha uma unidade na coluna ao lado para ver os lancamentos ja cadastrados.
                </div>
              )}
            </div>
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
                    disabled={entryRole === 'UNIT_ENTRY'}
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
                    disabled={entryRole === 'UNIT_ENTRY'}
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

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-5">
                <h2 className="text-xl font-semibold text-foreground">Grade semanal de lancamentos</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Preencha somente os valores necessarios. Ao salvar, esta tela atualiza apenas os lancamentos manuais do mes selecionado.
                </p>
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

                    {section.key === 'resumo_financeiro' && !canEditFinancialSummary && (
                      <div className="flex items-start gap-3 border-b border-destructive/30 bg-destructive/10 px-5 py-3 text-sm font-semibold text-destructive">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>Acesso negado nesta secao. Somente o administrador de input pode alterar o Resumo Financeiro.</span>
                      </div>
                    )}

                    <div className="grid grid-cols-[220px_repeat(5,minmax(120px,1fr))_120px] gap-3 border-b border-border bg-background/60 px-4 py-3">
                      <div />
                      {Array.from({ length: 5 }, (_, weekIndex) => {
                        const validationKey = `${section.key}:${weekIndex}`;
                        const validation = validatedColumnsMap.get(validationKey) as ValidatedColumn | undefined;
                        const isValidated = Boolean(validation);
                        const isLockedForUser = isValidated && !canValidateColumns;

                        return (
                          <div key={validationKey} className="flex flex-col items-center gap-2">
                            {canValidateColumns ? (
                              <button
                                type="button"
                                onClick={() => handleToggleColumnValidation(section.key, weekIndex)}
                                disabled={validatingColumnKey === validationKey}
                                className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                                  isValidated
                                    ? 'border border-emerald-600/30 bg-emerald-500/10 text-emerald-700'
                                    : 'border border-border bg-card text-muted-foreground hover:bg-muted'
                                } disabled:cursor-not-allowed disabled:opacity-70`}
                              >
                                {validatingColumnKey === validationKey ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : isValidated ? (
                                  <Unlock size={14} />
                                ) : (
                                  <Lock size={14} />
                                )}
                                {isValidated ? 'Validado' : 'Validar'}
                              </button>
                            ) : isLockedForUser ? (
                              <div className="inline-flex items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
                                <Lock size={14} />
                                Validado
                              </div>
                            ) : (
                              <div className="h-9" />
                            )}
                            <span className="text-[11px] text-muted-foreground">
                              {validation?.validatedBy?.name ? `por ${validation.validatedBy.name}` : ''}
                            </span>
                          </div>
                        );
                      })}
                      <div />
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
                            const isParcelRow = row.key.startsWith('parcelas_');
                            const rowParcelInfo = parcelInfo[row.key] || { current: '', total: '' };
                            const displayLabel = isParcelRow ? row.label.replace(/\s+\d+\s*\/\s*\d+$/, '') : row.label;

                            return (
                              <tr key={row.key} className="border-b border-border/80 last:border-b-0">
                                <td className="px-4 py-3 font-medium text-foreground">
                                  <div className="flex flex-wrap items-center gap-3">
                                    <span>{displayLabel}</span>
                                    {isParcelRow ? (
                                      <div className="flex items-center gap-2 rounded-xl border border-border bg-background/80 px-2 py-1">
                                        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                          Parcela
                                        </span>
                                        <input
                                          type="text"
                                          inputMode="numeric"
                                          value={rowParcelInfo.current}
                                          onChange={(event) => updateParcelInfo(row.key, 'current', event.target.value)}
                                          className="w-10 rounded-md border border-border bg-background px-2 py-1 text-center text-xs font-semibold outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                                        />
                                        <span className="text-sm text-muted-foreground">/</span>
                                        <input
                                          type="text"
                                          inputMode="numeric"
                                          value={rowParcelInfo.total}
                                          onChange={(event) => updateParcelInfo(row.key, 'total', event.target.value)}
                                          className="w-10 rounded-md border border-border bg-background px-2 py-1 text-center text-xs font-semibold outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                                        />
                                      </div>
                                    ) : null}
                                  </div>
                                </td>
                                {values.map((value, weekIndex) => (
                                  <td key={`${row.key}-${weekIndex}`} className="px-4 py-3">
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={value === 0 ? '' : value}
                                      disabled={
                                        !canEditLaunchValues ||
                                        (section.key === 'resumo_financeiro' && !canEditFinancialSummary) ||
                                        (!canValidateColumns && validatedColumnsMap.has(`${section.key}:${weekIndex}`))
                                      }
                                      onChange={(event) =>
                                        updateValue(section.key, row.key, weekIndex, event.target.value)
                                      }
                                      placeholder="0,00"
                                      className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-muted"
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

                  <div className="rounded-2xl border border-border bg-background/60 p-5">
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-foreground">Resumo consolidado do lancamento</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Fechamento automatico com base nos valores informados acima para esta unidade e este mes.
                      </p>
                    </div>

                    <div className="grid gap-6 xl:grid-cols-2">
                      <div className="overflow-hidden rounded-2xl border border-border bg-card">
                        <table className="min-w-full border-collapse">
                          <tbody>
                            {[
                              ['Proteinas', proteinasTotal],
                              ['Estivas', estivasTotal],
                              ['Hortifrut', hortifrutTotal],
                              ['Padarias', padariasTotal],
                              ['Sucos', sucosTotal],
                              ['Descartaveis', descartaveisTotal],
                              ['Limpeza', limpezaTotal],
                              ['Gas', gasTotal],
                              ['Diversos', diversosTotal],
                            ].map(([label, value]) => (
                              <tr key={String(label)} className="border-b border-border last:border-b-0">
                                <td className="px-4 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-foreground">
                                  {label}
                                </td>
                                <td className="px-4 py-3 text-right text-sm font-semibold text-foreground">
                                  {formatCurrency(Number(value))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="overflow-hidden rounded-2xl border border-border bg-card">
                        <table className="min-w-full border-collapse">
                          <tbody>
                            {[
                              ['Faturamento mensal', faturamentoMensal],
                              ['Tickets', ticketsTotal],
                              ['Total faturamento', faturamentoMensal],
                              ['Custo total', custoTotal],
                              ['Massa salarial', massaSalarialTotal],
                              ['Encargos sobre a folha 105%', encargosFolhaTotal],
                              ['Despesa adm. + sal ind. outros', despesaAdmTotal],
                              ['Impostos 9,6%', impostosTotal],
                              ['Total da despesa', totalDespesaResumo],
                            ].map(([label, value]) => (
                              <tr key={String(label)} className="border-b border-border last:border-b-0">
                                <td className="px-4 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-foreground">
                                  {label}
                                </td>
                                <td className="px-4 py-3 text-right text-sm font-semibold text-foreground">
                                  {formatCurrency(Number(value))}
                                </td>
                              </tr>
                            ))}
                            <tr className="bg-muted/30">
                              <td className="px-4 py-3 text-sm font-semibold uppercase tracking-[0.08em] text-foreground">
                                Margem
                              </td>
                              <td
                                className={`px-4 py-3 text-right text-sm font-bold ${
                                  margemTotal >= 0 ? 'text-emerald-600' : 'text-destructive'
                                }`}
                              >
                                {formatCurrency(margemTotal)} ({margemPercentual.toFixed(1)}%)
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <aside className="hidden xl:block">
              <div className="sticky top-24 rounded-3xl border border-border bg-card p-4 shadow-sm">
                <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Acao Rapida
                </div>
                <button
                  onClick={handleSave}
                  disabled={!canEditLaunchValues || saving || loadingMonth || !selectedUnitId}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={16} />}
                  Salvar lancamentos
                </button>
                <p className="mt-3 text-xs text-muted-foreground">
                  O botao acompanha a rolagem para facilitar o salvamento durante o preenchimento.
                </p>
              </div>
            </aside>
          </section>
        </>
      )}
    </div>
  );
}
