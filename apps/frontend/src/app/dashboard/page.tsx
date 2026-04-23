'use client';

import { getDashboardApiUrl, getDataEntryApiUrl } from '@/lib/api-url';
import { Suspense, useState, useEffect, useRef, Fragment, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import Cookies from "js-cookie";
import { Loader2, CheckCircle2, XCircle, FileSpreadsheet, Save } from "lucide-react";
import { getDashboardTemplateMeta } from "@/lib/dashboard-templates";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, LabelList,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ReferenceLine, ComposedChart
} from "recharts";

const TAB_KEYS = ['visaoGeral', 'porGestoras', 'porUnidade', 'custos', 'pessoas', 'dados'] as const;
type TabKey = typeof TAB_KEYS[number];
const decodeToken = (token: string) => {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
};

const isAdminRole = (role: unknown) => String(role || '').toUpperCase() === 'ADMIN';
const toNum = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const detectSeriesYear = (series: Array<{ mes?: string }>) => {
  const years = series
    .map((item) => String(item.mes || '').match(/^(\d{4})-(\d{2})$/)?.[1])
    .filter(Boolean)
    .map((value) => Number(value));

  if (years.length === 0) return new Date().getFullYear();
  return Math.max(...years);
};
const expandMonthlySeriesToYear = <T extends { mes: string }>(
  series: T[],
  createEmpty: (mes: string, label: string, index: number) => T,
) => {
  const year = detectSeriesYear(series);
  const byMonth = new Map(series.map((item) => [item.mes, item]));

  return MONTH_LABELS.map((label, index) => {
    const mes = `${year}-${String(index + 1).padStart(2, '0')}`;
    const existing = byMonth.get(mes);
    return existing ? { ...existing, mesLabel: label } : { ...createEmpty(mes, label, index), mesLabel: label };
  });
};
const hasMonthlyData = (item: Record<string, unknown>) =>
  Object.entries(item).some(([key, value]) => {
    if (['mes', 'mesLabel', 'mesNum', 'lucroPct', 'margem'].includes(key)) return false;
    return typeof value === 'number' && Number.isFinite(value) && value !== 0;
  });
const keepOnlyMonthsWithData = <T extends Record<string, unknown>>(series: T[]) =>
  series.filter((item) => hasMonthlyData(item));
const buildMonthlySeries = (items: Array<{ monthly?: Array<any> }>) => {
  const monthlyMap = new Map<string, { mes: string; receita: number; despesa: number; lucro: number; lucroPct: number }>();

  for (const item of items) {
    for (const monthItem of item.monthly || []) {
      const mes = String(monthItem.mes || '');
      if (!mes) continue;
      if (!monthlyMap.has(mes)) {
        monthlyMap.set(mes, { mes, receita: 0, despesa: 0, lucro: 0, lucroPct: 0 });
      }
      const current = monthlyMap.get(mes)!;
      current.receita += toNum(monthItem.receita);
      current.despesa += toNum(monthItem.despesa);
      current.lucro += toNum(monthItem.lucro);
    }
  }

  const merged = Array.from(monthlyMap.values())
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map((item) => ({
      ...item,
      lucroPct: item.receita > 0 ? item.lucro / item.receita : 0,
    }));

  return keepOnlyMonthsWithData(
    expandMonthlySeriesToYear(merged, (mes, label) => ({
      mes,
      mesLabel: label,
      receita: 0,
      despesa: 0,
      lucro: 0,
      lucroPct: 0,
    })),
  );
};
const isFopagCategoryName = (name: string) => {
  const normalized = normalizarTexto(name);
  return ['FOPAG', 'FOLHA', 'PROVENTO', 'ENCARGO', 'SALARIO', 'PESSOAL'].some((term) => normalized.includes(term));
};
const buildFopagMonthlySeries = (
  items: Array<{
    expenseDefinitionsMonthly?: Array<{ nome?: string; monthly?: Array<{ mes?: string; mesLabel?: string; valor?: number }> }>;
    monthly?: Array<{ mes?: string; mesLabel?: string; fopag?: number }>;
  }>,
) => {
  const monthlyMap = new Map<string, { mes: string; valor: number }>();

  for (const item of items) {
    const expenseSeries = (item.expenseDefinitionsMonthly || []).filter((entry) => isFopagCategoryName(String(entry?.nome || '')));

    if (expenseSeries.length > 0) {
      for (const category of expenseSeries) {
        for (const monthItem of category.monthly || []) {
          const mes = String(monthItem?.mes || '');
          if (!mes) continue;
          if (!monthlyMap.has(mes)) monthlyMap.set(mes, { mes, valor: 0 });
          monthlyMap.get(mes)!.valor += toNum(monthItem?.valor);
        }
      }
      continue;
    }

    for (const monthItem of item.monthly || []) {
      const mes = String(monthItem?.mes || '');
      if (!mes) continue;
      const valorFallback = toNum(monthItem?.fopag);
      if (valorFallback === 0) continue;
      if (!monthlyMap.has(mes)) monthlyMap.set(mes, { mes, valor: 0 });
      monthlyMap.get(mes)!.valor += valorFallback;
    }
  }

  const merged = Array.from(monthlyMap.values()).sort((a, b) => a.mes.localeCompare(b.mes));

  return keepOnlyMonthsWithData(
    expandMonthlySeriesToYear(merged, (mes, label) => ({
      mes,
      mesLabel: label,
      valor: 0,
    })),
  );
};
const getPercentDomain = (series: Array<{ [key: string]: any }>, key: string) => {
  const values = series.map((item) => toNum(item[key])).filter((value) => Number.isFinite(value));
  if (values.length === 0) return [-0.1, 0.1];

  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  if (min === max) {
    const pad = Math.max(Math.abs(max) * 0.25, 0.05);
    return [min - pad, max + pad];
  }

  const pad = Math.max((max - min) * 0.15, 0.02);
  return [min - pad, max + pad];
};
const getMoneyDomain = (series: Array<{ [key: string]: any }>, keys: string[]) => {
  const values = series.flatMap((item) => keys.map((key) => toNum(item[key]))).filter((value) => Number.isFinite(value));
  if (values.length === 0) return [-1000, 1000];

  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = Math.max(max - min, 1);
  const topPad = Math.max(range * 0.18, Math.abs(max) * 0.08, 1000);
  const bottomPad = Math.max(range * 0.12, Math.abs(min) * 0.08, 1000);

  return [min - bottomPad, max + topPad];
};

// â”€â”€ HELPERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;
const fmtPctCompact = (v: number) => `${(v * 100).toFixed(1)}%`;
const getResultadoColor = (v: number) => (toNum(v) >= 0 ? PALETTE.verde : PALETTE.vermelho);
const getResultadoNome = (v: number) => (toNum(v) >= 0 ? "Lucro" : "Prejuizo");
const getResultadoPercentualNome = (v: number) => (toNum(v) >= 0 ? "% Lucratividade" : "% Prejuizo");
const fmtCompactNumber = (v: number) => {
  const valor = toNum(v);
  const abs = Math.abs(valor);
  if (abs >= 1_000_000) return `${(valor / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(valor / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}K`;
  return `${Math.round(valor)}`;
};
const fmtCompactMoney = (v: number) => {
  const valor = toNum(v);
  const abs = Math.abs(valor);
  if (abs < 1000) return fmt(valor);
  return `R$${fmtCompactNumber(valor)}`;
};
// Atualizado para usar o formato com 2 casas decimais ao invÃ©s de K/M
const fmtK = (v: number) => fmt(v);
const fmtAxisMoney = (v: number) => `R$${(Math.abs(v) / 1000).toFixed(0)}K`;
const normalizarTexto = (v: string) =>
  (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
const ehUnidadeTotal = (nome: string) => normalizarTexto(nome).startsWith("TOTAL");
const ordenarUnidadesParaExibicao = (lista: any[]) => {
  const comuns = lista
    .filter((item) => !ehUnidadeTotal(item.nome))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const totais = lista.filter((item) => ehUnidadeTotal(item.nome));
  return [...comuns, ...totais];
};
const mapExpenseDefinitions = (items: any[] = []) =>
  items
    .map((item: any) => ({
      nome: String(item?.name || item?.nome || "Outros"),
      valor: toNum(item?.value ?? item?.valor),
    }))
    .filter((item: any) => item.valor !== 0)
    .sort((a: any, b: any) => b.valor - a.valor);
const mergeExpenseDefinitions = (groups: any[] = []) => {
  const totals = new Map<string, number>();
  groups.forEach((group: any) => {
    (group?.expenseDefinitions || []).forEach((item: any) => {
      const nome = String(item?.nome || item?.name || "Outros");
      const valor = toNum(item?.valor ?? item?.value);
      totals.set(nome, (totals.get(nome) || 0) + valor);
    });
  });
  return Array.from(totals.entries())
    .map(([nome, valor]) => ({ nome, valor }))
    .filter((item) => item.valor !== 0)
    .sort((a, b) => b.valor - a.valor);
};
const getMonthOptionsFromSeries = (series: Array<{ mes?: string; mesLabel?: string }> = []) =>
  series
    .filter((item) => String(item?.mes || '').match(/^\d{4}-\d{2}$/))
    .map((item) => ({
      value: String(item.mes),
      label: String(item.mesLabel || item.mes),
    }))
    .filter((item, index, array) => array.findIndex((entry) => entry.value === item.value) === index)
    .sort((a, b) => a.value.localeCompare(b.value));
const getLatestMonthValue = (series: Array<{ mes?: string }>) =>
  series
    .map((item) => String(item?.mes || ''))
    .filter((value) => /^\d{4}-\d{2}$/.test(value))
    .sort((a, b) => a.localeCompare(b))
    .at(-1) || '';
const getMonthLabel = (series: Array<{ mes?: string; mesLabel?: string }>, monthValue: string) =>
  series.find((item) => item?.mes === monthValue)?.mesLabel || monthValue;
const currentMonthValue = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};
const ratioFromBase = (value: number, base: number) => {
  const denominator = Math.abs(toNum(base));
  if (denominator === 0) return 0;
  return toNum(value) / denominator;
};
const buildNegativeUnitsComparison = (
  items: Array<{ nome: string; monthly?: Array<{ mes?: string; lucro?: number }> }>,
  months: Array<{ mes?: string; mesLabel?: string }>,
  referenceMonth?: string,
) => {
  const targetMonth = referenceMonth || getLatestMonthValue(months);
  const monthIndex = months.findIndex((item) => item?.mes === targetMonth);
  const previousMonth = monthIndex > 0 ? String(months[monthIndex - 1]?.mes || '') : '';

  return {
    targetMonth,
    targetMonthLabel: getMonthLabel(months, targetMonth),
    previousMonth,
    previousMonthLabel: getMonthLabel(months, previousMonth),
    rows: items
      .map((item) => {
        const monthlyByMonth = new Map(
          (item.monthly || []).map((entry) => [String(entry?.mes || ''), toNum(entry?.lucro)]),
        );
        const resultadoAtual = monthlyByMonth.get(targetMonth) ?? 0;

        if (resultadoAtual <= 0 || monthIndex <= 0) return null;

        let cursor = monthIndex - 1;
        const periodoNegativo: Array<{ mes: string; lucro: number }> = [];

        while (cursor >= 0) {
          const mes = String(months[cursor]?.mes || '');
          const lucro = monthlyByMonth.get(mes) ?? 0;
          if (!mes || lucro >= 0) break;
          periodoNegativo.unshift({ mes, lucro });
          cursor -= 1;
        }

        if (periodoNegativo.length === 0) return null;

        const resultadoPeriodoNegativo = periodoNegativo.reduce((acc, entry) => acc + entry.lucro, 0);
        const ultimoMesNegativo = periodoNegativo[periodoNegativo.length - 1]?.mes || previousMonth;
        const evolucao = resultadoAtual - resultadoPeriodoNegativo;
        const resultadoAtualPct = ratioFromBase(resultadoAtual, resultadoPeriodoNegativo);

        return {
          nome: item.nome,
          resultadoAnterior: resultadoPeriodoNegativo,
          resultadoAtual,
          resultadoAtualPct,
          evolucao,
          melhorou: evolucao > 0,
          mesesNegativos: periodoNegativo.length,
          detalhesPeriodo: periodoNegativo.map((entry) => ({
            mes: getMonthLabel(months, entry.mes),
            valor: entry.lucro,
          })),
          chartSeries: [
            ...periodoNegativo.map((entry) => ({
              label: getMonthLabel(months, entry.mes),
              valor: entry.lucro,
              evolucaoLinha: null as number | null,
              tipo: 'negativo',
            })),
            {
              label: getMonthLabel(months, targetMonth),
              valor: resultadoAtual,
              evolucaoLinha: evolucao,
              tipo: 'virada',
            },
          ],
          periodoLabel:
            periodoNegativo.length === 1
              ? getMonthLabel(months, periodoNegativo[0].mes)
              : `${getMonthLabel(months, periodoNegativo[0].mes)} - ${getMonthLabel(months, ultimoMesNegativo)}`,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.evolucao - a.evolucao) as Array<{
        nome: string;
        resultadoAnterior: number;
        resultadoAtual: number;
        resultadoAtualPct: number;
        evolucao: number;
        melhorou: boolean;
        mesesNegativos: number;
        detalhesPeriodo: Array<{ mes: string; valor: number }>;
        chartSeries: Array<{ label: string; valor: number; evolucaoLinha: number | null; tipo: string }>;
        periodoLabel: string;
      }>,
  };
};
const PALETTE = {
  verde:    "#16A34A",
  verdeEsc: "#15803D",
  azul:     "#2563EB",
  laranja:  "#EA580C",
  vermelho: "#DC2626",
  roxo:     "#7C3AED",
  rosa:     "#DB2777",
  cinzaClaro: "#E2E8F0",
  cinza:    "#64748B",
  fundo:    "#F1F5F9",
  card:     "#FFFFFF",
  borda:    "#E2E8F0",
  texto:    "#0F172A",
  textoSec: "#64748B",
  /** Blocos aninhados / gráficos em faixa */
  painel: "#F8FAFC",
  painel2: "#EFF6FF",
  scrim: "rgba(15, 23, 42, 0.45)",
};

const CORES_UNIDADES = [PALETTE.azul, PALETTE.vermelho, PALETTE.verde, PALETTE.laranja, PALETTE.roxo, PALETTE.rosa];
const CHART_THEME = {
  grid: { strokeDasharray: "3 3", stroke: PALETTE.borda },
  gridHorizontal: { strokeDasharray: "3 3", stroke: PALETTE.borda, horizontal: false },
  gridVertical: { strokeDasharray: "3 3", stroke: PALETTE.borda, vertical: false },
  axisX: { tick: { fill: PALETTE.textoSec, fontSize: 12 }, axisLine: { stroke: PALETTE.borda }, tickLine: { stroke: PALETTE.borda } },
  axisY: { tick: { fill: PALETTE.textoSec, fontSize: 11 }, axisLine: { stroke: PALETTE.borda }, tickLine: { stroke: PALETTE.borda } },
  axisCategory: { tick: { fill: PALETTE.texto, fontSize: 11 }, axisLine: { stroke: PALETTE.borda }, tickLine: { stroke: PALETTE.borda } },
  axisPercent: { tick: { fill: PALETTE.textoSec, fontSize: 11 }, axisLine: { stroke: PALETTE.borda }, tickLine: { stroke: PALETTE.borda } },
  legend: { color: PALETTE.textoSec, fontSize: 12 },
  barRadiusTop: [4, 4, 0, 0] as [number, number, number, number],
  barRadiusSide: [0, 4, 4, 0] as [number, number, number, number],
  line: { strokeWidth: 3, dot: { r: 5 }, activeDot: { r: 7 } },
};
const LabelMiniChartValue = ({ x = 0, y = 0, width = 0, height = 0, value = 0 }: any) => {
  const valor = toNum(value);
  const positivo = valor >= 0;
  const yTexto = positivo ? y - 10 : y + height + 14;

  return (
    <text
      x={x + width / 2}
      y={yTexto}
      fill={PALETTE.texto}
      fontSize={10}
      fontWeight={800}
      textAnchor="middle"
      stroke="#FFFFFF"
      strokeWidth={3}
      paintOrder="stroke"
    >
      {fmtCompactMoney(valor)}
    </text>
  );
};

const LabelMargemLucro = ({ x = 0, y = 0, width = 0, height = 0, payload }: any) => {
  if (!payload || typeof payload.margem !== "number") return null;

  const valorBase = typeof payload.lucro === "number" ? payload.lucro : payload.receita || 0;
  const xTexto = valorBase >= 0 ? x + width + 8 : x - 8;
  const alinhamento = valorBase >= 0 ? "start" : "end";

  return (
    <text
      x={xTexto}
      y={y + height / 2 + 4}
      fill={PALETTE.textoSec}
      fontSize={11}
      textAnchor={alinhamento}
    >
      {fmtPct(payload.margem)}
    </text>
  );
};
const LabelBarRightValue = ({ x = 0, y = 0, width = 0, height = 0, value = 0, formatter = fmtCompactMoney, color = PALETTE.texto }: any) => {
  const valor = toNum(value);
  const xTexto = valor >= 0 ? x + width + 8 : x - 8;
  const alinhamento = valor >= 0 ? "start" : "end";

  return (
    <text
      x={xTexto}
      y={y + height / 2 + 4}
      fill={color}
      fontSize={10}
      fontWeight={700}
      textAnchor={alinhamento}
      stroke={PALETTE.card}
      strokeWidth={3}
      paintOrder="stroke"
    >
      {formatter(valor)}
    </text>
  );
};
const LabelBarTopValue = ({ x = 0, y = 0, width = 0, value = 0, formatter = fmtCompactMoney, color = PALETTE.texto }: any) => (
  <text
    x={x + width / 2}
    y={y - 8}
    fill={color}
    fontSize={10}
    fontWeight={700}
    textAnchor="middle"
    stroke={PALETTE.card}
    strokeWidth={3}
    paintOrder="stroke"
  >
    {formatter(toNum(value))}
  </text>
);
const LabelResultadoTopValue = ({ x = 0, y = 0, width = 0, value = 0, formatter = fmtCompactMoney }: any) => (
  <text
    x={x + width / 2}
    y={y - 8}
    fill={getResultadoColor(toNum(value))}
    fontSize={10}
    fontWeight={700}
    textAnchor="middle"
    stroke={PALETTE.card}
    strokeWidth={3}
    paintOrder="stroke"
  >
    {formatter(toNum(value))}
  </text>
);
const LabelLineValue = ({ x = 0, y = 0, value = 0, formatter = fmtPctCompact, color = PALETTE.laranja }: any) => (
  <text
    x={x}
    y={y - 12}
    fill={color}
    fontSize={10}
    fontWeight={800}
    textAnchor="middle"
    stroke={PALETTE.card}
    strokeWidth={3}
    paintOrder="stroke"
  >
    {formatter(toNum(value))}
  </text>
);
const LabelLineResultadoValue = ({ x = 0, y = 0, value = 0, formatter = fmtPctCompact }: any) => (
  <text
    x={x}
    y={y - 12}
    fill={getResultadoColor(toNum(value))}
    fontSize={10}
    fontWeight={800}
    textAnchor="middle"
    stroke={PALETTE.card}
    strokeWidth={3}
    paintOrder="stroke"
  >
    {formatter(toNum(value))}
  </text>
);
const DotLineResultado = ({ cx = 0, cy = 0, value = 0 }: any) => (
  <circle
    cx={cx}
    cy={cy}
    r={5}
    fill={getResultadoColor(toNum(value))}
    stroke={PALETTE.card}
    strokeWidth={2}
  />
);

/** Rótulos externos no gráfico de pizza (Custos): nome, valor e %. */
const renderPieCompositionDespesasLabel = (props: any) => {
  const { cx, cy, midAngle, innerRadius, outerRadius, name, nome, value, percent } = props;
  const label = String(nome ?? name ?? "").trim() || "—";
  const RADIAN = Math.PI / 180;
  const cos = Math.cos(-midAngle * RADIAN);
  const sin = Math.sin(-midAngle * RADIAN);
  const sx = cx + (outerRadius + 2) * cos;
  const sy = cy + (outerRadius + 2) * sin;
  const ex = cx + (outerRadius + 26) * cos;
  const ey = cy + (outerRadius + 26) * sin;
  const anchor = sx >= cx ? "start" : "end";
  const dx = anchor === "start" ? 6 : -6;
  const pct = ((percent ?? 0) * 100).toFixed(1);
  const nomeCurto = label.length > 24 ? `${label.slice(0, 22)}…` : label;

  return (
    <g>
      <path d={`M${sx},${sy}L${ex},${ey}`} stroke={PALETTE.borda} fill="none" strokeWidth={1.25} opacity={0.9} />
      <text
        x={ex + dx}
        y={ey}
        textAnchor={anchor}
        dominantBaseline="middle"
        fill={PALETTE.texto}
        style={{ pointerEvents: "none" }}
      >
        <tspan x={ex + dx} dy="-0.85em" style={{ fontSize: 11, fontWeight: 800 }}>
          {nomeCurto}
        </tspan>
        <tspan x={ex + dx} dy="1.2em" style={{ fontSize: 10, fontWeight: 700, fill: PALETTE.textoSec }}>
          {fmt(toNum(value))}
        </tspan>
        <tspan x={ex + dx} dy="1.15em" style={{ fontSize: 11, fontWeight: 800, fill: PALETTE.laranja }}>
          {pct}%
        </tspan>
      </text>
    </g>
  );
};

// Tooltip customizado
const TooltipCustom = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const margemLucro = payload.find((p: any) => typeof p?.payload?.margem === "number")?.payload?.margem;
  const percentKeys = new Set(['lucroPct', 'margem', 'prejuizoPct', 'pct']);
  const countKeys = new Set(['func', 'funcionarios', 'qtdFunc']);
  return (
    <div style={{ background: PALETTE.card, border: `1px solid ${PALETTE.borda}`, borderRadius: 10, padding: "10px 14px" }}>
      <p style={{ color: PALETTE.textoSec, fontSize: 12, marginBottom: 6 }}>{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color, fontSize: 13, fontWeight: 600 }}>
          {(() => {
            const value = toNum(p.value);
            const dataKey = String(p.dataKey || '');
            const resolvedName =
              dataKey === 'lucro'
                ? getResultadoNome(value)
                : dataKey === 'lucroPct'
                  ? getResultadoPercentualNome(value)
                  : p.name;
            const resolvedValue = percentKeys.has(dataKey)
              ? fmtPct(value)
              : countKeys.has(dataKey)
                ? `${Math.round(value)}`
                : fmtK(value);
            return `${resolvedName}: ${resolvedValue}`;
          })()}
        </p>
      ))}
      {typeof margemLucro === "number" && (
        <p style={{ color: PALETTE.textoSec, fontSize: 12, fontWeight: 700, marginTop: 6 }}>
          {getResultadoPercentualNome(margemLucro)}: {fmtPct(margemLucro)}
        </p>
      )}
    </div>
  );
};
const chartTooltip = <Tooltip content={<TooltipCustom />} />;

const resolveKpiIcon = (titulo: string, icon?: string) => {
  const iconValue = String(icon || "").trim();
  if (iconValue) {
    const iconMap: Record<string, string> = {
      "$": "💵",
      "-": "💸",
      "+/-": "📈",
      "%": "📊",
      "FP": "👥",
      "RH": "🧑",
      "CAT": "🎯",
      "#": "🏢",
      "📉": "💸",
      "💼": "👥",
      "⚙️": "🏷️",
      "👤": "🧑",
      "+": "💵",
      "=": "📈",
      "M": "📊",
      "P": "🧑",
      "F": "👥",
      "MF": "👥",
      "CF": "🏷️",
    };
    return iconMap[iconValue] || iconValue;
  }

  const normalized = normalizarTexto(titulo);
  if (normalized.includes("RECEITA")) return "💵";
  if (normalized.includes("DESPESA")) return "💸";
  if (normalized.includes("RESULTADO") || normalized.includes("LUCRO")) return "📈";
  if (normalized.includes("FOPAG") || normalized.includes("FOLHA")) return "👥";
  if (normalized.includes("FUNCIONARIO") || normalized.includes("COLABORADOR")) return "🧑";
  if (normalized.includes("MARGEM")) return "📊";
  if (normalized.includes("CUSTO")) return "🏷️";
  if (normalized.includes("UNIDADE")) return "🏢";
  if (normalized.includes("EVENTO")) return "🎯";
  return "🧩";
};

const KpiCard = ({ titulo, valor, sub, cor, icon }: any) => (
  <div style={{
    background: PALETTE.card, borderRadius: 14, padding: "16px 18px",
    border: `1px solid ${PALETTE.borda}`, flex: 1, minWidth: 170, paddingBottom: "20px"
  }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <span style={{ color: PALETTE.textoSec, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>{titulo}</span>
      <span
        style={{
          fontSize: 18,
          width: 32,
          height: 32,
          borderRadius: 10,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: `${cor || PALETTE.azul}18`,
          border: `1px solid ${(cor || PALETTE.azul)}33`
        }}
      >
        {resolveKpiIcon(titulo, icon)}
      </span>
    </div>
    <div style={{ color: cor || PALETTE.texto, fontSize: "clamp(18px, 1.8vw, 24px)", fontWeight: 800, marginTop: 10, letterSpacing: -1, whiteSpace: "nowrap" }}>{valor}</div>
    {sub && <div style={{ color: PALETTE.textoSec, fontSize: 12, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
  </div>
);

// â”€â”€ ESTILOS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const s = {
  page: {
    background: PALETTE.fundo, minHeight: "100vh", color: PALETTE.texto,
    fontFamily: "'DM Sans', 'Segoe UI', sans-serif", padding: "0 0 40px",
  },
  header: {
    background: PALETTE.card, borderBottom: `1px solid ${PALETTE.borda}`,
    padding: "18px 32px", display: "flex", justifyContent: "space-between", alignItems: "center",
  },
  badge: (ativo: boolean) => ({
    padding: "6px 16px", borderRadius: 30, fontSize: 13, fontWeight: 600, cursor: "pointer",
    background: ativo ? PALETTE.verdeEsc : "rgba(255,255,255,0.85)",
    color: ativo ? "#FFFFFF" : PALETTE.textoSec,
    border: `1px solid ${ativo ? PALETTE.verdeEsc : PALETTE.borda}`,
    transition: "all .2s",
  }),
  nav: {
    display: "flex", gap: 8, padding: "16px 32px",
    borderBottom: `1px solid ${PALETTE.borda}`, background: PALETTE.cinzaClaro,
    overflowX: "auto" as const, whiteSpace: "nowrap" as const
  },
  body: { padding: "28px 32px" },
  row: { display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" as const },
  card: {
    background: PALETTE.card, borderRadius: 14, padding: "20px 22px",
    border: `1px solid ${PALETTE.borda}`,
  },
  titulo: { fontSize: 13, fontWeight: 700, color: PALETTE.textoSec, textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 16 },
  h2: { fontSize: 16, fontWeight: 700, color: PALETTE.texto, marginBottom: 16 },
};

const ABAS = ["Visao Geral", "Por Gestoras", "Por Unidade", "Custos", "Pessoas", "Dados"];

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dashboardId, setDashboardId] = useState('');
  const [aba, setAba] = useState(0);
  const [unidSel, setUnidSel] = useState<number | null>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [dashboardDataFull, setDashboardDataFull] = useState<any>(null);
  const [dashboardMeta, setDashboardMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [monthFilters, setMonthFilters] = useState<Record<TabKey, string>>({
    visaoGeral: '',
    porGestoras: '',
    porUnidade: '',
    custos: '',
    pessoas: '',
    dados: '',
  });
  const [filtroGestora, setFiltroGestora] = useState<string>("Todas");
  const [filtroUnidadeGestora, setFiltroUnidadeGestora] = useState<string>("Todas");
  const [filtroEvolutivoUnidade, setFiltroEvolutivoUnidade] = useState<string>("Todas");
  const [importModal, setImportModal] = useState<{
    open: boolean;
    phase: "uploading" | "refreshing" | "success" | "error";
    fileName?: string;
    totalLines?: number;
    dashboardId?: string;
    ownerUserId?: string;
    errorMessage?: string;
  }>({ open: false, phase: "uploading" });
  const [dataEntryContext, setDataEntryContext] = useState<any>(null);
  const [dataEntryMonthly, setDataEntryMonthly] = useState<any>(null);
  const [dataEntryLoading, setDataEntryLoading] = useState(false);
  const [dataEntrySaving, setDataEntrySaving] = useState(false);
  const [dataEntryError, setDataEntryError] = useState<string | null>(null);
  const [dataEntrySuccess, setDataEntrySuccess] = useState<string | null>(null);
  const [dataEntryMonth, setDataEntryMonth] = useState(currentMonthValue());
  const [dataEntryUnitId, setDataEntryUnitId] = useState('');
  const [dataEntryValues, setDataEntryValues] = useState<Record<string, number[]>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentToken = Cookies.get('token') || '';
  const currentUser = decodeToken(currentToken);
  const activeTabKey = TAB_KEYS[aba] || 'visaoGeral';
  const activeMonthFilter = monthFilters[activeTabKey] || '';
  const activeDashboardId = searchParams.get('dashboardId') || dashboardId;

  const buildDashboardPayload = (dataMap: Record<string, any>) => ({
    overview: dataMap.overview ?? { kpis: { receitaTotal: 0, despesaTotal: 0, lucro: 0, funcionarios: { current: 0, variance: 0 }, typeTotals: {} }, chartData: [], ranking: [] },
    units: dataMap.units ?? { units: [] },
    managers: dataMap.managers ?? { gestoras: [] },
    costs: dataMap.costs ?? { despesas: [], total: 0 },
    people: dataMap.people ?? { people: [], totalFopag: 0 },
  });

  const fetchDashboardBundle = async (month?: string) => {
    const token = Cookies.get('token');
    const config = { headers: { Authorization: `Bearer ${token}` } };
    const params = new URLSearchParams();
    params.set('_t', String(Date.now()));
    if (activeDashboardId) params.set('dashboardId', activeDashboardId);
    if (month) params.set('month', month);
    const qs = `?${params.toString()}`;

    const requestEntries = [
      ['overview', axios.get(`${getDashboardApiUrl()}/overview${qs}`, config)],
      ['units', axios.get(`${getDashboardApiUrl()}/units${qs}`, config)],
      ['managers', axios.get(`${getDashboardApiUrl()}/managers${qs}`, config)],
      ['costs', axios.get(`${getDashboardApiUrl()}/costs${qs}`, config)],
      ['people', axios.get(`${getDashboardApiUrl()}/people${qs}`, config)],
      ['meta', activeDashboardId ? axios.get(`${getDashboardApiUrl()}/catalog/${activeDashboardId}?_t=${Date.now()}`, config) : Promise.resolve({ data: null })],
    ] as const;

    const settled = await Promise.allSettled(requestEntries.map(([, promise]) => promise));
    const dataMap: Record<string, any> = {};
    const failedKeys: string[] = [];

    settled.forEach((result, index) => {
      const key = requestEntries[index][0];
      if (result.status === 'fulfilled') {
        dataMap[key] = result.value.data;
      } else {
        failedKeys.push(key);
      }
    });

    return { dataMap, failedKeys };
  };

  const fetchDataEntryContext = async () => {
    try {
      const token = Cookies.get('token') || '';
      const response = await axios.get(`${getDataEntryApiUrl()}/context`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const context = response.data;
      setDataEntryContext(context);

      const matchingDashboard =
        (context?.dashboards || []).find((dashboard: any) => dashboard.id === activeDashboardId) ||
        (context?.dashboards || [])[0] ||
        null;

      const firstUnitId = matchingDashboard?.units?.[0]?.id || '';
      setDataEntryUnitId((current) =>
        current && matchingDashboard?.units?.some((unit: any) => unit.id === current) ? current : firstUnitId,
      );
    } catch (err) {
      console.error("Failed to fetch data-entry context", err);
      setDataEntryContext(null);
      setDataEntryError('Nao foi possivel carregar os dados inputados.');
    }
  };

  const fetchDataEntryMonthly = async (unitId: string, month: string) => {
    if (!unitId || !month) return;

    try {
      setDataEntryLoading(true);
      setDataEntryError(null);
      setDataEntrySuccess(null);
      const token = Cookies.get('token') || '';
      const response = await axios.get(`${getDataEntryApiUrl()}/monthly`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { unitId, month },
      });
      const monthly = response.data;
      setDataEntryMonthly(monthly);

      const nextValues: Record<string, number[]> = {};
      for (const entry of monthly?.entries || []) {
        nextValues[`${entry.sectionKey}:${entry.rowKey}`] = Array.from({ length: 5 }, (_, index) =>
          toNum(entry.weeklyValues?.[index]),
        );
      }
      setDataEntryValues(nextValues);
    } catch (err) {
      console.error("Failed to fetch data-entry monthly", err);
      setDataEntryMonthly(null);
      setDataEntryError('Nao foi possivel carregar os valores mensais desta unidade.');
    } finally {
      setDataEntryLoading(false);
    }
  };

  const saveDataEntryMonthly = async () => {
    if (!dataEntryUnitId || !dataEntryMonth || !dataEntryMonthly?.template) return;

    try {
      setDataEntrySaving(true);
      setDataEntryError(null);
      setDataEntrySuccess(null);
      const token = Cookies.get('token') || '';
      const payload = {
        unitId: dataEntryUnitId,
        month: dataEntryMonth,
        entries: (dataEntryMonthly.template || []).flatMap((section: any) =>
          (section.rows || []).map((row: any) => ({
            sectionKey: section.key,
            rowKey: row.key,
            weeklyValues: dataEntryValues[`${section.key}:${row.key}`] || [0, 0, 0, 0, 0],
          })),
        ),
      };

      const response = await axios.post(`${getDataEntryApiUrl()}/monthly`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const monthly = response.data;
      setDataEntryMonthly(monthly);

      const nextValues: Record<string, number[]> = {};
      for (const entry of monthly?.entries || []) {
        nextValues[`${entry.sectionKey}:${entry.rowKey}`] = Array.from({ length: 5 }, (_, index) =>
          toNum(entry.weeklyValues?.[index]),
        );
      }
      setDataEntryValues(nextValues);
      setDataEntrySuccess('Dados mensais atualizados com sucesso.');
      await fetchData({ includeFull: true, skipPageLoading: true });
    } catch (err: any) {
      console.error("Failed to save data-entry monthly", err);
      setDataEntryError(err.response?.data?.message || 'Nao foi possivel salvar os dados mensais.');
    } finally {
      setDataEntrySaving(false);
    }
  };

  const updateDataEntryValue = (sectionKey: string, rowKey: string, weekIndex: number, rawValue: string) => {
    const parsed = Number(rawValue);
    const key = `${sectionKey}:${rowKey}`;

    setDataEntryValues((current) => {
      const next = current[key] ? [...current[key]] : [0, 0, 0, 0, 0];
      next[weekIndex] = Number.isFinite(parsed) ? parsed : 0;
      return {
        ...current,
        [key]: next,
      };
    });
  };

  const fetchData = async (options?: { includeFull?: boolean; skipPageLoading?: boolean }) => {
    try {
      if (!options?.skipPageLoading) setLoading(true);
      setLoadError(null);
      const { dataMap, failedKeys } = await fetchDashboardBundle(activeMonthFilter || undefined);

      if (failedKeys.length > 0) {
        setLoadError(`Falha ao carregar: ${failedKeys.join(', ')}.`);
      }

      setDashboardMeta(dataMap.meta ?? null);
      setDashboardData(buildDashboardPayload(dataMap));

      if (options?.includeFull || !dashboardDataFull) {
        const { dataMap: fullDataMap } = await fetchDashboardBundle();
        setDashboardDataFull(buildDashboardPayload(fullDataMap));
      }
    } catch (err) {
      console.error("Failed to fetch dashboard data", err);
      setLoadError('Erro ao carregar os dados do dashboard.');
      setDashboardData(buildDashboardPayload({}));
      if (!dashboardDataFull) setDashboardDataFull(buildDashboardPayload({}));
    } finally {
      if (!options?.skipPageLoading) setLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const token = Cookies.get('token') || '';
    const currentUser = decodeToken(token);
    if (isAdminRole(currentUser?.role) && !activeDashboardId) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      alert("Selecione um dashboard antes de importar.");
      router.push("/dashboards");
      return;
    }

    setImportModal({
      open: true,
      phase: "uploading",
      fileName: file.name,
    });

    const formData = new FormData();
    formData.append("file", file);

    try {
      const importQs = activeDashboardId ? `?dashboardId=${activeDashboardId}` : "";
      const response = await axios.post(`${getDashboardApiUrl()}/import${importQs}`, formData, {
        headers: { "Content-Type": "multipart/form-data", Authorization: `Bearer ${token}` },
      });
      const total = response?.data?.totalImportado;
      const targetDashboard = response?.data?.dashboardId;
      const targetOwner = response?.data?.ownerUserId;

      setImportModal({
        open: true,
        phase: "refreshing",
        fileName: file.name,
        totalLines: typeof total === "number" ? total : undefined,
        dashboardId: typeof targetDashboard === "string" ? targetDashboard : undefined,
        ownerUserId: typeof targetOwner === "string" ? targetOwner : undefined,
      });

      await fetchData({ includeFull: true, skipPageLoading: true });

      setImportModal({
        open: true,
        phase: "success",
        fileName: file.name,
        totalLines: typeof total === "number" ? total : undefined,
        dashboardId: typeof targetDashboard === "string" ? targetDashboard : undefined,
        ownerUserId: typeof targetOwner === "string" ? targetOwner : undefined,
      });
    } catch (error) {
      console.error(error);
      const message = axios.isAxiosError(error)
        ? (error.response?.data?.message || error.message)
        : "Falha desconhecida";
      setImportModal({
        open: true,
        phase: "error",
        fileName: file.name,
        errorMessage: String(message),
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const closeImportModal = () => {
    setImportModal({ open: false, phase: "uploading" });
  };

  useEffect(() => {
    const nextDashboardId = searchParams.get('dashboardId') || '';
    const token = Cookies.get('token') || '';
    const currentUser = decodeToken(token);

    if (isAdminRole(currentUser?.role) && !nextDashboardId) {
      router.replace('/dashboards');
      return;
    }

    setDashboardId(nextDashboardId);
  }, [router, searchParams]);

  useEffect(() => {
    fetchData({ includeFull: true });
  }, [activeDashboardId]);

  useEffect(() => {
    if (!activeDashboardId && isAdminRole(decodeToken(Cookies.get('token') || '')?.role)) return;
    fetchData();
  }, [aba, activeMonthFilter]);

  useEffect(() => {
    fetchDataEntryContext();
  }, [activeDashboardId]);

  useEffect(() => {
    if (activeTabKey !== 'dados') return;
    if (!dataEntryUnitId || !dataEntryMonth) return;
    fetchDataEntryMonthly(dataEntryUnitId, dataEntryMonth);
  }, [activeTabKey, dataEntryUnitId, dataEntryMonth]);


  if (loading || !dashboardData) {
    return (
      <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: PALETTE.azul, fontSize: '1.25rem', fontWeight: 600 }}>Carregando dados financeiros...</div>
      </div>
    );
  }

  // â”€â”€ DADOS DINÃ‚MICOS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const currentDashboardData = dashboardData;
  const fullDashboardData = dashboardDataFull || dashboardData;
  const typeTotals = currentDashboardData.overview.kpis.typeTotals || {};
  const dynamicKpis: Array<{ key: string; label: string; sourceColumn: string; kind: string }> =
    (currentDashboardData.overview.kpis.dynamicKpis || []).filter((item: any) => item.kind === 'extra');
  const chavesExtras = dynamicKpis.length > 0
    ? dynamicKpis.map((item) => item.key)
    : Object.keys(typeTotals).filter((k: string) => k !== 'RECEITA' && k !== 'DESPESA');
  const dynamicKpiMap = new Map<string, { key: string; label: string; sourceColumn: string; kind: string }>(
    dynamicKpis.map((item) => [item.key, item]),
  );

  const mapOverviewMonths = (sourceData: any) => {
    const sourceTypeTotals = sourceData?.overview?.kpis?.typeTotals || {};
    return keepOnlyMonthsWithData(
      expandMonthlySeriesToYear(
        (sourceData?.overview?.chartData || []).map((d: any, i: number) => ({
          mes: d.month,
          mesNum: i + 1,
          receita: toNum(d.receita),
          despesa: toNum(d.despesa),
          lucro: toNum(d.lucro),
          funcionarios: toNum(d.funcionarios),
          lucroPct: toNum(d.receita) > 0 ? toNum(d.lucro) / toNum(d.receita) : 0,
          fopag: 0,
          ...Object.fromEntries(
            Object.keys(sourceTypeTotals || {})
              .filter((k) => k !== 'RECEITA' && k !== 'DESPESA')
              .map((k) => [k.toLowerCase(), toNum(d[k.toLowerCase()])]),
          ),
        })),
        (mes, label, index) => ({
          mes,
          mesLabel: label,
          mesNum: index + 1,
          receita: 0,
          despesa: 0,
          lucro: 0,
          funcionarios: 0,
          lucroPct: 0,
          fopag: 0,
          ...Object.fromEntries(chavesExtras.map((k) => [k.toLowerCase(), 0])),
        }),
      ),
    ).map((item, index) => ({
      ...item,
      mesNum: index + 1,
      lucroPct: toNum(item.receita) > 0 ? toNum(item.lucro) / toNum(item.receita) : 0,
    }));
  };

  const mapUnitsData = (sourceData: any) =>
    ordenarUnidadesParaExibicao((sourceData?.units?.units || []).map((u: any) => {
      const p = (sourceData?.people?.people || []).find((item: any) => item.unidade === u.unit) || {};
      return {
        nome: u.unit,
        receita: toNum(u.receita),
        despesa: toNum(u.despesa),
        lucro: toNum(u.receita) - toNum(u.despesa),
        margem: toNum(u.margem) / 100,
        expenseDefinitions: mapExpenseDefinitions(u.expenseDefinitions),
        expenseDefinitionsMonthly: (u.expenseDefinitionsMonthly || []).map((item: any) => ({
          nome: String(item?.name || item?.nome || "Outros"),
          monthly: keepOnlyMonthsWithData(
            expandMonthlySeriesToYear(
              (item?.monthly || []).map((entry: any) => ({
                mes: entry.month,
                valor: toNum(entry.value),
              })),
              (mes, label) => ({
                mes,
                mesLabel: label,
                valor: 0,
              }),
            ),
          ),
        })),
        monthly: keepOnlyMonthsWithData(
          expandMonthlySeriesToYear(
            (u.monthly || []).map((m: any) => ({
              mes: m.month,
              receita: toNum(m.receita),
              despesa: toNum(m.despesa),
              lucro: toNum(m.lucro),
              lucroPct: toNum(m.receita) > 0 ? toNum(m.lucro) / toNum(m.receita) : 0
            })),
            (mes, label) => ({
              mes,
              mesLabel: label,
              receita: 0,
              despesa: 0,
              lucro: 0,
              lucroPct: 0,
            }),
          ),
        ),
        fopag: toNum(p.fopag),
        func: toNum(p.funcionarios)
      };
    }));

  const mapManagersData = (sourceData: any) =>
    (sourceData?.managers?.gestoras || []).map((g: any) => ({
      nome: g.name,
      receita: toNum(g.receita),
      despesa: toNum(g.despesa),
      lucro: toNum(g.lucro),
      margem: toNum(g.margem) / 100,
      expenseDefinitions: mapExpenseDefinitions(g.expenseDefinitions),
      units: ordenarUnidadesParaExibicao((g.units || []).map((u: any) => ({
        nome: u.unit,
        receita: toNum(u.receita),
        despesa: toNum(u.despesa),
        lucro: toNum(u.lucro),
        margem: toNum(u.margem) / 100,
        expenseDefinitions: mapExpenseDefinitions(u.expenseDefinitions),
        monthly: keepOnlyMonthsWithData(
          expandMonthlySeriesToYear(
            (u.monthly || []).map((m: any) => ({
              mes: m.month,
              receita: toNum(m.receita),
              despesa: toNum(m.despesa),
              lucro: toNum(m.lucro),
              lucroPct: toNum(m.receita) > 0 ? toNum(m.lucro) / toNum(m.receita) : 0
            })),
            (mes, label) => ({
              mes,
              mesLabel: label,
              receita: 0,
              despesa: 0,
              lucro: 0,
              lucroPct: 0,
            }),
          ),
        )
      }))),
      monthly: keepOnlyMonthsWithData(
        expandMonthlySeriesToYear(
          (g.monthly || []).map((m: any) => ({
            mes: m.month,
            receita: toNum(m.receita),
            despesa: toNum(m.despesa),
            lucro: toNum(m.lucro),
            lucroPct: toNum(m.receita) > 0 ? toNum(m.lucro) / toNum(m.receita) : 0
          })),
          (mes, label) => ({
            mes,
            mesLabel: label,
            receita: 0,
            despesa: 0,
            lucro: 0,
            lucroPct: 0,
          }),
        ),
      )
    }));
  const meses = mapOverviewMonths(currentDashboardData);
  const mesesFull = mapOverviewMonths(fullDashboardData);
  const unidades = mapUnitsData(currentDashboardData);
  const unidadesFull = mapUnitsData(fullDashboardData);
  const gestoras = mapManagersData(currentDashboardData);
  const gestorasFull = mapManagersData(fullDashboardData);
  const categoriasDespesa = (currentDashboardData?.costs?.despesas || []).map((d: any) => ({
    nome: d.name,
    valor: d.value
  }));

  const totalReceita = dashboardData.overview.kpis.receitaTotal;
  const totalDespesa = dashboardData.overview.kpis.despesaTotal;
  const totalLucro = dashboardData.overview.kpis.lucro;
  const totalFopag = toNum(
    dashboardData.overview.kpis.massaSalarial ?? dashboardData.people.totalFopag ?? 0,
  );
  const funcInfo = dashboardData.overview.kpis.funcionarios || { current: 0, variance: 0 };
  const totalFuncTabela = (dashboardData.people?.people || []).reduce(
    (acc: number, item: any) => acc + toNum(item.funcionarios),
    0,
  );
  const totalFunc = totalFuncTabela || (typeof funcInfo === 'number' ? funcInfo : funcInfo.current);
  const funcVar = typeof funcInfo === 'number' ? 0 : funcInfo.variance;
  const margemGeral = toNum(
    dashboardData.overview.kpis.margemPercent ??
      (totalReceita > 0 ? totalLucro / totalReceita : 0),
  );
  const percentualSobreFaturamento = toNum(
    dashboardData.overview.kpis.percentualSobreFaturamento ??
      (totalReceita > 0 ? totalDespesa / totalReceita : 0),
  );

  const setMonthFilterForTab = (tabKey: TabKey, month: string) =>
    setMonthFilters((current) => ({ ...current, [tabKey]: month }));
  const renderMonthFilter = (tabKey: TabKey, options: Array<{ value: string; label: string }>) => (
    <>
      <div style={{ marginBottom: 10, fontSize: 11, color: PALETTE.textoSec, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700 }}>
        Mês
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {[{ value: '', label: 'Todos' }, ...options].map((item) => (
          <button
            key={item.value || 'todos'}
            onClick={() => setMonthFilterForTab(tabKey, item.value)}
            style={s.badge((monthFilters[tabKey] || '') === item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
  // â”€â”€ ABA 0: VISÃƒO GERAL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const AbaVisaoGeral = () => {
    const unidadesLucro = [...unidades].filter((u:any) => u.margem > 0.10).sort((a:any,b:any) => b.margem - a.margem);
    const unidadesPrejuizo = [...unidades].filter((u:any) => u.lucro < 0).map(u => ({...u, prejuizoPct: Math.abs(u.margem)})).sort((a:any,b:any) => b.prejuizoPct - a.prejuizoPct);
    const monthOptions = getMonthOptionsFromSeries(mesesFull);
    const comparativoNegativas = buildNegativeUnitsComparison(unidadesFull, mesesFull, monthFilters.visaoGeral || undefined);
    const mesesResultado = meses.map((item: any) => ({
      ...item,
      lucroPositivo: toNum(item.lucro) >= 0 ? toNum(item.lucro) : null,
      prejuizo: toNum(item.lucro) < 0 ? toNum(item.lucro) : null,
    }));

    return (
    <>
      {renderMonthFilter('visaoGeral', monthOptions)}
      <div style={s.row}>
        <KpiCard titulo="Receita Total" valor={fmtK(totalReceita)} sub="Total Geral" cor={PALETTE.verde} icon="$" />
        <KpiCard
          titulo="Despesa Total"
          valor={fmtK(totalDespesa)}
          sub={`${fmtPct(percentualSobreFaturamento)} sobre faturamento`}
          cor={PALETTE.vermelho}
          icon="-"
        />
        <KpiCard titulo="Resultado" valor={fmtK(totalLucro)} sub={fmtPct(margemGeral) + " de margem"} cor={totalLucro >= 0 ? PALETTE.verde : PALETTE.vermelho} icon="+/-" />
        <KpiCard titulo="FOPAG" valor={fmtK(totalFopag)} sub={fmtPct(totalReceita > 0 ? totalFopag / totalReceita : 0) + " da receita"} cor={PALETTE.laranja} icon="FP" />
        <KpiCard 
          titulo="Funcionários" 
          valor={totalFunc} 
          sub={funcVar > 0 ? `+${funcVar} (mes anterior)` : funcVar < 0 ? `${funcVar} (mes anterior)` : `Sem variacao`} 
          cor={funcVar > 0 ? PALETTE.verde : funcVar < 0 ? PALETTE.vermelho : PALETTE.azul} 
          icon="RH" 
        />
        {chavesExtras.map((k: string, i: number) => (
          <KpiCard 
            key={k} 
            titulo={dynamicKpiMap.get(k)?.label || k} 
            valor={fmtK(typeTotals[k])} 
            sub={dynamicKpiMap.get(k)?.sourceColumn ? `KPI dinamico: ${dynamicKpiMap.get(k)?.sourceColumn}` : "Outra Classificacao"} 
            cor={CORES_UNIDADES[(i + 3) % CORES_UNIDADES.length]} 
            icon="CAT" 
          />
        ))}
      </div>

        <div style={{ ...s.card, marginBottom: 16 }}>
          <div style={s.titulo}>Evolucao Mensal do Percentual de Lucratividade</div>
        <div style={{ color: PALETTE.textoSec, fontSize: 12, marginBottom: 14 }}>
          Linha mensal da lucratividade quando positiva e do prejuizo quando negativa no periodo selecionado.
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={mesesResultado} margin={{ top: 12, right: 14, bottom: 6, left: 4 }}>
            <CartesianGrid {...CHART_THEME.gridVertical} />
            <XAxis dataKey="mesLabel" {...CHART_THEME.axisX} />
            <YAxis
              domain={getPercentDomain(mesesResultado, 'lucroPct')}
              tickFormatter={fmtPct}
              {...CHART_THEME.axisPercent}
            />
            {chartTooltip}
            <Legend wrapperStyle={CHART_THEME.legend} />
            <Line
              type="monotone"
              dataKey="lucroPct"
              name="% Resultado"
              stroke={PALETTE.laranja}
              strokeWidth={3}
              dot={<DotLineResultado />}
              activeDot={{ ...CHART_THEME.line.activeDot, fill: PALETTE.laranja, r: 6 }}
              label={<LabelLineResultadoValue formatter={fmtPctCompact} />}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={s.row}>
        <div style={{ ...s.card, flex: 2, minWidth: 320 }}>
          <div style={s.titulo}>Evolucao Mensal</div>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={mesesResultado} barGap={4} margin={{ top: 22, right: 10, bottom: 6, left: 0 }}>
              <CartesianGrid {...CHART_THEME.grid} />
              <XAxis dataKey="mesLabel" {...CHART_THEME.axisX} />
              <YAxis yAxisId="valor" domain={getMoneyDomain(mesesResultado, ['receita', 'despesa', 'lucro'])} tickFormatter={v => `R$${(v/1000).toFixed(0)}K`} {...CHART_THEME.axisY} />
              <YAxis yAxisId="percentual" orientation="right" tickFormatter={fmtPct} {...CHART_THEME.axisPercent} />
              {chartTooltip}
              <Legend wrapperStyle={CHART_THEME.legend} />
              <Bar yAxisId="valor" dataKey="receita" name="Receita" fill={PALETTE.verde} radius={CHART_THEME.barRadiusTop}>
                <LabelList dataKey="receita" content={<LabelBarTopValue formatter={fmtCompactMoney} color={PALETTE.verde} />} />
              </Bar>
              <Bar yAxisId="valor" dataKey="despesa" name="Despesa" fill={PALETTE.vermelho} radius={CHART_THEME.barRadiusTop}>
                <LabelList dataKey="despesa" content={<LabelBarTopValue formatter={fmtCompactMoney} color={PALETTE.vermelho} />} />
              </Bar>
              {chavesExtras.map((k: string, i: number) => (
                <Bar yAxisId="valor" key={k} dataKey={k.toLowerCase()} name={dynamicKpiMap.get(k)?.label || k} fill={CORES_UNIDADES[(i + 3) % CORES_UNIDADES.length]} radius={CHART_THEME.barRadiusTop}>
                  <LabelList dataKey={k.toLowerCase()} content={<LabelBarTopValue formatter={fmtCompactMoney} color={CORES_UNIDADES[(i + 3) % CORES_UNIDADES.length]} />} />
                </Bar>
              ))}
              <Bar yAxisId="valor" dataKey="lucroPositivo" name="Lucro" fill={PALETTE.verde} radius={CHART_THEME.barRadiusTop}>
                <LabelList dataKey="lucroPositivo" content={<LabelResultadoTopValue formatter={fmtCompactMoney} />} />
              </Bar>
              <Bar yAxisId="valor" dataKey="prejuizo" name="Prejuizo" fill={PALETTE.vermelho} radius={CHART_THEME.barRadiusTop}>
                <LabelList dataKey="prejuizo" content={<LabelResultadoTopValue formatter={fmtCompactMoney} />} />
              </Bar>
              <Line
                yAxisId="percentual"
                type="monotone"
                dataKey="lucroPct"
                name="% Resultado"
                stroke={PALETTE.laranja}
                {...CHART_THEME.line}
                dot={<DotLineResultado />}
                activeDot={{ ...CHART_THEME.line.activeDot, fill: PALETTE.laranja }}
                label={<LabelLineResultadoValue formatter={fmtPctCompact} />}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div style={{ ...s.card, flex: 1, minWidth: 220 }}>
          <div style={s.titulo}>Resultado por Mes</div>
          {meses.map((m: any, i: number) => {
            const pct = m.receita > 0 ? (m.despesa / m.receita) : 1;
            const ok = m.lucro >= 0;
            const lucroPct = m.receita > 0 ? m.lucro / m.receita : 0;
            return (
              <div key={i} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{m.mes}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: PALETTE.textoSec, fontWeight: 700 }}>
                      {fmtPct(lucroPct)}
                    </span>
                    <span style={{ fontSize: 13, color: ok ? PALETTE.verde : PALETTE.vermelho, fontWeight: 700 }}>
                      {fmtK(m.lucro)}
                    </span>
                  </div>
                </div>
                <div style={{ background: PALETTE.borda, borderRadius: 4, height: 6 }}>
                  <div style={{
                    width: `${Math.min(pct * 100, 100)}%`, height: 6, borderRadius: 4,
                    background: ok ? PALETTE.verde : PALETTE.vermelho,
                    transition: "width .5s",
                  }} />
                </div>
                <div style={{ fontSize: 11, color: PALETTE.textoSec, marginTop: 3, display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span>Desp/Rec: {fmtPct(pct)}</span>
                    <span>{ok ? "% Lucratividade" : "% Prejuizo"}: {fmtPct(lucroPct)}</span>
                  </div>
                </div>
            );
          })}
        </div>
      </div>

      <div style={s.row}>
        <div style={{ ...s.card, flex: 1, minWidth: 300 }}>
          <div style={s.titulo}>Top Unidades - Margem &gt; 10%</div>
          {unidadesLucro.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 220, color: PALETTE.textoSec, fontSize: 14 }}>
              Nenhuma unidade &gt; 10%
            </div>
          ) : (
            <div style={{ maxHeight: 320, overflowY: 'auto', overflowX: 'hidden' }}>
              <ResponsiveContainer width="100%" height={Math.max(unidadesLucro.length * 32, 220)}>
                <BarChart data={unidadesLucro} layout="vertical" barGap={3} margin={{ left: 10, right: 20 }}>
                  <CartesianGrid {...CHART_THEME.gridHorizontal} />
                  <XAxis type="number" tickFormatter={fmtPct} {...CHART_THEME.axisY} />
                  <YAxis dataKey="nome" type="category" interval={0} tick={{ ...CHART_THEME.axisCategory.tick, fontSize: 10 }} axisLine={CHART_THEME.axisCategory.axisLine} tickLine={CHART_THEME.axisCategory.tickLine} width={105} />
                  <Tooltip formatter={(v: any) => fmtPct(v)} content={<TooltipCustom />} />
                  <Bar dataKey="margem" name="Margem" fill={PALETTE.verde} radius={CHART_THEME.barRadiusSide}>
                    <LabelList dataKey="margem" content={<LabelBarRightValue formatter={fmtPct} color={PALETTE.textoSec} />} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div style={{ ...s.card, flex: 1, minWidth: 300 }}>
          <div style={s.titulo}>Unidades Negativadas</div>
          {unidadesPrejuizo.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 220, color: PALETTE.textoSec, fontSize: 14 }}>
              Nenhuma unidade negativada!
            </div>
          ) : (
            <div style={{ maxHeight: 320, overflowY: 'auto', overflowX: 'hidden' }}>
              <ResponsiveContainer width="100%" height={Math.max(unidadesPrejuizo.length * 32, 220)}>
                <BarChart data={unidadesPrejuizo} layout="vertical" barGap={3} margin={{ left: 10, right: 20 }}>
                  <CartesianGrid {...CHART_THEME.gridHorizontal} />
                  <XAxis type="number" tickFormatter={fmtPct} {...CHART_THEME.axisY} />
                  <YAxis dataKey="nome" type="category" interval={0} tick={{ ...CHART_THEME.axisCategory.tick, fontSize: 10 }} axisLine={CHART_THEME.axisCategory.axisLine} tickLine={CHART_THEME.axisCategory.tickLine} width={105} />
                  <Tooltip formatter={(v: any) => fmtPct(v)} content={<TooltipCustom />} />
                  <Bar dataKey="prejuizoPct" name="Margem Negativa" fill={PALETTE.vermelho} radius={CHART_THEME.barRadiusSide}>
                    <LabelList dataKey="prejuizoPct" content={<LabelBarRightValue formatter={fmtPct} color={PALETTE.textoSec} />} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div style={s.card}>
        <div style={s.titulo}>Comparativo das Unidades Negativadas</div>
        <div style={{ color: PALETTE.textoSec, fontSize: 12, marginBottom: 14 }}>
          Unidades que passaram por um periodo negativo e ficaram positivas em {comparativoNegativas.targetMonthLabel}, comparando o acumulado do periodo negativo com o resultado da virada.
        </div>
        {comparativoNegativas.previousMonth && comparativoNegativas.rows.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16 }}>
            {comparativoNegativas.rows.map((row: any) => (
              <div key={row.nome} style={{ background: PALETTE.painel, border: `1px solid ${PALETTE.borda}`, borderRadius: 16, padding: "16px 18px", boxShadow: "0 8px 28px rgba(15,23,42,0.08)" }}>
                <div style={{ color: PALETTE.texto, fontSize: 18, fontWeight: 800, letterSpacing: -0.3, marginBottom: 12 }}>
                  {row.nome}
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: PALETTE.vermelho, fontSize: 13, fontWeight: 800, marginBottom: 4 }}>
                    Periodo negativo ({row.periodoLabel}): -{fmtK(Math.abs(toNum(row.resultadoAnterior)))}
                  </div>
                  {row.detalhesPeriodo.map((item: any) => (
                    <div key={`${row.nome}-${item.mes}`} style={{ color: PALETTE.vermelho, fontSize: 12, fontWeight: 700, marginBottom: 2 }}>
                      {item.mes}: -{fmtK(Math.abs(toNum(item.valor)))}
                    </div>
                  ))}
                  <div style={{ color: toNum(row.resultadoAtual) >= 0 ? PALETTE.verde : PALETTE.vermelho, fontSize: 13, fontWeight: 800, marginTop: 6, marginBottom: 4 }}>
                    {comparativoNegativas.targetMonthLabel}: {fmtK(toNum(row.resultadoAtual))}
                  </div>
                  <div style={{ color: PALETTE.textoSec, fontSize: 12, marginBottom: 4 }}>
                    Percentual do resultado: {fmtPct(toNum(row.resultadoAtualPct))}
                  </div>
                  <div style={{ color: PALETTE.textoSec, fontSize: 12, marginBottom: 4 }}>
                    Meses negativos: {toNum(row.mesesNegativos)}
                  </div>
                  <div style={{ color: row.melhorou ? PALETTE.verdeEsc : PALETTE.vermelho, fontSize: 13, fontWeight: 800 }}>
                    Evolucao: {fmtK(toNum(row.evolucao))}
                  </div>
                </div>

                <div style={{ borderTop: `1px solid ${PALETTE.borda}`, paddingTop: 14 }}>
                  <ResponsiveContainer width="100%" height={236}>
                    <ComposedChart data={row.chartSeries} margin={{ top: 28, right: 20, bottom: 14, left: 4 }}>
                      <CartesianGrid strokeDasharray="4 4" stroke={PALETTE.borda} vertical={false} />
                      <XAxis dataKey="label" {...CHART_THEME.axisX} />
                      <YAxis tickFormatter={fmtAxisMoney} {...CHART_THEME.axisY} />
                      <ReferenceLine y={0} stroke={PALETTE.textoSec} strokeOpacity={0.3} />
                      <Tooltip
                        content={({ active, payload, label }: any) => {
                          if (!active || !payload?.length) return null;
                          const data = payload[0]?.payload;
                          return (
                            <div style={{ background: PALETTE.painel2, border: `1px solid ${PALETTE.borda}`, borderRadius: 10, padding: "10px 14px" }}>
                              <div style={{ color: PALETTE.textoSec, fontSize: 12, marginBottom: 6 }}>{label}</div>
                              <div style={{ color: toNum(data?.valor) >= 0 ? PALETTE.verde : PALETTE.vermelho, fontSize: 13, fontWeight: 700 }}>
                                Resultado: {fmtK(toNum(data?.valor))}
                              </div>
                              {label === comparativoNegativas.targetMonthLabel ? (
                                <div style={{ color: PALETTE.textoSec, fontSize: 12, fontWeight: 700, marginTop: 4 }}>
                                  Percentual do resultado: {fmtPct(toNum(row.resultadoAtualPct))}
                                </div>
                              ) : null}
                              {typeof data?.evolucaoLinha === 'number' ? (
                                <div style={{ color: row.melhorou ? PALETTE.verdeEsc : PALETTE.vermelho, fontSize: 12, fontWeight: 700, marginTop: 4 }}>
                                  Evolucao: {fmtK(toNum(data.evolucaoLinha))}
                                </div>
                              ) : null}
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="valor" radius={CHART_THEME.barRadiusTop} barSize={34}>
                        {row.chartSeries.map((entry: any, index: number) => (
                          <Cell key={`${row.nome}-${entry.label}-${index}`} fill={toNum(entry.valor) >= 0 ? PALETTE.verde : PALETTE.vermelho} />
                        ))}
                        <LabelList dataKey="valor" content={<LabelMiniChartValue />} />
                      </Bar>
                      <Line
                        type="monotone"
                        dataKey="evolucaoLinha"
                        name="Evolucao"
                        stroke={PALETTE.laranja}
                        strokeWidth={3}
                        connectNulls={false}
                        dot={{ r: 5, fill: PALETTE.laranja, stroke: PALETTE.card, strokeWidth: 2 }}
                        activeDot={{ r: 7, fill: PALETTE.laranja, stroke: PALETTE.card, strokeWidth: 2 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 220, color: PALETTE.textoSec, fontSize: 14 }}>
            Nao ha comparativo disponivel para as unidades negativadas neste mes.
          </div>
        )}
      </div>
    </>
    );
  };

  // â”€â”€ ABA: CUSTOS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const AbaPorGestoras = () => {
    type DetalhamentoGestoraMesCell = {
      mesLabel: string;
      receita: number;
      despesa: number;
      lucro: number;
      /** resultado ÷ receita no mês; null se não houver receita */
      pctLucroSobreRec: number | null;
    };
    type DetalhamentoGestoraRow = {
      nome: string;
      monthCells: DetalhamentoGestoraMesCell[];
      totalReceita: number;
      totalDespesa: number;
      totalLucro: number;
      pctMargem: number;
      pctDespSobreRec: number;
    };
    const nomesCategoriasCusto = new Set(
      categoriasDespesa.map((item: any) => normalizarTexto(item.nome)),
    );
    const gestorasParaFiltro = gestoras.filter(
      (g: any) => !nomesCategoriasCusto.has(normalizarTexto(g.nome)),
    );
    const gestorasBase = gestorasParaFiltro.length > 0 ? gestorasParaFiltro : gestoras;
    const gestorasBaseFull = (() => {
      const nomesCategorias = new Set(categoriasDespesa.map((item: any) => normalizarTexto(item.nome)));
      const filtradas = gestorasFull.filter((g: any) => !nomesCategorias.has(normalizarTexto(g.nome)));
      return filtradas.length > 0 ? filtradas : gestorasFull;
    })();

    const possuiFiltroGestora = filtroGestora !== "Todas" && !!filtroGestora;
    const possuiFiltroUnidadeGestora = possuiFiltroGestora && filtroUnidadeGestora !== "Todas" && !!filtroUnidadeGestora;

    const gestoraSelecionada = !possuiFiltroGestora
      ? null
      : gestorasBase.find((g: any) => g.nome === filtroGestora) || null;
    const gestoraSelecionadaFull = !possuiFiltroGestora
      ? null
      : gestorasBaseFull.find((g: any) => g.nome === filtroGestora) || null;
    const unidadesDaGestora = gestoraSelecionadaFull ? gestoraSelecionadaFull.units : [];
    const unidadeSelecionada = !possuiFiltroUnidadeGestora
      ? null
      : (gestoraSelecionada?.units || []).find((u: any) => u.nome === filtroUnidadeGestora) || null;

    const dataComparativa = possuiFiltroUnidadeGestora
      ? (unidadeSelecionada ? [unidadeSelecionada] : [])
      : possuiFiltroGestora
        ? (gestoraSelecionada?.units || [])
        : gestorasBase;
    const receitaExibida = possuiFiltroUnidadeGestora
      ? unidadeSelecionada?.receita || 0
      : possuiFiltroGestora
        ? gestoraSelecionada?.receita || 0
        : gestorasBase.reduce((acc: number, g: any) => acc + g.receita, 0);
    const lucroExibido = possuiFiltroUnidadeGestora
      ? unidadeSelecionada?.lucro || 0
      : possuiFiltroGestora
        ? gestoraSelecionada?.lucro || 0
        : gestorasBase.reduce((acc: number, g: any) => acc + g.lucro, 0);
    const unidadesExibidas = possuiFiltroUnidadeGestora
      ? (unidadeSelecionada ? 1 : 0)
      : possuiFiltroGestora
        ? (gestoraSelecionada?.units.length || 0)
        : gestorasBase.reduce((acc: number, g: any) => acc + g.units.length, 0);
    const margemExibida = possuiFiltroUnidadeGestora
      ? unidadeSelecionada?.margem || 0
      : possuiFiltroGestora
        ? gestoraSelecionada?.margem || 0
        : 0;
    const monthlyExibido = possuiFiltroUnidadeGestora
      ? (unidadeSelecionada?.monthly || [])
      : possuiFiltroGestora
        ? (gestoraSelecionada?.monthly || [])
        : buildMonthlySeries(gestorasBase);
    const monthlyExibidoResultado = monthlyExibido.map((item: any) => ({
      ...item,
      lucroPositivo: toNum(item.lucro) >= 0 ? toNum(item.lucro) : null,
      prejuizo: toNum(item.lucro) < 0 ? toNum(item.lucro) : null,
      lucratividadePct: toNum(item.lucroPct) >= 0 ? toNum(item.lucroPct) : null,
      prejuizoPctLinha: toNum(item.lucroPct) < 0 ? toNum(item.lucroPct) : null,
    }));
    const monthOptions = getMonthOptionsFromSeries(buildMonthlySeries(gestorasBaseFull));
    const monthFilterPorGestoras = monthFilters.porGestoras || "";
    const estiloColunaTotalGestDet = {
      padding: "8px 12px" as const,
      textAlign: "right" as const,
      verticalAlign: "middle" as const,
    };
    const bordaEntreGestorasDet = `4px solid rgba(148, 163, 184, 0.55)`;
    const bordaEntreLinhasDet = `1px solid ${PALETTE.borda}`;
    const renderCelulaTotalGestDet = (
      valor: ReactNode,
      pctLinha: string | null,
      opts: { corValor: string; corPct?: string },
      borderBottom?: string,
    ) => (
      <td style={{ ...estiloColunaTotalGestDet, ...(borderBottom ? { borderBottom } : {}) }}>
        <div style={{ fontWeight: 700, color: opts.corValor, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{valor}</div>
        <div
          style={{
            height: 1,
            margin: "7px 0 5px",
            marginLeft: "auto",
            width: "72%",
            maxWidth: 120,
            background: PALETTE.borda,
            opacity: 0.45,
          }}
        />
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: opts.corPct ?? PALETTE.textoSec,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {pctLinha ?? "—"}
        </div>
      </td>
    );

    const monthMetaListGestorasDet = (() => {
      const map = new Map<string, { mes: string; mesLabel: string }>();
      for (const item of dataComparativa) {
        for (const entry of item.monthly || []) {
          if (monthFilterPorGestoras && String(entry.mes) !== monthFilterPorGestoras) continue;
          const mes = String(entry.mes || "");
          if (!mes) continue;
          const mesLabel = String(entry.mesLabel || mes);
          if (!map.has(mes)) map.set(mes, { mes, mesLabel });
        }
      }
      return Array.from(map.values()).sort((a, b) => a.mes.localeCompare(b.mes));
    })();
    const detalhamentoMensalGestorasRows: DetalhamentoGestoraRow[] = dataComparativa
      .map((item: any): DetalhamentoGestoraRow => {
        const monthCells: DetalhamentoGestoraMesCell[] = [];
        let sumLucro = 0;
        let sumReceita = 0;
        let sumDespesa = 0;
        for (const { mes, mesLabel } of monthMetaListGestorasDet) {
          const m = (item.monthly || []).find((x: any) => String(x.mes) === mes);
          const rec = m ? toNum(m.receita) : 0;
          const desp = m ? toNum(m.despesa) : 0;
          const luc = m ? toNum(m.lucro) : 0;
          const pctLucroSobreRec = rec !== 0 ? luc / rec : null;
          monthCells.push({ mesLabel, receita: rec, despesa: desp, lucro: luc, pctLucroSobreRec });
          sumLucro += luc;
          sumReceita += rec;
          sumDespesa += desp;
        }
        const pctMargem = sumReceita !== 0 ? sumLucro / sumReceita : 0;
        const pctDespSobreRec = sumReceita !== 0 ? sumDespesa / sumReceita : 0;
        return {
          nome: item.nome,
          monthCells,
          totalReceita: sumReceita,
          totalDespesa: sumDespesa,
          totalLucro: sumLucro,
          pctMargem,
          pctDespSobreRec,
        };
      })
      .filter(
        (row: DetalhamentoGestoraRow) =>
          row.totalLucro !== 0 ||
          row.totalReceita !== 0 ||
          row.totalDespesa !== 0 ||
          row.monthCells.some(
            (c: DetalhamentoGestoraMesCell) => c.receita !== 0 || c.despesa !== 0 || c.lucro !== 0,
          ),
      );

    return (
      <>
        <div style={{ marginBottom: 10, fontSize: 11, color: PALETTE.textoSec, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700 }}>
          Gestoras
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          {["Todas", ...gestorasBaseFull.map((g:any) => g.nome)].map(name => (
            <button
              key={name}
              onClick={() => {
                setFiltroGestora(name);
                setFiltroUnidadeGestora("Todas");
              }}
              style={s.badge(filtroGestora === name)}
            >
              {name}
            </button>
          ))}
        </div>

        {gestoraSelecionada && (
          <>
            <div style={{ marginBottom: 10, fontSize: 11, color: PALETTE.textoSec, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700 }}>
              Unidades
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
            {["Todas", ...unidadesDaGestora.map((u:any) => u.nome)].map(name => (
              <button
                key={name}
                onClick={() => setFiltroUnidadeGestora(name)}
                style={s.badge(filtroUnidadeGestora === name)}
              >
                {name}
              </button>
            ))}
            </div>
          </>
        )}
        {renderMonthFilter('porGestoras', monthOptions)}

        <div style={s.row}>
          <KpiCard titulo={unidadeSelecionada ? "Receita da Unidade" : gestoraSelecionada ? "Receita da Gestora" : "Receita das Gestoras"} valor={fmtK(receitaExibida)} sub={unidadeSelecionada ? `${unidadeSelecionada.nome} - ${gestoraSelecionada?.nome}` : gestoraSelecionada ? gestoraSelecionada.nome : `${gestorasBase.length} gestoras`} cor={PALETTE.azul} icon="$" />
          <KpiCard titulo={unidadeSelecionada ? "Resultado da Unidade" : gestoraSelecionada ? "Resultado da Gestora" : "Resultado das Gestoras"} valor={fmtK(lucroExibido)} sub={unidadeSelecionada || gestoraSelecionada ? fmtPct(margemExibida) + " de margem" : "Comparativo consolidado"} cor={lucroExibido >= 0 ? PALETTE.verde : PALETTE.vermelho} icon="%" />
          <KpiCard titulo={unidadeSelecionada ? "Unidade Selecionada" : gestoraSelecionada ? "Unidades da Gestora" : "Total de Unidades"} valor={unidadesExibidas} sub={unidadeSelecionada ? "Filtro ativo na gestora" : gestoraSelecionada ? "Vinculadas a gestora" : "Relacionadas as gestoras"} cor={PALETTE.laranja} icon="#" />
        </div>

        <div style={s.card}>
          <div style={s.titulo}>{unidadeSelecionada ? "EVOLUCAO MENSAL DA UNIDADE" : "EVOLUCAO MENSAL DA GESTORA"}</div>
          {monthlyExibido.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 240, color: PALETTE.textoSec, fontSize: 14 }}>
              Nao ha historico mensal disponivel para {unidadeSelecionada ? unidadeSelecionada.nome : gestoraSelecionada ? gestoraSelecionada.nome : "as gestoras"}.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={monthlyExibidoResultado} barGap={4}>
                <CartesianGrid {...CHART_THEME.grid} />
                <XAxis dataKey="mesLabel" {...CHART_THEME.axisX} />
                <YAxis yAxisId="valor" tickFormatter={fmtAxisMoney} {...CHART_THEME.axisY} />
                <YAxis yAxisId="percentual" orientation="right" domain={getPercentDomain(monthlyExibidoResultado, 'lucroPct')} tickFormatter={fmtPct} {...CHART_THEME.axisPercent} />
                {chartTooltip}
                <Legend wrapperStyle={CHART_THEME.legend} />
                <Bar yAxisId="valor" dataKey="receita" name="Receita" fill={PALETTE.azul} radius={CHART_THEME.barRadiusTop}>
                  <LabelList dataKey="receita" content={<LabelBarTopValue formatter={fmtCompactMoney} color={PALETTE.azul} />} />
                </Bar>
                <Bar yAxisId="valor" dataKey="despesa" name="Despesa" fill={PALETTE.vermelho} radius={CHART_THEME.barRadiusTop}>
                  <LabelList dataKey="despesa" content={<LabelBarTopValue formatter={fmtCompactMoney} color={PALETTE.vermelho} />} />
                </Bar>
                <Bar yAxisId="valor" dataKey="lucroPositivo" name="Lucro" fill={PALETTE.verde} radius={CHART_THEME.barRadiusTop}>
                  <LabelList dataKey="lucroPositivo" content={<LabelResultadoTopValue formatter={fmtCompactMoney} />} />
                </Bar>
                <Bar yAxisId="valor" dataKey="prejuizo" name="Prejuizo" fill={PALETTE.vermelho} radius={CHART_THEME.barRadiusTop}>
                  <LabelList dataKey="prejuizo" content={<LabelResultadoTopValue formatter={fmtCompactMoney} />} />
                </Bar>
              <Line yAxisId="percentual" type="monotone" dataKey="lucroPct" name="% Resultado" stroke={PALETTE.laranja} {...CHART_THEME.line} dot={<DotLineResultado />} activeDot={{ ...CHART_THEME.line.activeDot, fill: PALETTE.laranja }} label={<LabelLineResultadoValue formatter={fmtPctCompact} />} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={s.card}>
          <div style={s.titulo}>{unidadeSelecionada ? "DETALHAMENTO DA UNIDADE SELECIONADA" : gestoraSelecionada ? "DETALHAMENTO DAS UNIDADES DA GESTORA" : "DETALHAMENTO POR GESTORA"}</div>
          <div style={{ color: PALETTE.textoSec, fontSize: 12, marginBottom: 14 }}>
            Por mês: receita, despesas e resultado. Cada gestora fica em um bloco separado por linha grossa.
            Na linha Resultado, abaixo de cada valor mensal aparece a margem do mês (resultado ÷ receita). Em Total período,
            o total e a margem do período vêm empilhados.
          </div>
          {detalhamentoMensalGestorasRows.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 160, color: PALETTE.textoSec, fontSize: 14 }}>
              Não há histórico mensal para o filtro aplicado.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
                <thead>
                  <tr>
                    <th
                      style={{
                        color: PALETTE.textoSec,
                        fontWeight: 700,
                        padding: "10px 12px",
                        textAlign: "left",
                        borderBottom: `1px solid ${PALETTE.borda}`,
                        fontSize: 11,
                        textTransform: "uppercase",
                        letterSpacing: 0.8,
                      }}
                    >
                      {gestoraSelecionada ? "Unidade" : "Gestora"}
                    </th>
                    <th
                      style={{
                        color: PALETTE.textoSec,
                        fontWeight: 700,
                        padding: "10px 12px",
                        textAlign: "left",
                        borderBottom: `1px solid ${PALETTE.borda}`,
                        fontSize: 11,
                        textTransform: "uppercase",
                        letterSpacing: 0.8,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Linha
                    </th>
                    {monthMetaListGestorasDet.map(({ mesLabel }) => (
                      <th
                        key={mesLabel}
                        style={{
                          color: PALETTE.textoSec,
                          fontWeight: 700,
                          padding: "10px 12px",
                          textAlign: "right",
                          borderBottom: `1px solid ${PALETTE.borda}`,
                          fontSize: 11,
                          textTransform: "uppercase",
                          letterSpacing: 0.8,
                        }}
                      >
                        {mesLabel}
                      </th>
                    ))}
                    <th
                      style={{
                        color: PALETTE.textoSec,
                        fontWeight: 700,
                        padding: "10px 12px",
                        textAlign: "right",
                        borderBottom: `1px solid ${PALETTE.borda}`,
                        fontSize: 11,
                        textTransform: "uppercase",
                        letterSpacing: 0.8,
                      }}
                    >
                      Total período
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {detalhamentoMensalGestorasRows.map((row) => (
                    <Fragment key={row.nome}>
                      <tr>
                        <td
                          rowSpan={3}
                          style={{
                            padding: "10px 12px",
                            fontWeight: 600,
                            color: PALETTE.texto,
                            verticalAlign: "middle",
                            borderBottom: bordaEntreGestorasDet,
                          }}
                        >
                          {row.nome}
                        </td>
                        <td
                          style={{
                            padding: "8px 12px",
                            fontWeight: 600,
                            color: PALETTE.textoSec,
                            fontSize: 12,
                            whiteSpace: "nowrap",
                            borderBottom: bordaEntreLinhasDet,
                          }}
                        >
                          Receita
                        </td>
                        {row.monthCells.map((cell) => (
                          <td
                            key={`${row.nome}-rec-${cell.mesLabel}`}
                            style={{
                              padding: "8px 12px",
                              textAlign: "right",
                              color: PALETTE.azul,
                              fontWeight: 600,
                              borderBottom: bordaEntreLinhasDet,
                            }}
                          >
                            {fmt(toNum(cell.receita))}
                          </td>
                        ))}
                        {renderCelulaTotalGestDet(fmt(toNum(row.totalReceita)), null, { corValor: PALETTE.azul }, bordaEntreLinhasDet)}
                      </tr>
                      <tr>
                        <td
                          style={{
                            padding: "8px 12px",
                            fontWeight: 600,
                            color: PALETTE.textoSec,
                            fontSize: 12,
                            whiteSpace: "nowrap",
                            borderBottom: bordaEntreLinhasDet,
                          }}
                        >
                          Despesas
                        </td>
                        {row.monthCells.map((cell) => (
                          <td
                            key={`${row.nome}-desp-${cell.mesLabel}`}
                            style={{
                              padding: "8px 12px",
                              textAlign: "right",
                              color: PALETTE.vermelho,
                              fontWeight: 600,
                              borderBottom: bordaEntreLinhasDet,
                            }}
                          >
                            {fmt(toNum(cell.despesa))}
                          </td>
                        ))}
                        {renderCelulaTotalGestDet(
                          fmt(toNum(row.totalDespesa)),
                          `${(row.pctDespSobreRec * 100).toFixed(2)}% da receita`,
                          {
                            corValor: PALETTE.vermelho,
                            corPct: row.pctDespSobreRec > 1 ? PALETTE.vermelho : PALETTE.textoSec,
                          },
                          bordaEntreLinhasDet,
                        )}
                      </tr>
                      <tr>
                        <td
                          style={{
                            padding: "8px 12px",
                            fontWeight: 600,
                            color: PALETTE.textoSec,
                            fontSize: 12,
                            whiteSpace: "nowrap",
                            borderBottom: bordaEntreGestorasDet,
                          }}
                        >
                          Resultado
                        </td>
                        {row.monthCells.map((cell) => {
                          const pctMes = cell.pctLucroSobreRec;
                          const pctNeg = pctMes !== null && pctMes < 0;
                          return (
                            <td
                              key={`${row.nome}-luc-${cell.mesLabel}`}
                              style={{
                                padding: "8px 12px",
                                textAlign: "right",
                                verticalAlign: "top",
                                borderBottom: bordaEntreGestorasDet,
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: 600,
                                  color: cell.lucro < 0 ? PALETTE.vermelho : PALETTE.verde,
                                  fontVariantNumeric: "tabular-nums",
                                }}
                              >
                                {fmt(toNum(cell.lucro))}
                              </div>
                              <div
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  marginTop: 5,
                                  color: pctNeg ? PALETTE.vermelho : PALETTE.textoSec,
                                  fontVariantNumeric: "tabular-nums",
                                }}
                              >
                                {pctMes === null ? "—" : `${(pctMes * 100).toFixed(2)}%`}
                              </div>
                            </td>
                          );
                        })}
                        {renderCelulaTotalGestDet(
                          fmt(toNum(row.totalLucro)),
                          `${(row.pctMargem * 100).toFixed(2)}% margem`,
                          {
                            corValor: row.totalLucro < 0 ? PALETTE.vermelho : PALETTE.verde,
                            corPct: row.pctMargem < 0 ? PALETTE.vermelho : PALETTE.textoSec,
                          },
                          bordaEntreGestorasDet,
                        )}
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
    );
  };

  const AbaCustos = () => {
    const top5 = categoriasDespesa.slice(0, 5);
    const outros = categoriasDespesa.slice(5).reduce((a: number, b: any) => a + b.valor, 0);
    const pieData = top5.length ? [...top5] : [];
    if (outros > 0) pieData.push({ nome: "Outros", valor: outros });
    const CORES_PIE = [PALETTE.vermelho, PALETTE.laranja, PALETTE.azul, PALETTE.roxo, PALETTE.rosa, PALETTE.cinza];
    const pieTotalValor = pieData.reduce((acc: number, d: any) => acc + toNum(d.valor), 0);
    const top5CategoriasMaiores = [...categoriasDespesa].sort((a: any, b: any) => b.valor - a.valor).slice(0, 5);
    const custosMensais = meses.map((m: any) => ({
      ...m,
      custoPct: m.receita > 0 ? m.despesa / m.receita : 0,
    }));
    const monthFilterCustos = monthFilters.custos || '';
    const unitsCategoriasTabela = ordenarUnidadesParaExibicao(
      unidadesFull.filter((u: any) => !ehUnidadeTotal(String(u.nome || ''))),
    );
    const monthMetaListCustos = (() => {
      const map = new Map<string, { mes: string; mesLabel: string }>();
      for (const u of unitsCategoriasTabela) {
        for (const def of u.expenseDefinitionsMonthly || []) {
          for (const entry of def.monthly || []) {
            if (monthFilterCustos && String(entry.mes) !== monthFilterCustos) continue;
            const mes = String(entry.mes || '');
            if (!mes) continue;
            const mesLabel = String(entry.mesLabel || mes);
            if (!map.has(mes)) map.set(mes, { mes, mesLabel });
          }
        }
      }
      return Array.from(map.values()).sort((a, b) => a.mes.localeCompare(b.mes));
    })();
    const catMesValorCustos = new Map<string, Map<string, number>>();
    const bumpCatMes = (nome: string, mes: string, valor: number) => {
      if (!catMesValorCustos.has(nome)) catMesValorCustos.set(nome, new Map());
      const inner = catMesValorCustos.get(nome)!;
      inner.set(mes, (inner.get(mes) ?? 0) + valor);
    };
    for (const u of unitsCategoriasTabela) {
      for (const def of u.expenseDefinitionsMonthly || []) {
        const nome = String(def.nome || 'Outros');
        for (const entry of def.monthly || []) {
          if (monthFilterCustos && String(entry.mes) !== monthFilterCustos) continue;
          const mes = String(entry.mes || '');
          if (!mes) continue;
          bumpCatMes(nome, mes, toNum(entry.valor));
        }
      }
    }
    const receitaPorMesCustos = new Map<string, number>();
    for (const { mes } of monthMetaListCustos) {
      let r = 0;
      for (const u of unitsCategoriasTabela) {
        const m = (u.monthly || []).find((x: any) => String(x.mes) === mes);
        r += m ? toNum(m.receita) : 0;
      }
      receitaPorMesCustos.set(mes, r);
    }
    const receitaPeriodoCustos = monthMetaListCustos.reduce(
      (acc, { mes }) => acc + (receitaPorMesCustos.get(mes) ?? 0),
      0,
    );
    const comparativoMensalCategoriasRows = Array.from(catMesValorCustos.entries())
      .map(([nome, mesMap]) => {
        const cellByLabel: Record<string, number> = {};
        let resultado = 0;
        for (const { mes, mesLabel } of monthMetaListCustos) {
          const v = mesMap.get(mes) ?? 0;
          cellByLabel[mesLabel] = v;
          resultado += v;
        }
        const percentual = receitaPeriodoCustos > 0 ? resultado / receitaPeriodoCustos : 0;
        return { nome, cellByLabel, resultado, percentual };
      })
      .filter(
        (row) =>
          row.resultado !== 0 ||
          monthMetaListCustos.some(({ mesLabel }) => toNum(row.cellByLabel[mesLabel]) !== 0),
      )
      .sort((a, b) => b.resultado - a.resultado);
    return (
      <>
        {renderMonthFilter('custos', getMonthOptionsFromSeries(mesesFull))}
        <div style={s.row}>
          <KpiCard titulo="Total Despesas" valor={fmtK(totalDespesa)} cor={PALETTE.vermelho} icon="📉" />
          <KpiCard titulo="FOPAG (Folha)" valor={fmtK(totalFopag)} sub={fmtPct(totalReceita > 0 ? totalFopag / totalReceita : 0) + " sobre faturamento"} cor={PALETTE.laranja} icon="💼" />
          <KpiCard titulo="Custo Operacional" valor={fmtK(totalDespesa - totalFopag)} sub={fmtPct(totalDespesa > 0 ? (totalDespesa - totalFopag) / totalDespesa : 0) + " das despesas"} cor={PALETTE.roxo} icon="⚙️" />
          <KpiCard titulo="FOPAG/Funcionário" valor={fmtK(totalFunc > 0 ? totalFopag / totalFunc : 0)} sub="média por colaborador" cor={PALETTE.azul} icon="👤" />
        </div>

        <div style={s.card}>
          <div style={s.titulo}>Evolução Mensal de Custos</div>
          {custosMensais.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 240, color: PALETTE.textoSec, fontSize: 14 }}>
              Não há histórico mensal de custos para o filtro aplicado.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={custosMensais} barGap={4}>
                <CartesianGrid {...CHART_THEME.grid} />
                <XAxis dataKey="mesLabel" {...CHART_THEME.axisX} />
                <YAxis yAxisId="valor" tickFormatter={fmtAxisMoney} {...CHART_THEME.axisY} />
                <YAxis yAxisId="percentual" orientation="right" domain={getPercentDomain(custosMensais, 'custoPct')} tickFormatter={fmtPct} {...CHART_THEME.axisPercent} />
                {chartTooltip}
                <Legend wrapperStyle={CHART_THEME.legend} />
                <Bar yAxisId="valor" dataKey="despesa" name="Despesa" fill={PALETTE.vermelho} radius={CHART_THEME.barRadiusTop}>
                  <LabelList dataKey="despesa" content={<LabelBarTopValue formatter={fmtCompactMoney} color={PALETTE.vermelho} />} />
                </Bar>
                <Line
                  yAxisId="percentual"
                  type="monotone"
                  dataKey="custoPct"
                  name="% Custo/Receita"
                  stroke={PALETTE.verdeEsc}
                  {...CHART_THEME.line}
                  dot={{ ...CHART_THEME.line.dot, fill: PALETTE.verdeEsc }}
                  activeDot={{ ...CHART_THEME.line.activeDot }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))",
            gap: 16,
            alignItems: "stretch",
          }}
        >
          <div style={{ ...s.card, minHeight: 480 }}>
            <div style={s.titulo}>Composição das Despesas (Top 5 + Outros)</div>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: PALETTE.textoSec, lineHeight: 1.45 }}>
              Cada fatia mostra categoria, valor em R$ (completo) e % do total do gráfico ({fmt(pieTotalValor)}).
            </p>
            {pieData.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 360, color: PALETTE.textoSec, fontSize: 14 }}>
                Sem dados de despesas por categoria.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={420}>
                <PieChart margin={{ top: 28, right: 150, bottom: 28, left: 150 }}>
                  <Pie
                    data={pieData}
                    dataKey="valor"
                    nameKey="nome"
                    cx="50%"
                    cy="50%"
                    innerRadius={0}
                    outerRadius={138}
                    paddingAngle={1}
                    labelLine={false}
                    label={renderPieCompositionDespesasLabel}
                  >
                    {pieData.map((_: any, i: number) => (
                      <Cell key={i} fill={CORES_PIE[i % CORES_PIE.length]} stroke={PALETTE.fundo} strokeWidth={1} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v, name, item) => {
                      const val = toNum(v);
                      const pct = pieTotalValor > 0 ? val / pieTotalValor : 0;
                      const fromPayload = (item as { payload?: { nome?: string } } | undefined)?.payload?.nome;
                      const fromName =
                        typeof name === "string" || typeof name === "number" ? String(name) : "";
                      const label = fromPayload || fromName || "Despesa";
                      return [`${fmt(val)} (${(pct * 100).toFixed(2)}%)`, label];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div style={{ ...s.card, minHeight: 480 }}>
            <div style={s.titulo}>Top 5 — maiores despesas</div>
            <p style={{ margin: "0 0 14px", fontSize: 12, color: PALETTE.textoSec, lineHeight: 1.45 }}>
              Cinco categorias com maior valor absoluto (antes de agrupar o restante em &apos;Outros&apos; no gráfico).
            </p>
            {top5CategoriasMaiores.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: PALETTE.textoSec, fontSize: 14 }}>
                Sem categorias para listar.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {top5CategoriasMaiores.map((c: any, i: number) => {
                  const cor = CORES_PIE[i % CORES_PIE.length];
                  const pctDoTotal = totalDespesa > 0 ? c.valor / totalDespesa : 0;
                  return (
                    <div
                      key={c.nome}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 14,
                        padding: "14px 16px",
                        borderRadius: 12,
                        background: `${cor}14`,
                        border: `1px solid ${cor}40`,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: PALETTE.textoSec, fontWeight: 700, letterSpacing: 0.6 }}>#{i + 1}</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: PALETTE.texto, marginTop: 4, lineHeight: 1.25 }}>{c.nome}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: cor, lineHeight: 1.3 }}>{fmt(c.valor)}</div>
                        <div style={{ fontSize: 12, color: PALETTE.textoSec, marginTop: 4, fontWeight: 600 }}>
                          {fmtPct(pctDoTotal)} do total de despesas
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div style={s.card}>
          <div style={s.titulo}>Tabela Completa de Categorias</div>
          <div style={{ color: PALETTE.textoSec, fontSize: 12, marginBottom: 14 }}>
            Despesa por categoria em cada mês do período filtrado; percentual = total da categoria ÷ receita total
            consolidada no período.
          </div>
          {comparativoMensalCategoriasRows.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 160, color: PALETTE.textoSec, fontSize: 14 }}>
              Não há histórico mensal por categoria para o filtro aplicado.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 520 }}>
                <thead>
                  <tr>
                    <th
                      style={{
                        color: PALETTE.textoSec,
                        fontWeight: 700,
                        padding: "10px 12px",
                        textAlign: "left",
                        borderBottom: `1px solid ${PALETTE.borda}`,
                        fontSize: 11,
                        textTransform: "uppercase",
                        letterSpacing: 0.8,
                      }}
                    >
                      Categoria
                    </th>
                    {monthMetaListCustos.map(({ mesLabel }) => (
                      <th
                        key={mesLabel}
                        style={{
                          color: PALETTE.textoSec,
                          fontWeight: 700,
                          padding: "10px 12px",
                          textAlign: "right",
                          borderBottom: `1px solid ${PALETTE.borda}`,
                          fontSize: 11,
                          textTransform: "uppercase",
                          letterSpacing: 0.8,
                        }}
                      >
                        {mesLabel}
                      </th>
                    ))}
                    <th
                      style={{
                        color: PALETTE.textoSec,
                        fontWeight: 700,
                        padding: "10px 12px",
                        textAlign: "right",
                        borderBottom: `1px solid ${PALETTE.borda}`,
                        fontSize: 11,
                        textTransform: "uppercase",
                        letterSpacing: 0.8,
                      }}
                    >
                      Resultado
                    </th>
                    <th
                      style={{
                        color: PALETTE.textoSec,
                        fontWeight: 700,
                        padding: "10px 12px",
                        textAlign: "right",
                        borderBottom: `1px solid ${PALETTE.borda}`,
                        fontSize: 11,
                        textTransform: "uppercase",
                        letterSpacing: 0.8,
                      }}
                    >
                      Percentual
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comparativoMensalCategoriasRows.map((row) => (
                    <tr key={row.nome} style={{ borderBottom: `1px solid ${PALETTE.borda}33` }}>
                      <td style={{ padding: "10px 12px", fontWeight: 600, color: PALETTE.texto }}>{row.nome}</td>
                      {monthMetaListCustos.map(({ mesLabel }) => {
                        const v = row.cellByLabel[mesLabel] ?? 0;
                        return (
                          <td
                            key={`${row.nome}-${mesLabel}`}
                            style={{
                              padding: "10px 12px",
                              textAlign: "right",
                              color: v < 0 ? PALETTE.vermelho : PALETTE.texto,
                              fontWeight: 600,
                            }}
                          >
                            {fmt(toNum(v))}
                          </td>
                        );
                      })}
                      <td
                        style={{
                          padding: "10px 12px",
                          textAlign: "right",
                          color: row.resultado < 0 ? PALETTE.vermelho : PALETTE.texto,
                          fontWeight: 700,
                        }}
                      >
                        {fmt(toNum(row.resultado))}
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          textAlign: "right",
                          color: row.percentual < 0 ? PALETTE.vermelho : PALETTE.texto,
                          fontWeight: 700,
                        }}
                      >
                        {(row.percentual * 100).toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
    );
  };
  // â”€â”€ ABA: PESSOAS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const AbaPessoas = () => {
    const headcountMensalSeries = meses
      .map((item: any) => ({
        mes: item.mes,
        mesLabel: item.mesLabel,
        funcionarios: toNum(item.funcionarios),
      }))
      .filter((item: any) => item.funcionarios > 0);
    const receitaMensalMap = new Map(
      buildMonthlySeries(unidades).map((item: any) => [String(item.mes || ''), toNum(item.receita)]),
    );
    const fopagMensalSeries = buildFopagMonthlySeries(unidades).map((item: any) => {
      const receita = receitaMensalMap.get(String(item.mes || '')) ?? 0;
      return {
        ...item,
        receita,
        fopagPct: receita > 0 ? toNum(item.valor) / receita : 0,
      };
    });
    return (
    <>
      {renderMonthFilter('pessoas', getMonthOptionsFromSeries(mesesFull))}

      <div style={s.card}>
        <div style={s.titulo}>EVOLUTIVO MENSAL DO FOPAG</div>
        {fopagMensalSeries.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 220, color: PALETTE.textoSec, fontSize: 14 }}>
            Nao ha historico mensal de FOPAG para o filtro aplicado.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={fopagMensalSeries} margin={{ top: 22, right: 10, bottom: 6, left: 0 }}>
              <CartesianGrid {...CHART_THEME.gridVertical} />
              <XAxis dataKey="mesLabel" {...CHART_THEME.axisX} />
              <YAxis domain={getMoneyDomain(fopagMensalSeries, ['valor'])} tickFormatter={fmtAxisMoney} {...CHART_THEME.axisY} />
              <YAxis yAxisId="percentual" orientation="right" domain={getPercentDomain(fopagMensalSeries, 'fopagPct')} tickFormatter={fmtPct} {...CHART_THEME.axisPercent} />
              {chartTooltip}
              <Bar dataKey="valor" name="FOPAG" fill={PALETTE.laranja} radius={CHART_THEME.barRadiusTop}>
                {fopagMensalSeries.map((_: any, i: number) => <Cell key={i} fill={CORES_UNIDADES[i % CORES_UNIDADES.length]} />)}
                <LabelList dataKey="valor" content={<LabelBarTopValue formatter={fmtCompactMoney} color={PALETTE.texto} />} />
              </Bar>
              <Line yAxisId="percentual" type="monotone" dataKey="fopagPct" name="FOPAG %" stroke={PALETTE.laranja} {...CHART_THEME.line} dot={{ ...CHART_THEME.line.dot, fill: PALETTE.laranja }} activeDot={{ ...CHART_THEME.line.activeDot }} label={<LabelLineValue formatter={fmtPctCompact} color={PALETTE.laranja} />} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div style={s.card}>
        <div style={s.titulo}>EVOLUTIVO MENSAL DO HEADCOUNT</div>
        {headcountMensalSeries.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 220, color: PALETTE.textoSec, fontSize: 14 }}>
            Nao ha historico mensal de headcount para o filtro aplicado.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={headcountMensalSeries} margin={{ top: 22, right: 10, bottom: 6, left: 0 }}>
              <CartesianGrid {...CHART_THEME.gridVertical} />
              <XAxis dataKey="mesLabel" {...CHART_THEME.axisX} />
              <YAxis {...CHART_THEME.axisY} />
              {chartTooltip}
              <Bar dataKey="funcionarios" name="Funcionários" fill={PALETTE.azul} radius={CHART_THEME.barRadiusTop}>
                {headcountMensalSeries.map((_: any, i: number) => <Cell key={i} fill={CORES_UNIDADES[i % CORES_UNIDADES.length]} />)}
                <LabelList dataKey="funcionarios" content={<LabelBarTopValue formatter={(v: number) => `${Math.round(v)}`} color={PALETTE.texto} />} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div style={s.card}>
        <div style={s.titulo}>TABELA DE PESSOAS</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: "600px" }}>
            <thead>
              <tr>
                {["Unidade","Funcionários","FOPAG","FOPAG/Funcionário","FOPAG %","Margem"].map(h => (
                  <th key={h} style={{ color: PALETTE.textoSec, fontWeight: 700, padding: "8px 12px", textAlign: "left", borderBottom: `1px solid ${PALETTE.borda}`, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {unidades.map((u: any, i: number) => (
                <tr key={i} style={{ borderBottom: `1px solid ${PALETTE.borda}20`, cursor: "default" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 600 }}>{u.nome}</td>
                  <td style={{ padding: "10px 12px" }}>{u.func}</td>
                  <td style={{ padding: "10px 12px", color: PALETTE.laranja }}>{fmtK(u.fopag)}</td>
                  <td style={{ padding: "10px 12px" }}>{u.func > 0 ? fmtK(u.fopag / u.func) : "-"}</td>
                  <td style={{ padding: "10px 12px", color: PALETTE.vermelho }}>{u.receita > 0 ? fmtPct(u.fopag / u.receita) : "-"}</td>
                  <td style={{ padding: "10px 12px", color: u.margem >= 0 ? PALETTE.verde : PALETTE.vermelho, fontWeight: 700 }}>{fmtPct(u.margem)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
    );
  };

  const AbaEvolutivos = () => {
    const monthOptions = getMonthOptionsFromSeries(buildMonthlySeries(unidadesFull));
    const monthFilterPorUnidade = monthFilters.porUnidade || '';
    const possuiFiltroEvolutivo = filtroEvolutivoUnidade !== "Todas" && !!filtroEvolutivoUnidade;
    const unidadeEvolutiva = possuiFiltroEvolutivo
      ? unidades.find((u: any) => u.nome === filtroEvolutivoUnidade) || null
      : null;
    const unidadeEvolutivaFull = possuiFiltroEvolutivo
      ? unidadesFull.find((u: any) => u.nome === filtroEvolutivoUnidade) || null
      : null;
    const unidadesEvolutivasAtual = possuiFiltroEvolutivo
      ? (unidadeEvolutiva ? [unidadeEvolutiva] : [])
      : unidades;
    const unidadesEvolutivasCompletas = possuiFiltroEvolutivo
      ? (unidadeEvolutivaFull ? [unidadeEvolutivaFull] : [])
      : unidadesFull;
    const despesasEvolutivas = possuiFiltroEvolutivo
      ? unidadeEvolutiva?.expenseDefinitions || []
      : mergeExpenseDefinitions(unidades);
    const comparativoResultadoFiltrado = unidadesEvolutivasAtual
      .map((u: any) => ({
        nome: u.nome,
        receita: toNum(u.receita),
        despesa: toNum(u.despesa),
        resultado: toNum(u.lucro),
        margem: toNum(u.margem),
      }))
      .sort((a: any, b: any) => b.resultado - a.resultado);

    const unitsEvolutivosChart = ordenarUnidadesParaExibicao(
      unidadesEvolutivasCompletas.filter((u: any) => !ehUnidadeTotal(String(u.nome || ''))),
    );
    const monthMetaListEvolutivos = (() => {
      const map = new Map<string, { mes: string; mesLabel: string }>();
      for (const u of unitsEvolutivosChart) {
        for (const entry of u.monthly || []) {
          if (monthFilterPorUnidade && String(entry.mes) !== monthFilterPorUnidade) continue;
          const mes = String(entry.mes || '');
          if (!mes) continue;
          const mesLabel = String(entry.mesLabel || mes);
          if (!map.has(mes)) map.set(mes, { mes, mesLabel });
        }
      }
      return Array.from(map.values()).sort((a, b) => a.mes.localeCompare(b.mes));
    })();
    const despesaLineDataEvolutivos = monthMetaListEvolutivos.map(({ mes, mesLabel }) => {
      const row: Record<string, string | number> = { mesLabel };
      for (const u of unitsEvolutivosChart) {
        const m = (u.monthly || []).find((x: any) => String(x.mes) === mes);
        row[u.nome] = m ? toNum(m.despesa) : 0;
      }
      return row;
    });
    const comparativoMensalUnidadesRows = unitsEvolutivosChart.map((u: any) => {
      const cellByLabel: Record<string, number> = {};
      let sumLucro = 0;
      let sumReceita = 0;
      for (const { mes, mesLabel } of monthMetaListEvolutivos) {
        const m = (u.monthly || []).find((x: any) => String(x.mes) === mes);
        const luc = m ? toNum(m.lucro) : 0;
        const rec = m ? toNum(m.receita) : 0;
        cellByLabel[mesLabel] = luc;
        sumLucro += luc;
        sumReceita += rec;
      }
      const percentual = sumReceita !== 0 ? sumLucro / sumReceita : 0;
      return { nome: u.nome, cellByLabel, resultado: sumLucro, percentual };
    });

    const unidadesComparativoMensalDespesas = unidadesEvolutivasCompletas
      .filter((u: any) => !ehUnidadeTotal(String(u.nome || '')))
      .map((u: any) => {
        const categorias = (u.expenseDefinitionsMonthly || [])
          .map((item: any) => ({
            nome: item.nome,
            monthly: (item.monthly || []).filter(
              (entry: any) => !monthFilterPorUnidade || entry.mes === monthFilterPorUnidade,
            ),
            total: (item.monthly || [])
              .filter((entry: any) => !monthFilterPorUnidade || entry.mes === monthFilterPorUnidade)
              .reduce((acc: number, entry: any) => acc + toNum(entry.valor), 0),
          }))
          .filter((item: any) => item.monthly.length > 0 && item.total > 0)
          .sort((a: any, b: any) => b.total - a.total);

        const mesPorOrdem = new Map<string, string>();
        for (const cat of categorias) {
          for (const entry of cat.monthly || []) {
            const mes = String(entry.mes || "");
            if (!mes) continue;
            mesPorOrdem.set(mes, String(entry.mesLabel || entry.mes));
          }
        }
        const meses = Array.from(mesPorOrdem.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([, mesLabel]) => mesLabel);

        const receitaByMesLabel = new Map(
          (u.monthly || [])
            .filter((entry: any) => !monthFilterPorUnidade || entry.mes === monthFilterPorUnidade)
            .map((entry: any) => [String(entry.mesLabel || entry.mes), toNum(entry.receita)]),
        );

        const monthlyRows = meses.map((mesLabel: string) => ({
          mesLabel,
          receita: receitaByMesLabel.get(mesLabel) ?? 0,
          ...Object.fromEntries(
            categorias.map((categoria: any) => {
              const monthEntry = categoria.monthly.find(
                (entry: any) => String(entry.mesLabel || entry.mes) === mesLabel,
              );
              return [categoria.nome, toNum(monthEntry?.valor)];
            }),
          ),
        }));

        return {
          nome: u.nome,
          categorias: categorias.map((item: any) => item.nome),
          monthlyRows,
        };
      })
      .filter((u: any) => u.categorias.length > 0 && u.monthlyRows.length > 0);

    return (
    <>
      {renderMonthFilter('porUnidade', monthOptions)}

      <div style={{ marginBottom: 10, fontSize: 11, color: PALETTE.textoSec, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700 }}>
        Unidade
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {["Todas", ...unidadesFull.map((u:any) => u.nome)].map(name => (
          <button
            key={name}
            onClick={() => setFiltroEvolutivoUnidade(name)}
            style={s.badge(filtroEvolutivoUnidade === name)}
          >
            {name}
          </button>
        ))}
      </div>

      <div style={s.row}>
        <KpiCard titulo="Unidades Comparadas" valor={comparativoResultadoFiltrado.length} sub={possuiFiltroEvolutivo ? "Leitura focada na unidade selecionada" : "Comparativo consolidado"} cor={PALETTE.azul} icon="#" />
        <KpiCard titulo="Receita Total" valor={fmtK(comparativoResultadoFiltrado.reduce((acc: number, item: any) => acc + item.receita, 0))} sub="Somatorio das receitas filtradas" cor={PALETTE.verde} icon="$" />
        <KpiCard titulo="Despesa Analisada" valor={fmtK(despesasEvolutivas.reduce((acc: number, item: any) => acc + toNum(item.valor), 0))} sub={possuiFiltroEvolutivo ? `Definicoes de ${filtroEvolutivoUnidade}` : "Definicoes combinadas das unidades"} cor={PALETTE.vermelho} icon="-" />
        <KpiCard titulo="Resultado Consolidado" valor={fmtK(comparativoResultadoFiltrado.reduce((acc: number, item: any) => acc + item.resultado, 0))} sub="Somatorio das unidades filtradas" cor={comparativoResultadoFiltrado.reduce((acc: number, item: any) => acc + item.resultado, 0) >= 0 ? PALETTE.verde : PALETTE.vermelho} icon="+/-" />
      </div>

      <div style={s.card}>
        <div style={s.titulo}>EVOLUÇÃO MENSAL DAS UNIDADES</div>
        <div style={{ color: PALETTE.textoSec, fontSize: 12, marginBottom: 14 }}>
          Despesa total mensal por unidade para o filtro selecionado
        </div>
        {despesaLineDataEvolutivos.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 220, color: PALETTE.textoSec, fontSize: 14 }}>
            Não há histórico mensal de despesas para o filtro aplicado.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={420}>
            <LineChart data={despesaLineDataEvolutivos} margin={{ top: 12, right: 20, bottom: 8, left: 4 }}>
              <CartesianGrid {...CHART_THEME.gridVertical} />
              <XAxis dataKey="mesLabel" {...CHART_THEME.axisX} />
              <YAxis tickFormatter={fmtAxisMoney} domain={getMoneyDomain(despesaLineDataEvolutivos, unitsEvolutivosChart.map((u: any) => u.nome))} {...CHART_THEME.axisY} />
              {chartTooltip}
              <Legend wrapperStyle={{ ...CHART_THEME.legend, fontSize: 11 }} />
              {unitsEvolutivosChart.map((u: any, i: number) => (
                <Line
                  key={u.nome}
                  type="monotone"
                  dataKey={u.nome}
                  name={u.nome}
                  stroke={CORES_UNIDADES[i % CORES_UNIDADES.length]}
                  strokeWidth={2}
                  dot={{ r: 4, fill: CORES_UNIDADES[i % CORES_UNIDADES.length] }}
                  activeDot={{ r: 6 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div style={s.card}>
        <div style={s.titulo}>COMPARATIVO MENSAL DAS UNIDADES</div>
        <div style={{ color: PALETTE.textoSec, fontSize: 12, marginBottom: 14 }}>
          Resultado por mês no período filtrado; percentual = resultado ÷ receita no período.
        </div>
        {comparativoMensalUnidadesRows.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 160, color: PALETTE.textoSec, fontSize: 14 }}>
            Não há linhas para exibir.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 520 }}>
              <thead>
                <tr>
                  <th style={{ color: PALETTE.textoSec, fontWeight: 700, padding: "10px 12px", textAlign: "left", borderBottom: `1px solid ${PALETTE.borda}`, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 }}>Unidade</th>
                  {monthMetaListEvolutivos.map(({ mesLabel }) => (
                    <th key={mesLabel} style={{ color: PALETTE.textoSec, fontWeight: 700, padding: "10px 12px", textAlign: "right", borderBottom: `1px solid ${PALETTE.borda}`, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 }}>{mesLabel}</th>
                  ))}
                  <th style={{ color: PALETTE.textoSec, fontWeight: 700, padding: "10px 12px", textAlign: "right", borderBottom: `1px solid ${PALETTE.borda}`, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 }}>Resultado</th>
                  <th style={{ color: PALETTE.textoSec, fontWeight: 700, padding: "10px 12px", textAlign: "right", borderBottom: `1px solid ${PALETTE.borda}`, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 }}>Percentual</th>
                </tr>
              </thead>
              <tbody>
                {comparativoMensalUnidadesRows.map((row) => (
                  <tr key={row.nome} style={{ borderBottom: `1px solid ${PALETTE.borda}33` }}>
                    <td style={{ padding: "10px 12px", fontWeight: 600, color: PALETTE.texto }}>{row.nome}</td>
                    {monthMetaListEvolutivos.map(({ mesLabel }) => {
                      const v = row.cellByLabel[mesLabel] ?? 0;
                      return (
                        <td key={`${row.nome}-${mesLabel}`} style={{ padding: "10px 12px", textAlign: "right", color: v < 0 ? PALETTE.vermelho : PALETTE.texto, fontWeight: 600 }}>
                          {fmt(toNum(v))}
                        </td>
                      );
                    })}
                    <td style={{ padding: "10px 12px", textAlign: "right", color: row.resultado < 0 ? PALETTE.vermelho : PALETTE.texto, fontWeight: 700 }}>
                      {fmt(toNum(row.resultado))}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: row.percentual < 0 ? PALETTE.vermelho : PALETTE.texto, fontWeight: 700 }}>
                      {(row.percentual * 100).toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={s.card}>
        <div style={s.titulo}>DESPESAS DA UNIDADE POR MÊS</div>
        <div style={{ color: PALETTE.textoSec, fontSize: 12, marginBottom: 14 }}>
          Cada unidade compara suas categorias de despesa ao longo dos meses disponíveis.
        </div>
        {unidadesComparativoMensalDespesas.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 220,
              color: PALETTE.textoSec,
              fontSize: 14,
            }}
          >
            Não há histórico mensal de despesas por categoria para o filtro aplicado.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 18 }}>
            {unidadesComparativoMensalDespesas.map((unit: any) => (
              <div key={`${unit.nome}-mensal`} style={{ borderTop: `1px solid ${PALETTE.borda}`, paddingTop: 18 }}>
                <div
                  style={{
                    color: PALETTE.texto,
                    fontSize: 18,
                    fontWeight: 800,
                    letterSpacing: -0.2,
                    marginBottom: 12,
                  }}
                >
                  {unit.nome}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 12,
                    marginBottom: 14,
                  }}
                >
                  {unit.monthlyRows.map((row: any) => {
                    const entries = unit.categorias
                      .map((categoria: string) => ({
                        categoria,
                        valor: toNum(row[categoria]),
                        pctFaturamento: toNum(row.receita) > 0 ? toNum(row[categoria]) / toNum(row.receita) : 0,
                      }))
                      .filter((item: any) => item.valor > 0)
                      .sort((a: any, b: any) => b.valor - a.valor);
                    const totalMes = entries.reduce((acc: number, item: any) => acc + item.valor, 0);
                    const totalMesPct = toNum(row.receita) > 0 ? totalMes / toNum(row.receita) : 0;
                    const principal = entries[0];

                    return (
                      <div
                        key={`${unit.nome}-${row.mesLabel}-resumo`}
                        style={{
                          background: PALETTE.painel,
                          border: `1px solid ${PALETTE.borda}`,
                          borderRadius: 12,
                          padding: "12px 14px",
                        }}
                      >
                        <div
                          style={{
                            color: PALETTE.textoSec,
                            fontSize: 11,
                            textTransform: "uppercase",
                            letterSpacing: 0.8,
                            fontWeight: 700,
                            marginBottom: 6,
                          }}
                        >
                          {row.mesLabel}
                        </div>
                        <div
                          style={{
                            color: PALETTE.texto,
                            fontSize: 22,
                            fontWeight: 800,
                            letterSpacing: -0.4,
                            marginBottom: 6,
                          }}
                        >
                          {fmtK(totalMes)}
                          <span
                            style={{
                              color: PALETTE.textoSec,
                              fontSize: 12,
                              fontWeight: 700,
                              marginLeft: 8,
                            }}
                          >
                            {fmtPct(totalMesPct)}
                          </span>
                        </div>
                        <div style={{ color: PALETTE.textoSec, fontSize: 12, marginBottom: 8 }}>
                          {principal ? `Maior categoria: ${principal.categoria}` : "Sem despesas no mês"}
                        </div>
                        {principal ? (
                          <div style={{ color: PALETTE.texto, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                            {fmtK(principal.valor)}
                            <span style={{ color: PALETTE.textoSec, marginLeft: 8 }}>
                              {fmtPct(principal.pctFaturamento)}
                            </span>
                          </div>
                        ) : null}
                        {entries.length > 0 ? (
                          <div style={{ display: "grid", gap: 6 }}>
                            {entries.map((item: any) => (
                              <div
                                key={`${unit.nome}-${row.mesLabel}-${item.categoria}`}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 10,
                                  fontSize: 12,
                                }}
                              >
                                <span style={{ color: PALETTE.textoSec }}>{item.categoria}</span>
                                <span style={{ color: PALETTE.texto, fontWeight: 700, whiteSpace: "nowrap" }}>
                                  {fmtK(item.valor)}
                                  <span style={{ color: PALETTE.textoSec, marginLeft: 8 }}>
                                    {fmtPct(item.pctFaturamento)}
                                  </span>
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
    );
  };

  const AbaDados = () => {
    const dashboards = dataEntryContext?.dashboards || [];
    const currentDashboard =
      dashboards.find((dashboard: any) => dashboard.id === activeDashboardId) ||
      dashboards[0] ||
      null;
    const units = currentDashboard?.units || [];
    const currentUnit =
      units.find((unit: any) => unit.id === dataEntryUnitId) ||
      units[0] ||
      null;
    const currentTemplate = dataEntryMonthly?.template || dataEntryContext?.template || [];
    const currentUserId = String(currentUser?.sub || currentUser?.id || '');
    const canEditData =
      String(currentUser?.role || '').toUpperCase() === 'ADMIN' ||
      String(currentUser?.role || '').toUpperCase() === 'DATA_ENTRY' ||
      currentUserId === String(currentDashboard?.owner?.id || '');

    return (
      <div style={{ display: 'grid', gap: 18 }}>
        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' as const }}>
            <div>
              <div style={s.titulo}>DADOS INPUTADOS</div>
              <div style={{ color: PALETTE.texto, fontSize: 20, fontWeight: 800, letterSpacing: -0.3 }}>
                Ajuste mensal por unidade
              </div>
              <div style={{ color: PALETTE.textoSec, fontSize: 13, marginTop: 6, maxWidth: 760 }}>
                Aqui as gestoras podem revisar os dados que ja foram lancados. A unidade escolhida continua vinculada automaticamente a sua gestora-base.
              </div>
            </div>

            <button
              type="button"
              onClick={saveDataEntryMonthly}
              disabled={!canEditData || dataEntrySaving || !dataEntryUnitId}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                border: 'none',
                borderRadius: 12,
                padding: '12px 18px',
                background: !canEditData || dataEntrySaving || !dataEntryUnitId ? PALETTE.cinzaClaro : PALETTE.azul,
                color: !canEditData || dataEntrySaving || !dataEntryUnitId ? PALETTE.textoSec : '#fff',
                fontWeight: 700,
                cursor: !canEditData || dataEntrySaving || !dataEntryUnitId ? 'not-allowed' : 'pointer',
              }}
            >
              {dataEntrySaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              Salvar dados
            </button>
          </div>

          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: 22 }}>
            <label style={{ display: 'grid', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.8, color: PALETTE.textoSec, textTransform: 'uppercase' }}>Unidade</span>
              <select
                value={dataEntryUnitId}
                onChange={(e) => setDataEntryUnitId(e.target.value)}
                style={{ borderRadius: 12, border: `1px solid ${PALETTE.borda}`, padding: '12px 14px', background: PALETTE.card, color: PALETTE.texto }}
              >
                {units.map((unit: any) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.8, color: PALETTE.textoSec, textTransform: 'uppercase' }}>Mes de referencia</span>
              <input
                type="month"
                value={dataEntryMonth}
                onChange={(e) => setDataEntryMonth(e.target.value)}
                style={{ borderRadius: 12, border: `1px solid ${PALETTE.borda}`, padding: '12px 14px', background: PALETTE.card, color: PALETTE.texto }}
              />
            </label>

            <div style={{ borderRadius: 12, border: `1px solid ${PALETTE.borda}`, padding: '12px 14px', background: PALETTE.painel }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.8, color: PALETTE.textoSec, textTransform: 'uppercase' }}>Gestora vinculada</div>
              <div style={{ color: PALETTE.texto, fontSize: 18, fontWeight: 800, marginTop: 10 }}>
                {currentUnit?.gestora || dataEntryMonthly?.unit?.gestora || 'Sem Gestora'}
              </div>
            </div>

            <div style={{ borderRadius: 12, border: `1px solid ${PALETTE.borda}`, padding: '12px 14px', background: PALETTE.painel }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.8, color: PALETTE.textoSec, textTransform: 'uppercase' }}>Resumo do mes</div>
              <div style={{ display: 'grid', gap: 4, marginTop: 10, fontSize: 13, color: PALETTE.texto }}>
                <span>Receita: <strong>{fmt(toNum(dataEntryMonthly?.summary?.receita))}</strong></span>
                <span>Despesa: <strong>{fmt(toNum(dataEntryMonthly?.summary?.despesa))}</strong></span>
                <span>Resultado: <strong style={{ color: getResultadoColor(toNum(dataEntryMonthly?.summary?.resultado)) }}>{fmt(toNum(dataEntryMonthly?.summary?.resultado))}</strong></span>
              </div>
            </div>
          </div>

          {dataEntryError && (
            <div style={{ marginTop: 16, padding: '10px 12px', borderRadius: 8, border: `1px solid ${PALETTE.vermelho}`, background: `${PALETTE.vermelho}16`, color: PALETTE.texto, fontSize: 13 }}>
              {dataEntryError}
            </div>
          )}

          {dataEntrySuccess && (
            <div style={{ marginTop: 16, padding: '10px 12px', borderRadius: 8, border: `1px solid ${PALETTE.verde}`, background: `${PALETTE.verde}14`, color: PALETTE.texto, fontSize: 13 }}>
              {dataEntrySuccess}
            </div>
          )}
        </div>

        <div style={s.card}>
          <div style={s.titulo}>GRADE MENSAL DE DADOS</div>
          {dataEntryLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 220, color: PALETTE.textoSec, gap: 10 }}>
              <Loader2 className="animate-spin" size={18} />
              Carregando valores mensais...
            </div>
          ) : currentTemplate.length === 0 ? (
            <div style={{ color: PALETTE.textoSec, fontSize: 14 }}>Nenhuma estrutura de input disponivel para este dashboard.</div>
          ) : (
            <div style={{ display: 'grid', gap: 18 }}>
              {currentTemplate.map((section: any) => (
                <div key={section.key} style={{ border: `1px solid ${PALETTE.borda}`, borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 18px', background: PALETTE.painel, borderBottom: `1px solid ${PALETTE.borda}` }}>
                    <div style={{ color: PALETTE.texto, fontSize: 16, fontWeight: 800 }}>{section.label}</div>
                    <div style={{ color: PALETTE.textoSec, fontSize: 12, marginTop: 4 }}>
                      {section.type} • Categoria {section.categoryName}
                    </div>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: PALETTE.card, borderBottom: `1px solid ${PALETTE.borda}` }}>
                          {['Linha / Fornecedor', '1 Semana', '2 Semana', '3 Semana', '4 Semana', '5 Semana', 'Total'].map((label) => (
                            <th key={label} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: PALETTE.textoSec }}>
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(section.rows || []).map((row: any) => {
                          const values = dataEntryValues[`${section.key}:${row.key}`] || [0, 0, 0, 0, 0];
                          const total = values.reduce((acc: number, value: number) => acc + toNum(value), 0);

                          return (
                            <tr key={row.key} style={{ borderBottom: `1px solid ${PALETTE.borda}` }}>
                              <td style={{ padding: '12px 14px', color: PALETTE.texto, fontWeight: 600 }}>{row.label}</td>
                              {values.map((value: number, weekIndex: number) => (
                                <td key={`${row.key}-${weekIndex}`} style={{ padding: '10px 14px' }}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={value === 0 ? '' : value}
                                    disabled={!canEditData}
                                    onChange={(e) => updateDataEntryValue(section.key, row.key, weekIndex, e.target.value)}
                                    style={{
                                      width: 110,
                                      borderRadius: 10,
                                      border: `1px solid ${PALETTE.borda}`,
                                      padding: '10px 12px',
                                      background: canEditData ? PALETTE.card : PALETTE.painel,
                                      color: PALETTE.texto,
                                    }}
                                  />
                                </td>
                              ))}
                              <td style={{ padding: '12px 14px', color: PALETTE.texto, fontWeight: 700 }}>{fmt(total)}</td>
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
        </div>
      </div>
    );
  };

  const abas = [AbaVisaoGeral, AbaPorGestoras, AbaEvolutivos, AbaCustos, AbaPessoas, AbaDados];
  const AbaAtual = abas[aba];
  const activeTemplateMeta = getDashboardTemplateMeta(dashboardMeta?.template);

  return (
    <div style={s.page}>
      {/* HEADER */}
      <div style={s.header}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: PALETTE.texto, letterSpacing: -0.2 }}>Painel</div>
          <div style={{ color: PALETTE.textoSec, fontSize: 12, marginTop: 4 }}>
            Visualizacao padronizada - {unidades.length} unidades
            {dashboardMeta?.owner?.name ? ` - Proprietario: ${dashboardMeta.owner.name}` : ''}
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", marginTop: 8, borderRadius: 999, border: `1px solid ${PALETTE.verde}33`, background: `${PALETTE.verde}12`, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: PALETTE.verde, letterSpacing: 0.4, textTransform: "uppercase" }}>
            Modelo {activeTemplateMeta.label}
          </div>
          <div style={{ color: PALETTE.textoSec, fontSize: 11, marginTop: 6, maxWidth: 620 }}>
            {dashboardMeta?.templateMeta?.importHint || activeTemplateMeta.description}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ background: totalLucro >= 0 ? PALETTE.verde + "22" : PALETTE.vermelho + "22", border: `1px solid ${totalLucro >= 0 ? PALETTE.verde : PALETTE.vermelho}`, borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 700, color: totalLucro >= 0 ? PALETTE.verde : PALETTE.vermelho }}>
            Resultado Global: {fmtK(totalLucro)}
          </div>
          <div style={{ background: PALETTE.card, border: `1px solid ${PALETTE.borda}`, borderRadius: 8, padding: "4px 8px", display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: PALETTE.textoSec }}>Dinamico</span>
            <input type="file" accept=".xlsx,.xls,.csv" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
            <button onClick={() => fileInputRef.current?.click()} style={{ background: PALETTE.azul, border: "none", color: "#fff", fontSize: 12, padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontWeight: 700 }}>
              Importar Excel
            </button>
          </div>
        </div>
      </div>

      {/* NAVEGAÃ‡ÃƒO */}
      <div style={s.nav}>
        {ABAS.map((a, i) => (
          <button key={i} onClick={() => setAba(i)} style={s.badge(aba === i)}>{a}</button>
        ))}
      </div>

      {/* CONTEÃšDO */}
      <div style={s.body}>
        {loadError && (
          <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 8, border: `1px solid ${PALETTE.vermelho}`, background: `${PALETTE.vermelho}20`, color: PALETTE.texto, fontSize: 13 }}>
            {loadError}
          </div>
        )}
        <AbaAtual />
      </div>

      {importModal.open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-modal-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            background: PALETTE.scrim,
            backdropFilter: "blur(12px)",
          }}
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            if (importModal.phase === "success" || importModal.phase === "error") closeImportModal();
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 440,
              borderRadius: 22,
              padding: "28px 26px 22px",
              background: `linear-gradient(160deg, ${PALETTE.card} 0%, ${PALETTE.painel} 55%, ${PALETTE.fundo} 100%)`,
              border: `1px solid ${PALETTE.borda}`,
              boxShadow: "0 24px 60px rgba(15,23,42,0.12), 0 0 0 1px rgba(37,99,235,0.08)",
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: "rgba(37, 99, 235, 0.1)",
                border: `1px solid rgba(37, 99, 235, 0.28)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 18,
              }}
            >
              <FileSpreadsheet size={26} color={PALETTE.azul} strokeWidth={1.75} />
            </div>

            <h2
              id="import-modal-title"
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 800,
                letterSpacing: -0.4,
                color: PALETTE.texto,
              }}
            >
              {importModal.phase === "uploading"
                ? "Enviando planilha"
                : importModal.phase === "refreshing"
                  ? "Atualizando dashboard"
                  : importModal.phase === "success"
                    ? "Importação concluída"
                    : "Não foi possível importar"}
            </h2>

            {importModal.fileName ? (
              <p style={{ margin: "10px 0 0", fontSize: 13, color: PALETTE.textoSec, lineHeight: 1.45 }}>
                <span style={{ color: PALETTE.texto, fontWeight: 600 }}>{importModal.fileName}</span>
              </p>
            ) : null}

            {(importModal.phase === "uploading" || importModal.phase === "refreshing") && (
              <>
                <p style={{ margin: "14px 0 0", fontSize: 13, color: PALETTE.textoSec }}>
                  {importModal.phase === "uploading"
                    ? "Processando arquivo no servidor…"
                    : "Recarregando gráficos e tabelas com os novos dados…"}
                </p>
                <div
                  style={{
                    marginTop: 22,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <Loader2
                    className="animate-spin"
                    size={36}
                    color={PALETTE.azul}
                    strokeWidth={2}
                    aria-hidden
                  />
                </div>
                <div
                  style={{
                    marginTop: 22,
                    height: 4,
                    borderRadius: 999,
                    background: PALETTE.cinzaClaro,
                    overflow: "hidden",
                  }}
                >
                  <div
                    className="pdca-import-bar-sweep"
                    style={{
                      width: "42%",
                      height: "100%",
                      borderRadius: 999,
                      background: `linear-gradient(90deg, transparent, ${PALETTE.azul}, transparent)`,
                    }}
                  />
                </div>
              </>
            )}

            {importModal.phase === "success" && (
              <div style={{ marginTop: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <CheckCircle2 size={28} color={PALETTE.verde} strokeWidth={2} aria-hidden />
                  <span style={{ fontSize: 14, fontWeight: 600, color: PALETTE.verde }}>Tudo certo</span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gap: 10,
                    padding: "14px 16px",
                    borderRadius: 12,
                    background: "rgba(22, 163, 74, 0.08)",
                    border: `1px solid rgba(22, 163, 74, 0.22)`,
                    fontSize: 13,
                    color: PALETTE.texto,
                  }}
                >
                  {typeof importModal.totalLines === "number" ? (
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <span style={{ color: PALETTE.textoSec }}>Linhas importadas</span>
                      <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{importModal.totalLines}</span>
                    </div>
                  ) : null}
                  {importModal.dashboardId ? (
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                      <span style={{ color: PALETTE.textoSec }}>Dashboard</span>
                      <code
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: PALETTE.texto,
                          wordBreak: "break-all",
                          textAlign: "right",
                          maxWidth: "62%",
                        }}
                      >
                        {importModal.dashboardId}
                      </code>
                    </div>
                  ) : null}
                  {importModal.ownerUserId ? (
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                      <span style={{ color: PALETTE.textoSec }}>Usuário dono</span>
                      <code
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: PALETTE.texto,
                          wordBreak: "break-all",
                          textAlign: "right",
                          maxWidth: "62%",
                        }}
                      >
                        {importModal.ownerUserId}
                      </code>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={closeImportModal}
                  style={{
                    marginTop: 22,
                    width: "100%",
                    padding: "12px 16px",
                    borderRadius: 12,
                    border: "none",
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: 14,
                    color: "#fff",
                    background: PALETTE.azul,
                  }}
                >
                  Fechar
                </button>
              </div>
            )}

            {importModal.phase === "error" && (
              <div style={{ marginTop: 20 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
                  <XCircle size={26} color={PALETTE.vermelho} strokeWidth={2} style={{ flexShrink: 0 }} aria-hidden />
                  <p style={{ margin: 0, fontSize: 14, color: PALETTE.texto, lineHeight: 1.5 }}>
                    {importModal.errorMessage || "Erro desconhecido."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeImportModal}
                  style={{
                    marginTop: 8,
                    width: "100%",
                    padding: "12px 16px",
                    borderRadius: 12,
                    border: `1px solid ${PALETTE.borda}`,
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: 14,
                    color: PALETTE.texto,
                    background: PALETTE.cinzaClaro,
                  }}
                >
                  Fechar
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Carregando dashboard...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
