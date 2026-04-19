'use client';

import { getDashboardApiUrl } from '@/lib/api-url';
import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import Cookies from "js-cookie";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, LabelList,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ReferenceLine, ComposedChart
} from "recharts";

const TAB_KEYS = ['visaoGeral', 'porUnidade', 'porGestoras', 'custos', 'tendencia', 'pessoas', 'evolutivos'] as const;
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
const fmtNomeUnidade = (nome: string) => (nome.length > 18 ? `${nome.slice(0, 18)}...` : nome);
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
  verde:    "#3FB37F",
  verdeEsc: "#2D8C63",
  azul:     "#4C8DFF",
  laranja:  "#F2A33C",
  vermelho: "#E56B6F",
  roxo:     "#8B7CFF",
  rosa:     "#E07AB0",
  cinzaClaro: "#1B2636",
  cinza:    "#7F93AC",
  fundo:    "#0D1726",
  card:     "#142033",
  borda:    "#22324A",
  texto:    "#F2F6FB",
  textoSec: "#9AAEC4",
};

const CORES_UNIDADES = [PALETTE.azul, PALETTE.vermelho, PALETTE.verde, PALETTE.laranja, PALETTE.roxo, PALETTE.rosa];
const CHART_THEME = {
  grid: { strokeDasharray: "3 3", stroke: PALETTE.borda },
  gridHorizontal: { strokeDasharray: "3 3", stroke: PALETTE.borda, horizontal: false },
  gridVertical: { strokeDasharray: "3 3", stroke: PALETTE.borda, vertical: false },
  axisX: { tick: { fill: PALETTE.textoSec, fontSize: 12 }, axisLine: { stroke: PALETTE.borda }, tickLine: { stroke: PALETTE.borda } },
  axisY: { tick: { fill: PALETTE.textoSec, fontSize: 11 }, axisLine: { stroke: PALETTE.borda }, tickLine: { stroke: PALETTE.borda } },
  axisCategory: { tick: { fill: PALETTE.texto, fontSize: 11 }, axisLine: { stroke: PALETTE.borda }, tickLine: { stroke: PALETTE.borda } },
  axisPercent: { tick: { fill: PALETTE.laranja, fontSize: 11 }, axisLine: { stroke: PALETTE.borda }, tickLine: { stroke: PALETTE.borda } },
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
      stroke="#182538"
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
          {p.name}: {(() => {
            const value = toNum(p.value);
            if (percentKeys.has(String(p.dataKey))) return fmtPct(value);
            if (countKeys.has(String(p.dataKey))) return `${Math.round(value)}`;
            return fmtK(value);
          })()}
        </p>
      ))}
      {typeof margemLucro === "number" && (
        <p style={{ color: PALETTE.textoSec, fontSize: 12, fontWeight: 700, marginTop: 6 }}>
          % Lucro: {fmtPct(margemLucro)}
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
    background: "#101B2C", borderBottom: `1px solid ${PALETTE.borda}`,
    padding: "18px 32px", display: "flex", justifyContent: "space-between", alignItems: "center",
  },
  logo: { fontSize: 20, fontWeight: 800, letterSpacing: -0.5 },
  badge: (ativo: boolean) => ({
    padding: "6px 16px", borderRadius: 30, fontSize: 13, fontWeight: 600, cursor: "pointer",
    background: ativo ? PALETTE.verdeEsc : "transparent",
    color: ativo ? "#F6F8F2" : PALETTE.textoSec,
    border: `1px solid ${ativo ? PALETTE.verdeEsc : PALETTE.borda}`,
    transition: "all .2s",
  }),
  nav: {
    display: "flex", gap: 8, padding: "16px 32px",
    borderBottom: `1px solid ${PALETTE.borda}`, background: "#111E31",
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

const ABAS = ["Visao Geral", "Por Unidade", "Por Gestoras", "Custos", "Tendencia", "Pessoas", "Evolutivos"];

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
    porUnidade: '',
    porGestoras: '',
    custos: '',
    tendencia: '',
    pessoas: '',
    evolutivos: '',
  });
  const [filtroUnid, setFiltroUnid] = useState<string>("Todas");
  const [filtroGestora, setFiltroGestora] = useState<string>("Todas");
  const [filtroUnidadeGestora, setFiltroUnidadeGestora] = useState<string>("Todas");
  const [filtroEvolutivoUnidade, setFiltroEvolutivoUnidade] = useState<string>("Todas");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeTabKey = TAB_KEYS[aba] || 'visaoGeral';
  const activeMonthFilter = monthFilters[activeTabKey] || '';
  const activeDashboardId = searchParams.get('dashboardId') || dashboardId;

  const buildDashboardPayload = (dataMap: Record<string, any>) => ({
    overview: dataMap.overview ?? { kpis: { receitaTotal: 0, despesaTotal: 0, lucro: 0, funcionarios: { current: 0, variance: 0 }, typeTotals: {} }, chartData: [], ranking: [] },
    units: dataMap.units ?? { units: [] },
    managers: dataMap.managers ?? { gestoras: [] },
    costs: dataMap.costs ?? { despesas: [], total: 0 },
    people: dataMap.people ?? { people: [], totalFopag: 0 },
    trends: dataMap.trends ?? { trends: [] },
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
      ['trends', axios.get(`${getDashboardApiUrl()}/trends${qs}`, config)],
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

  const fetchData = async (options?: { includeFull?: boolean }) => {
    try {
      setLoading(true);
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
      setLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const token = Cookies.get('token') || '';
    const currentUser = decodeToken(token);
    if (isAdminRole(currentUser?.role) && !activeDashboardId) {
      alert('Selecione um dashboard antes de importar.');
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.push('/dashboards');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const importQs = activeDashboardId ? `?dashboardId=${activeDashboardId}` : '';
      const response = await axios.post(`${getDashboardApiUrl()}/import${importQs}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` }
      });
      const total = response?.data?.totalImportado;
      const targetDashboard = response?.data?.dashboardId;
      const targetOwner = response?.data?.ownerUserId;
      alert(
        `Planilha importada com sucesso!${
          typeof total === 'number' ? ` Linhas: ${total}.` : ''
        }${targetDashboard ? ` Dashboard: ${targetDashboard}.` : ''}${
          targetOwner ? ` Usuario dono: ${targetOwner}.` : ''
        }`,
      );
      await fetchData();
    } catch (error) {
      console.error(error);
      const message = axios.isAxiosError(error)
        ? (error.response?.data?.message || error.message)
        : 'Falha desconhecida';
      alert(`Erro ao importar planilha: ${message}`);
      setLoading(false);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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

  const categoriasEventos = categoriasDespesa; // Mock
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
  
  const acumulados = (() => {
    let recAcum = 0;
    let despAcum = 0;
    return meses.map((m: any) => {
      recAcum += toNum(m.receita);
      despAcum += toNum(m.despesa);
      return {
        mes: m.mes,
        mesLabel: m.mesLabel,
        recAcum,
        despAcum,
        lucroAcum: recAcum - despAcum,
      };
    });
  })();
  const margemMensalSeries = meses.map((m: any) => ({
    ...m,
    margem: m.receita > 0 ? m.lucro / m.receita : 0,
  }));
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

      <div style={s.row}>
        <div style={{ ...s.card, flex: 2, minWidth: 320 }}>
          <div style={s.titulo}>Evolucao Mensal</div>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={meses} barGap={4} margin={{ top: 22, right: 10, bottom: 6, left: 0 }}>
              <CartesianGrid {...CHART_THEME.grid} />
              <XAxis dataKey="mesLabel" {...CHART_THEME.axisX} />
              <YAxis yAxisId="valor" domain={getMoneyDomain(meses, ['receita', 'despesa', 'lucro'])} tickFormatter={v => `R$${(v/1000).toFixed(0)}K`} {...CHART_THEME.axisY} />
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
              <Bar yAxisId="valor" dataKey="lucro" name="Lucro" fill={PALETTE.azul} radius={CHART_THEME.barRadiusTop}>
                <LabelList dataKey="lucro" content={<LabelBarTopValue formatter={fmtCompactMoney} color={PALETTE.azul} />} />
              </Bar>
              <Line yAxisId="percentual" type="monotone" dataKey="lucroPct" name="% Lucro" stroke={PALETTE.laranja} strokeWidth={CHART_THEME.line.strokeWidth} dot={{ ...CHART_THEME.line.dot, fill: PALETTE.laranja, r: 4 }} activeDot={{ ...CHART_THEME.line.activeDot, r: 6 }} label={<LabelLineValue formatter={fmtPctCompact} color={PALETTE.laranja} />} />
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
                  <span>% Lucro: {fmtPct(lucroPct)}</span>
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
              <div key={row.nome} style={{ background: "#182538", border: `1px solid ${PALETTE.borda}`, borderRadius: 16, padding: "16px 18px", boxShadow: "0 14px 30px rgba(0,0,0,0.22)" }}>
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
                            <div style={{ background: "#1D2B40", border: `1px solid ${PALETTE.borda}`, borderRadius: 10, padding: "10px 14px" }}>
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
                        dot={{ r: 5, fill: PALETTE.laranja, stroke: "#182538", strokeWidth: 2 }}
                        activeDot={{ r: 7, fill: PALETTE.laranja, stroke: "#182538", strokeWidth: 2 }}
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

  // â”€â”€ ABA 1: POR UNIDADE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const AbaPorUnidade = () => {
    const possuiFiltroUnidade = filtroUnid !== "Todas" && !!filtroUnid;
    const unidadeSelecionada = possuiFiltroUnidade
      ? unidades.find((u: any) => u.nome === filtroUnid) || null
      : null;
    const dataFiltrada = possuiFiltroUnidade
      ? (unidadeSelecionada ? [unidadeSelecionada] : [])
      : unidades;
    const alturaGraficoUnidades = Math.max(dataFiltrada.length * 42, 320);
    const larguraEixoUnidades = 150;
    const monthlyUnitSeries = possuiFiltroUnidade
      ? unidadeSelecionada?.monthly || []
      : buildMonthlySeries(unidades);
    const definicoesDespesa = possuiFiltroUnidade
      ? unidadeSelecionada?.expenseDefinitions || []
      : mergeExpenseDefinitions(dataFiltrada);
    const alturaGraficoDefinicoes = Math.max(definicoesDespesa.length * 34, 260);
    const monthOptions = getMonthOptionsFromSeries(buildMonthlySeries(unidadesFull));

    return (
    <>
      {/* ROW BOTÃ•ES */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {["Todas", ...unidadesFull.map((u:any) => u.nome)].map(name => (
            <button 
              key={name}
              onClick={() => setFiltroUnid(name)}
              style={s.badge(filtroUnid === name)}
            >
              {name}
            </button>
          ))}
        </div>
        {renderMonthFilter('porUnidade', monthOptions)}

        <div style={s.card}>
          <div style={s.titulo}>RECEITA X DESPESA POR UNIDADE</div>
          <div style={{ maxHeight: 520, overflowY: "auto", overflowX: "hidden", paddingRight: 4 }}>
            <ResponsiveContainer width="100%" height={alturaGraficoUnidades}>
              <BarChart layout="vertical" data={dataFiltrada} barGap={6} margin={{ top: 4, right: 24, bottom: 4, left: 12 }}>
                <CartesianGrid {...CHART_THEME.gridHorizontal} />
                <XAxis type="number" tickFormatter={fmtAxisMoney} {...CHART_THEME.axisY} />
                <YAxis
                  type="category"
                  dataKey="nome"
                  interval={0}
                  tickFormatter={fmtNomeUnidade}
                  {...CHART_THEME.axisCategory}
                  width={larguraEixoUnidades}
                />
                {chartTooltip}
                <Legend wrapperStyle={CHART_THEME.legend} />
                <Bar dataKey="receita" name="Receita" fill={PALETTE.azul} radius={CHART_THEME.barRadiusSide}>
                  <LabelList dataKey="receita" content={<LabelBarRightValue formatter={fmtCompactMoney} color={PALETTE.azul} />} />
                  <LabelList dataKey="margem" content={<LabelMargemLucro />} />
                </Bar>
                <Bar dataKey="despesa" name="Despesa" fill={PALETTE.vermelho} radius={CHART_THEME.barRadiusSide}>
                  <LabelList dataKey="despesa" content={<LabelBarRightValue formatter={fmtCompactMoney} color={PALETTE.vermelho} />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={s.card}>
          <div style={s.titulo}>RESULTADO POR UNIDADE</div>
          <div style={{ maxHeight: 520, overflowY: "auto", overflowX: "hidden", paddingRight: 4 }}>
            <ResponsiveContainer width="100%" height={alturaGraficoUnidades}>
              <BarChart layout="vertical" data={dataFiltrada} barGap={6} margin={{ top: 4, right: 24, bottom: 4, left: 12 }}>
                <CartesianGrid {...CHART_THEME.gridHorizontal} />
                <XAxis type="number" tickFormatter={fmtAxisMoney} {...CHART_THEME.axisY} />
                <YAxis
                  type="category"
                  dataKey="nome"
                  interval={0}
                  tickFormatter={fmtNomeUnidade}
                  {...CHART_THEME.axisCategory}
                  width={larguraEixoUnidades}
                />
                {chartTooltip}
                <ReferenceLine x={0} stroke={PALETTE.textoSec} />
                <Bar dataKey="lucro" name="Resultado" radius={CHART_THEME.barRadiusSide}>
                  {dataFiltrada.map((u: any) => <Cell key={u.nome} fill={u.lucro >= 0 ? PALETTE.verde : PALETTE.vermelho} />)}
                  <LabelList dataKey="lucro" content={<LabelBarRightValue formatter={fmtCompactMoney} color={PALETTE.texto} />} />
                  <LabelList dataKey="margem" content={<LabelMargemLucro />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={s.card}>
          <div style={s.titulo}>{unidadeSelecionada ? "DESPESAS POR DEFINICAO DA UNIDADE" : "DESPESAS POR DEFINICAO DAS UNIDADES FILTRADAS"}</div>
          {definicoesDespesa.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 220, color: PALETTE.textoSec, fontSize: 14 }}>
              Nao ha despesas por definicao para o filtro aplicado.
            </div>
          ) : (
            <div style={{ maxHeight: 420, overflowY: "auto", overflowX: "hidden", paddingRight: 4 }}>
              <ResponsiveContainer width="100%" height={alturaGraficoDefinicoes}>
                <BarChart layout="vertical" data={definicoesDespesa} barGap={6} margin={{ top: 4, right: 24, bottom: 4, left: 12 }}>
                  <CartesianGrid {...CHART_THEME.gridHorizontal} />
                  <XAxis type="number" tickFormatter={fmtAxisMoney} {...CHART_THEME.axisY} />
                  <YAxis
                    type="category"
                    dataKey="nome"
                    interval={0}
                    tickFormatter={fmtNomeUnidade}
                    {...CHART_THEME.axisCategory}
                    width={170}
                  />
                  {chartTooltip}
                  <Bar dataKey="valor" name="Despesa" fill={PALETTE.vermelho} radius={CHART_THEME.barRadiusSide}>
                    <LabelList dataKey="valor" content={<LabelBarRightValue formatter={fmtCompactMoney} color={PALETTE.vermelho} />} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div style={s.card}>
          <div style={s.titulo}>EVOLUCAO MENSAL DA UNIDADE</div>
          {monthlyUnitSeries.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 240, color: PALETTE.textoSec, fontSize: 14 }}>
              Nao ha historico mensal disponivel para {unidadeSelecionada ? unidadeSelecionada.nome : "as unidades"}.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={monthlyUnitSeries} barGap={4}>
                <CartesianGrid {...CHART_THEME.grid} />
                <XAxis dataKey="mesLabel" {...CHART_THEME.axisX} />
                <YAxis yAxisId="valor" tickFormatter={fmtAxisMoney} {...CHART_THEME.axisY} />
                <YAxis yAxisId="percentual" orientation="right" domain={getPercentDomain(monthlyUnitSeries, 'lucroPct')} tickFormatter={fmtPct} {...CHART_THEME.axisPercent} />
                {chartTooltip}
                <Legend wrapperStyle={CHART_THEME.legend} />
                <Bar yAxisId="valor" dataKey="receita" name="Receita" fill={PALETTE.azul} radius={CHART_THEME.barRadiusTop}>
                  <LabelList dataKey="receita" content={<LabelBarTopValue formatter={fmtCompactMoney} color={PALETTE.azul} />} />
                </Bar>
                <Bar yAxisId="valor" dataKey="despesa" name="Despesa" fill={PALETTE.vermelho} radius={CHART_THEME.barRadiusTop}>
                  <LabelList dataKey="despesa" content={<LabelBarTopValue formatter={fmtCompactMoney} color={PALETTE.vermelho} />} />
                </Bar>
                <Bar yAxisId="valor" dataKey="lucro" name="Resultado" fill={PALETTE.verde} radius={CHART_THEME.barRadiusTop}>
                  <LabelList dataKey="lucro" content={<LabelBarTopValue formatter={fmtCompactMoney} color={PALETTE.verde} />} />
                </Bar>
                <Line yAxisId="percentual" type="monotone" dataKey="lucroPct" name="% Lucro" stroke={PALETTE.laranja} {...CHART_THEME.line} dot={{ ...CHART_THEME.line.dot, fill: PALETTE.laranja }} activeDot={{ ...CHART_THEME.line.activeDot }} label={<LabelLineValue formatter={fmtPctCompact} color={PALETTE.laranja} />} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={s.card}>
          <div style={s.titulo}>DETALHAMENTO POR UNIDADE</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: "600px", marginTop: 10 }}>
              <thead>
                <tr>
                  {["Unidade","Receita","Despesa","Resultado","Margem","FOPAG","Funcionários"].map(h => (
                    <th key={h} style={{ color: PALETTE.textoSec, fontWeight: 700, padding: "8px 12px", textAlign: "left", borderBottom: `1px solid ${PALETTE.borda}`, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataFiltrada.map((u: any, i: number) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom: `1px solid ${PALETTE.borda}20`,
                      cursor: "default",
                      background: ehUnidadeTotal(u.nome) ? `${PALETTE.azul}12` : "transparent"
                    }}
                  >
                    <td style={{ padding: "10px 12px", fontWeight: 600 }}>{u.nome}</td>
                    <td style={{ padding: "10px 12px", color: PALETTE.verde }}>{fmtK(u.receita)}</td>
                    <td style={{ padding: "10px 12px", color: PALETTE.vermelho }}>{fmtK(u.despesa)}</td>
                    <td style={{ padding: "10px 12px", color: u.lucro >= 0 ? PALETTE.verde : PALETTE.vermelho, fontWeight: 700 }}>{fmtK(u.lucro)}</td>
                    <td style={{ padding: "10px 12px" }}>{fmtPct(u.margem)}</td>
                    <td style={{ padding: "10px 12px" }}>{fmtK(u.fopag)}</td>
                    <td style={{ padding: "10px 12px" }}>{u.func}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>
    );
  };

  // â”€â”€ ABA 2: CUSTOS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const AbaPorGestoras = () => {
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
    const alturaGraficoGestoras = Math.max(dataComparativa.length * 42, 320);
    const larguraEixoGestoras = 150;
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
    const definicoesDespesa = possuiFiltroUnidadeGestora
      ? unidadeSelecionada?.expenseDefinitions || []
      : possuiFiltroGestora
        ? gestoraSelecionada?.expenseDefinitions || []
        : mergeExpenseDefinitions(dataComparativa);
    const alturaGraficoDefinicoes = Math.max(definicoesDespesa.length * 34, 260);
    const monthOptions = getMonthOptionsFromSeries(buildMonthlySeries(gestorasBaseFull));

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
          <div style={s.titulo}>{unidadeSelecionada ? "RECEITA X DESPESA DA UNIDADE SELECIONADA" : gestoraSelecionada ? "RECEITA X DESPESA DAS UNIDADES DA GESTORA" : "RECEITA X DESPESA POR GESTORA"}</div>
          <div style={{ maxHeight: 520, overflowY: "auto", overflowX: "hidden", paddingRight: 4 }}>
            <ResponsiveContainer width="100%" height={alturaGraficoGestoras}>
              <BarChart layout="vertical" data={dataComparativa} barGap={6} margin={{ top: 4, right: 24, bottom: 4, left: 12 }}>
                <CartesianGrid {...CHART_THEME.gridHorizontal} />
                <XAxis type="number" tickFormatter={fmtAxisMoney} {...CHART_THEME.axisY} />
                <YAxis
                  type="category"
                  dataKey="nome"
                  interval={0}
                  tickFormatter={fmtNomeUnidade}
                  {...CHART_THEME.axisCategory}
                  width={larguraEixoGestoras}
                />
                {chartTooltip}
                <Legend wrapperStyle={CHART_THEME.legend} />
                <Bar dataKey="receita" name="Receita" fill={PALETTE.azul} radius={CHART_THEME.barRadiusSide}>
                  <LabelList dataKey="receita" content={<LabelBarRightValue formatter={fmtCompactMoney} color={PALETTE.azul} />} />
                  <LabelList dataKey="margem" content={<LabelMargemLucro />} />
                </Bar>
                <Bar dataKey="despesa" name="Despesa" fill={PALETTE.vermelho} radius={CHART_THEME.barRadiusSide}>
                  <LabelList dataKey="despesa" content={<LabelBarRightValue formatter={fmtCompactMoney} color={PALETTE.vermelho} />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={s.card}>
          <div style={s.titulo}>{unidadeSelecionada ? "RESULTADO DA UNIDADE SELECIONADA" : gestoraSelecionada ? "RESULTADO DAS UNIDADES DA GESTORA" : "RESULTADO POR GESTORA"}</div>
          <div style={{ maxHeight: 520, overflowY: "auto", overflowX: "hidden", paddingRight: 4 }}>
            <ResponsiveContainer width="100%" height={alturaGraficoGestoras}>
              <BarChart layout="vertical" data={dataComparativa} barGap={6} margin={{ top: 4, right: 24, bottom: 4, left: 12 }}>
                <CartesianGrid {...CHART_THEME.gridHorizontal} />
                <XAxis type="number" tickFormatter={fmtAxisMoney} {...CHART_THEME.axisY} />
                <YAxis
                  type="category"
                  dataKey="nome"
                  interval={0}
                  tickFormatter={fmtNomeUnidade}
                  {...CHART_THEME.axisCategory}
                  width={larguraEixoGestoras}
                />
                {chartTooltip}
                <ReferenceLine x={0} stroke={PALETTE.textoSec} />
                <Bar dataKey="lucro" name="Resultado" radius={CHART_THEME.barRadiusSide}>
                  {dataComparativa.map((item: any) => <Cell key={item.nome} fill={item.lucro >= 0 ? PALETTE.verde : PALETTE.vermelho} />)}
                  <LabelList dataKey="lucro" content={<LabelBarRightValue formatter={fmtCompactMoney} color={PALETTE.texto} />} />
                  <LabelList dataKey="margem" content={<LabelMargemLucro />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={s.card}>
          <div style={s.titulo}>{unidadeSelecionada ? "DESPESAS POR DEFINICAO DA UNIDADE" : gestoraSelecionada ? "DESPESAS POR DEFINICAO DA GESTORA" : "DESPESAS POR DEFINICAO DAS GESTORAS FILTRADAS"}</div>
          {definicoesDespesa.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 220, color: PALETTE.textoSec, fontSize: 14 }}>
              Nao ha despesas por definicao para o filtro aplicado.
            </div>
          ) : (
            <div style={{ maxHeight: 420, overflowY: "auto", overflowX: "hidden", paddingRight: 4 }}>
              <ResponsiveContainer width="100%" height={alturaGraficoDefinicoes}>
                <BarChart layout="vertical" data={definicoesDespesa} barGap={6} margin={{ top: 4, right: 24, bottom: 4, left: 12 }}>
                  <CartesianGrid {...CHART_THEME.gridHorizontal} />
                  <XAxis type="number" tickFormatter={fmtAxisMoney} {...CHART_THEME.axisY} />
                  <YAxis
                    type="category"
                    dataKey="nome"
                    interval={0}
                    tickFormatter={fmtNomeUnidade}
                    {...CHART_THEME.axisCategory}
                    width={170}
                  />
                  {chartTooltip}
                  <Bar dataKey="valor" name="Despesa" fill={PALETTE.vermelho} radius={CHART_THEME.barRadiusSide}>
                    <LabelList dataKey="valor" content={<LabelBarRightValue formatter={fmtCompactMoney} color={PALETTE.vermelho} />} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div style={s.card}>
          <div style={s.titulo}>{unidadeSelecionada ? "EVOLUCAO MENSAL DA UNIDADE" : "EVOLUCAO MENSAL DA GESTORA"}</div>
          {monthlyExibido.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 240, color: PALETTE.textoSec, fontSize: 14 }}>
              Nao ha historico mensal disponivel para {unidadeSelecionada ? unidadeSelecionada.nome : gestoraSelecionada ? gestoraSelecionada.nome : "as gestoras"}.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={monthlyExibido} barGap={4}>
                <CartesianGrid {...CHART_THEME.grid} />
                <XAxis dataKey="mesLabel" {...CHART_THEME.axisX} />
                <YAxis yAxisId="valor" tickFormatter={fmtAxisMoney} {...CHART_THEME.axisY} />
                <YAxis yAxisId="percentual" orientation="right" domain={getPercentDomain(monthlyExibido, 'lucroPct')} tickFormatter={fmtPct} {...CHART_THEME.axisPercent} />
                {chartTooltip}
                <Legend wrapperStyle={CHART_THEME.legend} />
                <Bar yAxisId="valor" dataKey="receita" name="Receita" fill={PALETTE.azul} radius={CHART_THEME.barRadiusTop}>
                  <LabelList dataKey="receita" content={<LabelBarTopValue formatter={fmtCompactMoney} color={PALETTE.azul} />} />
                </Bar>
                <Bar yAxisId="valor" dataKey="despesa" name="Despesa" fill={PALETTE.vermelho} radius={CHART_THEME.barRadiusTop}>
                  <LabelList dataKey="despesa" content={<LabelBarTopValue formatter={fmtCompactMoney} color={PALETTE.vermelho} />} />
                </Bar>
                <Bar yAxisId="valor" dataKey="lucro" name="Resultado" fill={PALETTE.verde} radius={CHART_THEME.barRadiusTop}>
                  <LabelList dataKey="lucro" content={<LabelBarTopValue formatter={fmtCompactMoney} color={PALETTE.verde} />} />
                </Bar>
                <Line yAxisId="percentual" type="monotone" dataKey="lucroPct" name="% Lucro" stroke={PALETTE.laranja} {...CHART_THEME.line} dot={{ ...CHART_THEME.line.dot, fill: PALETTE.laranja }} activeDot={{ ...CHART_THEME.line.activeDot }} label={<LabelLineValue formatter={fmtPctCompact} color={PALETTE.laranja} />} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={s.card}>
          <div style={s.titulo}>{unidadeSelecionada ? "DETALHAMENTO DA UNIDADE SELECIONADA" : gestoraSelecionada ? "DETALHAMENTO DAS UNIDADES DA GESTORA" : "DETALHAMENTO POR GESTORA"}</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: "600px", marginTop: 10 }}>
              <thead>
                <tr>
                  {[(gestoraSelecionada ? "Unidade" : "Gestora"),"Receita","Despesa","Resultado","Margem"].map(h => (
                    <th key={h} style={{ color: PALETTE.textoSec, fontWeight: 700, padding: "8px 12px", textAlign: "left", borderBottom: `1px solid ${PALETTE.borda}`, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataComparativa.map((item: any, i: number) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${PALETTE.borda}20` }}>
                    <td style={{ padding: "10px 12px", fontWeight: 600 }}>{item.nome}</td>
                    <td style={{ padding: "10px 12px", color: PALETTE.verde }}>{fmtK(item.receita)}</td>
                    <td style={{ padding: "10px 12px", color: PALETTE.vermelho }}>{fmtK(item.despesa)}</td>
                    <td style={{ padding: "10px 12px", color: item.lucro >= 0 ? PALETTE.verde : PALETTE.vermelho, fontWeight: 700 }}>{fmtK(item.lucro)}</td>
                    <td style={{ padding: "10px 12px" }}>{fmtPct(item.margem)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
    const rankingDespesas = [...categoriasDespesa].sort((a: any, b: any) => b.valor - a.valor);
    const topCategorias = rankingDespesas.slice(0, 10).map((item: any, index: number) => ({
      ...item,
      pct: totalDespesa > 0 ? item.valor / totalDespesa : 0,
      cor: CORES_PIE[index % CORES_PIE.length]
    }));
    const alturaTopCategorias = Math.max(topCategorias.length * 34, 280);
    const maiorCategoria = rankingDespesas[0];
    const top3Total = rankingDespesas.slice(0, 3).reduce((acc: number, item: any) => acc + item.valor, 0);
    const top5Total = top5.reduce((acc: number, item: any) => acc + item.valor, 0);
    const custosMensais = meses.map((m: any) => ({
      ...m,
      custoPct: m.receita > 0 ? m.despesa / m.receita : 0,
    }));
    let acumuladoDespesas = 0;
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

        <div style={s.row}>
          <div style={{ ...s.card, flex: 1, minWidth: 300 }}>
            <div style={s.titulo}>Composição das Despesas (Top 5 + Outros)</div>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={pieData} dataKey="valor" nameKey="nome" cx="50%" cy="50%" outerRadius={100} label={(props: any) => `${props.nome || props.name} ${((props.percent || 0)*100).toFixed(0)}%`} labelLine={{ stroke: PALETTE.borda }}>
                  {pieData.map((_: any, i: number) => <Cell key={i} fill={CORES_PIE[i % CORES_PIE.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => fmtK(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div style={{ ...s.card, flex: 1.5, minWidth: 300 }}>
            <div style={s.titulo}>Detalhamento de Despesas por Categoria</div>
            <div style={{ maxHeight: 420, overflowY: "auto", paddingRight: 4 }}>
              {categoriasDespesa.map((c: any, i: number) => {
                const pct = totalReceita > 0 ? c.valor / totalReceita : 0;
                return (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 13 }}>{c.nome}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: PALETTE.vermelho }}>{fmtK(c.valor)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, background: PALETTE.borda, borderRadius: 4, height: 6 }}>
                        <div style={{ width: `${pct * 100}%`, height: 6, borderRadius: 4, background: CORES_PIE[Math.min(i, 5)] }} />
                      </div>
                      <span style={{ fontSize: 11, color: PALETTE.textoSec, width: 44, textAlign: "right" }}>{fmtPct(pct)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div style={s.row}>
          <div style={{ ...s.card, flex: 1.3, minWidth: 360 }}>
            <div style={s.titulo}>Ranking das Categorias</div>
            <div style={{ maxHeight: 430, overflowY: "auto", overflowX: "hidden", paddingRight: 4 }}>
              <ResponsiveContainer width="100%" height={alturaTopCategorias}>
                <BarChart data={topCategorias} layout="vertical" margin={{ top: 4, right: 30, bottom: 4, left: 12 }}>
                  <CartesianGrid {...CHART_THEME.gridHorizontal} />
                  <XAxis type="number" tickFormatter={fmtAxisMoney} {...CHART_THEME.axisY} />
                  <YAxis
                    type="category"
                    dataKey="nome"
                    interval={0}
                    tickFormatter={fmtNomeUnidade}
                    {...CHART_THEME.axisCategory}
                    width={150}
                  />
                  {chartTooltip}
                  <Bar dataKey="valor" name="Despesa" radius={CHART_THEME.barRadiusSide}>
                    {topCategorias.map((item: any, i: number) => <Cell key={i} fill={item.cor} />)}
                    <LabelList dataKey="valor" content={<LabelBarRightValue formatter={fmtCompactMoney} color={PALETTE.texto} />} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ ...s.card, flex: 0.9, minWidth: 300 }}>
            <div style={s.titulo}>Leitura Rápida</div>
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ padding: "14px 16px", borderRadius: 12, background: `${PALETTE.vermelho}12`, border: `1px solid ${PALETTE.vermelho}33` }}>
                <div style={{ fontSize: 11, color: PALETTE.textoSec, textTransform: "uppercase", letterSpacing: 0.8 }}>Maior Categoria</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: PALETTE.texto, marginTop: 6 }}>{maiorCategoria?.nome || "—"}</div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 8 }}>
                  <span style={{ color: PALETTE.vermelho, fontWeight: 700 }}>{maiorCategoria ? fmtK(maiorCategoria.valor) : "—"}</span>
                  <span style={{ color: PALETTE.textoSec, fontWeight: 700 }}>{maiorCategoria && totalReceita > 0 ? fmtPct(maiorCategoria.valor / totalReceita) : "0.00%"}</span>
                </div>
              </div>

              <div style={{ padding: "14px 16px", borderRadius: 12, background: `${PALETTE.laranja}12`, border: `1px solid ${PALETTE.laranja}33` }}>
                <div style={{ fontSize: 11, color: PALETTE.textoSec, textTransform: "uppercase", letterSpacing: 0.8 }}>Concentração Top 3</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: PALETTE.laranja, marginTop: 6 }}>{fmtPct(totalDespesa > 0 ? top3Total / totalDespesa : 0)}</div>
                <div style={{ color: PALETTE.textoSec, fontSize: 12, marginTop: 4 }}>{fmtK(top3Total)} nas 3 maiores categorias</div>
              </div>

              <div style={{ padding: "14px 16px", borderRadius: 12, background: `${PALETTE.azul}12`, border: `1px solid ${PALETTE.azul}33` }}>
                <div style={{ fontSize: 11, color: PALETTE.textoSec, textTransform: "uppercase", letterSpacing: 0.8 }}>Top 5 + Outros</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: PALETTE.azul, marginTop: 6 }}>{fmtPct(totalDespesa > 0 ? top5Total / totalDespesa : 0)}</div>
                <div style={{ color: PALETTE.textoSec, fontSize: 12, marginTop: 4 }}>{fmtK(outros)} concentrados em "Outros"</div>
              </div>
            </div>
          </div>
        </div>

        <div style={s.card}>
          <div style={s.titulo}>Tabela Completa de Categorias</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: "760px" }}>
              <thead>
                <tr>
                  {["#", "Categoria", "Valor", "% sobre Faturamento", "Acumulado"].map(h => (
                    <th key={h} style={{ color: PALETTE.textoSec, fontWeight: 700, padding: "8px 12px", textAlign: "left", borderBottom: `1px solid ${PALETTE.borda}`, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rankingDespesas.map((c: any, i: number) => {
                  const pct = totalReceita > 0 ? c.valor / totalReceita : 0;
                  acumuladoDespesas += c.valor;
                  const acumulado = totalReceita > 0 ? acumuladoDespesas / totalReceita : 0;
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${PALETTE.borda}20` }}>
                      <td style={{ padding: "10px 12px", color: PALETTE.textoSec }}>{i + 1}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 600 }}>{c.nome}</td>
                      <td style={{ padding: "10px 12px", color: PALETTE.vermelho, fontWeight: 700 }}>{fmtK(c.valor)}</td>
                      <td style={{ padding: "10px 12px" }}>{fmtPct(pct)}</td>
                      <td style={{ padding: "10px 12px" }}>{fmtPct(acumulado)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div style={s.card}>
          <div style={s.titulo}>Custos de Eventos por Categoria</div>
          <p style={{fontSize: 12, color: PALETTE.textoSec, marginBottom: 8}}>*Mock apenas para visualização deste modelo</p>
          <div style={{ maxHeight: 420, overflowY: "auto", overflowX: "hidden", paddingRight: 4 }}>
            <ResponsiveContainer width="100%" height={Math.max(categoriasEventos.length * 26, 240)}>
            <BarChart data={categoriasEventos} layout="vertical" margin={{ top: 4, right: 18, bottom: 4, left: 12 }}>
              <CartesianGrid {...CHART_THEME.gridHorizontal} />
              <XAxis type="number" tickFormatter={v => `R$${(v/1000).toFixed(0)}K`} {...CHART_THEME.axisY} />
              <YAxis dataKey="nome" type="category" interval={0} tickFormatter={fmtNomeUnidade} {...CHART_THEME.axisCategory} width={160} />
              {chartTooltip}
              <Bar dataKey="valor" name="Valor" fill={PALETTE.roxo} radius={CHART_THEME.barRadiusSide}>
                <LabelList dataKey="valor" content={<LabelBarRightValue formatter={fmtCompactMoney} color={PALETTE.roxo} />} />
              </Bar>
            </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </>
    );
  };
  // â”€â”€ ABA 3: TENDÃŠNCIA / ACUMULADOS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const AbaTendencia = () => (
    <>
      {renderMonthFilter('tendencia', getMonthOptionsFromSeries(mesesFull))}
      <div style={s.row}>
        <KpiCard titulo="Receita Acumulada" valor={fmtK(acumulados.length ? acumulados[acumulados.length-1].recAcum : 0)} sub="Total Periodo" cor={PALETTE.verde} icon="+" />
        <KpiCard titulo="Despesa Acumulada" valor={fmtK(acumulados.length ? acumulados[acumulados.length-1].despAcum : 0)} sub="Total Periodo" cor={PALETTE.vermelho} icon="-" />
        <KpiCard titulo="Lucro Acumulado" valor={fmtK(acumulados.length ? acumulados[acumulados.length-1].lucroAcum : 0)} sub="Total Periodo" cor={totalLucro >= 0 ? PALETTE.verde : PALETTE.vermelho} icon="=" />
        <KpiCard titulo="Media Rec. Mensal" valor={fmtK(meses.length ? totalReceita / meses.length : 0)} sub="por mes" cor={PALETTE.azul} icon="M" />
      </div>

      <div style={s.card}>
        <div style={s.titulo}>Acumulado Mensal - Receita, Despesa e Lucro</div>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={acumulados}>
            <CartesianGrid {...CHART_THEME.grid} />
            <XAxis dataKey="mesLabel" {...CHART_THEME.axisX} />
            <YAxis tickFormatter={v => `R$${(v/1000).toFixed(0)}K`} {...CHART_THEME.axisY} />
            {chartTooltip}
            <Legend wrapperStyle={CHART_THEME.legend} />
            <Bar dataKey="recAcum" name="Rec. Acum." fill={PALETTE.verde} radius={CHART_THEME.barRadiusTop}>
              <LabelList dataKey="recAcum" content={<LabelBarTopValue formatter={fmtCompactMoney} color={PALETTE.verde} />} />
            </Bar>
            <Bar dataKey="despAcum" name="Desp. Acum." fill={PALETTE.vermelho} radius={CHART_THEME.barRadiusTop}>
              <LabelList dataKey="despAcum" content={<LabelBarTopValue formatter={fmtCompactMoney} color={PALETTE.vermelho} />} />
            </Bar>
            <Line type="monotone" dataKey="lucroAcum" name="Lucro Acum." stroke={PALETTE.azul} {...CHART_THEME.line} dot={{ ...CHART_THEME.line.dot, fill: PALETTE.azul, r: 6 }} activeDot={{ ...CHART_THEME.line.activeDot, r: 8 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ ...s.card, marginTop: 16 }}>
        <div style={s.titulo}>Evolucao da Margem % por Mes</div>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={margemMensalSeries}>
            <CartesianGrid {...CHART_THEME.grid} />
            <XAxis dataKey="mesLabel" {...CHART_THEME.axisX} />
            <YAxis domain={getPercentDomain(margemMensalSeries, 'margem')} tickFormatter={v => `${(v*100).toFixed(0)}%`} {...CHART_THEME.axisY} />
            {chartTooltip}
            <Bar dataKey="margem" name="Margem %" fill={PALETTE.azul} radius={CHART_THEME.barRadiusTop}>
              <LabelList dataKey="margem" content={<LabelBarTopValue formatter={fmtPctCompact} color={PALETTE.azul} />} />
            </Bar>
            <Line type="monotone" dataKey="margem" name="Margem %" stroke={PALETTE.laranja} {...CHART_THEME.line} dot={{ ...CHART_THEME.line.dot, fill: PALETTE.laranja, r: 6 }} activeDot={{ ...CHART_THEME.line.activeDot, r: 8 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );

  // â”€â”€ ABA 4: PESSOAS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const AbaPessoas = () => {
    const dataRecFunc = unidades.map((u:any) => ({...u, fopagPorFunc: u.func > 0 ? u.fopag / u.func : 0}));
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 16, marginBottom: 16 }}>
        <KpiCard titulo="RECEITA TOTAL" valor={fmtK(totalReceita)} sub="Base para analise de folha" cor={PALETTE.verde} icon="$" />
        <KpiCard titulo="FOPAG" valor={fmtK(totalFopag)} sub="Proventos + Encargos Folha" cor={PALETTE.laranja} icon="F" />
        <KpiCard titulo="FOPAG/Funcionário" valor={fmtK(totalFunc > 0 ? totalFopag / totalFunc : 0)} cor={PALETTE.roxo} icon="MF" />
        <KpiCard titulo="FOPAG %" valor={fmtPct(totalReceita > 0 ? totalFopag / totalReceita : 0)} sub="FOPAG dividido pela receita" cor={PALETTE.vermelho} icon="CF" />
        <KpiCard titulo="TOTAL FUNCIONÁRIOS" valor={totalFunc} cor={PALETTE.azul} icon="P" />
      </div>

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
        <div style={s.titulo}>HEADCOUNT POR UNIDADE</div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={unidades}>
            <CartesianGrid {...CHART_THEME.gridVertical} />
            <XAxis dataKey="nome" {...CHART_THEME.axisY} />
            <YAxis {...CHART_THEME.axisY} />
            {chartTooltip}
            <Bar dataKey="func" name="Funcionários" radius={CHART_THEME.barRadiusTop}>
              {unidades.map((_: any, i: number) => <Cell key={i} fill={CORES_UNIDADES[i % CORES_UNIDADES.length]} />)}
              <LabelList dataKey="func" content={<LabelBarTopValue formatter={(v: number) => `${Math.round(v)}`} color={PALETTE.texto} />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={s.card}>
        <div style={s.titulo}>FOPAG POR UNIDADE</div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={unidades}>
            <CartesianGrid {...CHART_THEME.gridVertical} />
            <XAxis dataKey="nome" {...CHART_THEME.axisY} />
            <YAxis tickFormatter={v => `R$${(v/1000).toFixed(0)}K`} {...CHART_THEME.axisY} />
            {chartTooltip}
            <Bar dataKey="fopag" name="FOPAG" radius={CHART_THEME.barRadiusTop}>
              {unidades.map((_: any, i: number) => <Cell key={i} fill={CORES_UNIDADES[i % CORES_UNIDADES.length]} />)}
              <LabelList dataKey="fopag" content={<LabelBarTopValue formatter={fmtCompactMoney} color={PALETTE.texto} />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={s.card}>
        <div style={s.titulo}>FOPAG POR FUNCIONÁRIO</div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={dataRecFunc}>
            <CartesianGrid {...CHART_THEME.gridVertical} />
            <XAxis dataKey="nome" {...CHART_THEME.axisY} />
            <YAxis tickFormatter={v => `R$${(v/1000).toFixed(0)}K`} {...CHART_THEME.axisY} />
            {chartTooltip}
            <Bar dataKey="fopagPorFunc" name="FOPAG/Funcionário" radius={CHART_THEME.barRadiusTop}>
              {unidades.map((_: any, i: number) => <Cell key={i} fill={CORES_UNIDADES[i % CORES_UNIDADES.length]} />)}
              <LabelList dataKey="fopagPorFunc" content={<LabelBarTopValue formatter={fmtCompactMoney} color={PALETTE.texto} />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
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
    const monthFilterEvolutivos = monthFilters.evolutivos || '';
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
    const comparativoResultado = unidades
      .map((u: any) => ({
        nome: u.nome,
        receita: toNum(u.receita),
        despesa: toNum(u.despesa),
        resultado: toNum(u.lucro),
        margem: toNum(u.margem),
      }))
      .sort((a: any, b: any) => b.resultado - a.resultado);
    const comparativoResultadoFiltrado = unidadesEvolutivasAtual
      .map((u: any) => ({
        nome: u.nome,
        receita: toNum(u.receita),
        despesa: toNum(u.despesa),
        resultado: toNum(u.lucro),
        margem: toNum(u.margem),
      }))
      .sort((a: any, b: any) => b.resultado - a.resultado);
    const unidadesEvolutivasSeries = unidadesEvolutivasCompletas
      .map((u: any) => ({
        nome: u.nome,
        categorias: (u.expenseDefinitionsMonthly || []).map((item: any) => ({
          nome: item.nome,
          ...Object.fromEntries(
            (item.monthly || [])
              .filter((entry: any) => !monthFilterEvolutivos || entry.mes === monthFilterEvolutivos)
              .map((entry: any) => [entry.mesLabel || entry.mes, toNum(entry.valor)]),
          ),
        })),
        meses: Array.from(
          new Set(
            (u.expenseDefinitionsMonthly || []).flatMap((item: any) =>
              (item.monthly || [])
                .filter((entry: any) => !monthFilterEvolutivos || entry.mes === monthFilterEvolutivos)
                .map((entry: any) => String(entry.mesLabel || entry.mes)),
            ),
          ),
        ),
      }))
      .map((u: any) => ({
        ...u,
        categorias: (u.categorias || []).filter((categoria: any) =>
          (u.meses || []).some((mes: string) => toNum(categoria[mes]) !== 0),
        ),
      }))
      .filter((u: any) => (u.categorias || []).length > 0 && (u.meses || []).length > 0);
    const unidadesComparativoMensalDespesas = unidadesEvolutivasCompletas
      .map((u: any) => {
        const categorias = (u.expenseDefinitionsMonthly || [])
          .map((item: any) => ({
            nome: item.nome,
            monthly: (item.monthly || []).filter((entry: any) => !monthFilterEvolutivos || entry.mes === monthFilterEvolutivos),
            total: (item.monthly || [])
              .filter((entry: any) => !monthFilterEvolutivos || entry.mes === monthFilterEvolutivos)
              .reduce((acc: number, entry: any) => acc + toNum(entry.valor), 0),
          }))
          .filter((item: any) => item.monthly.length > 0 && item.total > 0)
          .sort((a: any, b: any) => b.total - a.total);

        const meses = Array.from<string>(
          new Set<string>(
            categorias.flatMap((item: any) =>
              item.monthly.map((entry: any) => String(entry.mesLabel || entry.mes)),
            ),
          ),
        );
        const receitaByMesLabel = new Map(
          (u.monthly || [])
            .filter((entry: any) => !monthFilterEvolutivos || entry.mes === monthFilterEvolutivos)
            .map((entry: any) => [String(entry.mesLabel || entry.mes), toNum(entry.receita)]),
        );

        const monthlyRows = meses.map((mesLabel: string) => ({
          mesLabel,
          receita: receitaByMesLabel.get(mesLabel) ?? 0,
          ...Object.fromEntries(
            categorias.map((categoria: any) => {
              const monthEntry = categoria.monthly.find((entry: any) => String(entry.mesLabel || entry.mes) === mesLabel);
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
    const alturaComparativo = Math.max(comparativoResultadoFiltrado.length * 42, 320);
    const alturaDespesasEvolutivas = Math.max(despesasEvolutivas.length * 34, 240);

    return (
    <>
      {renderMonthFilter('evolutivos', monthOptions)}

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
        <div style={s.titulo}>COMPARATIVO DAS UNIDADES</div>
        <div style={{ overflowX: "auto", overflowY: "hidden", paddingBottom: 4 }}>
          <div style={{ minWidth: Math.max(comparativoResultadoFiltrado.length * 140, 720) }}>
          <ResponsiveContainer width="100%" height={alturaComparativo}>
            <BarChart data={comparativoResultadoFiltrado} barGap={10} margin={{ top: 12, right: 24, bottom: 12, left: 12 }}>
              <CartesianGrid {...CHART_THEME.gridVertical} />
              <XAxis dataKey="nome" tickFormatter={fmtNomeUnidade} {...CHART_THEME.axisX} />
              <YAxis tickFormatter={fmtAxisMoney} {...CHART_THEME.axisY} />
              {chartTooltip}
              <Legend wrapperStyle={CHART_THEME.legend} />
              <Bar dataKey="receita" name="Receita" fill={PALETTE.azul} radius={CHART_THEME.barRadiusTop}>
                <LabelList dataKey="receita" content={<LabelBarTopValue formatter={fmtCompactMoney} color={PALETTE.azul} />} />
              </Bar>
              <Bar dataKey="despesa" name="Despesa" fill={PALETTE.vermelho} radius={CHART_THEME.barRadiusTop}>
                <LabelList dataKey="despesa" content={<LabelBarTopValue formatter={fmtCompactMoney} color={PALETTE.vermelho} />} />
              </Bar>
              <Bar dataKey="resultado" name="Resultado" radius={CHART_THEME.barRadiusTop}>
                {comparativoResultadoFiltrado.map((item: any) => <Cell key={item.nome} fill={item.resultado >= 0 ? PALETTE.verde : PALETTE.vermelho} />)}
                <LabelList dataKey="resultado" content={<LabelBarTopValue formatter={fmtCompactMoney} color={PALETTE.texto} />} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div style={s.card}>
        <div style={s.titulo}>{possuiFiltroEvolutivo ? `DESPESAS DA UNIDADE ${filtroEvolutivoUnidade.toUpperCase()}` : "DESPESAS AGRUPADAS DAS UNIDADES"}</div>
        {despesasEvolutivas.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 220, color: PALETTE.textoSec, fontSize: 14 }}>
            Nao ha despesas por definicao para o filtro aplicado.
          </div>
        ) : (
          <div style={{ overflowX: "auto", overflowY: "hidden", paddingBottom: 4 }}>
            <div style={{ minWidth: Math.max(despesasEvolutivas.length * 120, 720) }}>
            <ResponsiveContainer width="100%" height={alturaDespesasEvolutivas}>
              <BarChart data={despesasEvolutivas} barGap={10} margin={{ top: 12, right: 24, bottom: 12, left: 12 }}>
                <CartesianGrid {...CHART_THEME.gridVertical} />
                <XAxis dataKey="nome" tickFormatter={fmtNomeUnidade} {...CHART_THEME.axisX} />
                <YAxis tickFormatter={fmtAxisMoney} {...CHART_THEME.axisY} />
                {chartTooltip}
                <Bar dataKey="valor" name="Despesa" fill={PALETTE.vermelho} radius={CHART_THEME.barRadiusTop}>
                  <LabelList dataKey="valor" content={<LabelBarTopValue formatter={fmtCompactMoney} color={PALETTE.vermelho} />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      <div style={s.card}>
        <div style={s.titulo}>DESPESAS DA UNIDADE POR MES</div>
        <div style={{ color: PALETTE.textoSec, fontSize: 12, marginBottom: 14 }}>
          Cada unidade compara suas categorias de despesa ao longo dos meses disponiveis.
        </div>
        {unidadesComparativoMensalDespesas.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 220, color: PALETTE.textoSec, fontSize: 14 }}>
            Nao ha historico mensal de despesas para o filtro aplicado.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 18 }}>
            {unidadesComparativoMensalDespesas.map((unit: any) => (
              <div key={`${unit.nome}-mensal`} style={{ borderTop: `1px solid ${PALETTE.borda}`, paddingTop: 18 }}>
                <div style={{ color: PALETTE.texto, fontSize: 18, fontWeight: 800, letterSpacing: -0.2, marginBottom: 12 }}>
                  {unit.nome}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 14 }}>
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
                          background: "#182538",
                          border: `1px solid ${PALETTE.borda}`,
                          borderRadius: 12,
                          padding: "12px 14px",
                        }}
                      >
                        <div style={{ color: PALETTE.textoSec, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700, marginBottom: 6 }}>
                          {row.mesLabel}
                        </div>
                        <div style={{ color: PALETTE.texto, fontSize: 22, fontWeight: 800, letterSpacing: -0.4, marginBottom: 6 }}>
                          {fmtK(totalMes)}
                          <span style={{ color: PALETTE.textoSec, fontSize: 12, fontWeight: 700, marginLeft: 8 }}>
                            {fmtPct(totalMesPct)}
                          </span>
                        </div>
                        <div style={{ color: PALETTE.textoSec, fontSize: 12, marginBottom: 8 }}>
                          {principal ? `Maior categoria: ${principal.categoria}` : "Sem despesas no mês"}
                        </div>
                        {principal ? (
                          <div style={{ color: PALETTE.texto, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                            {fmtK(principal.valor)}
                            <span style={{ color: PALETTE.textoSec, marginLeft: 8 }}>{fmtPct(principal.pctFaturamento)}</span>
                          </div>
                        ) : null}
                        {entries.length > 0 ? (
                          <div style={{ display: "grid", gap: 6 }}>
                            {entries.map((item: any) => (
                              <div
                                key={`${unit.nome}-${row.mesLabel}-${item.categoria}`}
                                style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12 }}
                              >
                                <span style={{ color: PALETTE.textoSec }}>{item.categoria}</span>
                                <span style={{ color: PALETTE.texto, fontWeight: 700, whiteSpace: "nowrap" }}>
                                  {fmtK(item.valor)}
                                  <span style={{ color: PALETTE.textoSec, marginLeft: 8 }}>{fmtPct(item.pctFaturamento)}</span>
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <div style={{ width: "100%", minWidth: 0 }}>
                    <ResponsiveContainer width="100%" height={380}>
                      <BarChart data={unit.monthlyRows} barCategoryGap="10%" barGap={3} margin={{ top: 18, right: 18, bottom: 44, left: 0 }}>
                        <CartesianGrid {...CHART_THEME.gridVertical} />
                        <XAxis dataKey="mesLabel" {...CHART_THEME.axisX} />
                        <YAxis tickFormatter={fmtAxisMoney} {...CHART_THEME.axisY} />
                        {chartTooltip}
                        <Legend wrapperStyle={{ ...CHART_THEME.legend, fontSize: 11, paddingTop: 18 }} />
                        {unit.categorias.map((categoria: string, index: number) => (
                          <Bar
                            key={`${unit.nome}-${categoria}`}
                            dataKey={categoria}
                            name={categoria}
                            fill={[PALETTE.vermelho, PALETTE.laranja, PALETTE.azul, PALETTE.roxo, PALETTE.rosa, PALETTE.cinza, PALETTE.verde][index % 7]}
                            radius={CHART_THEME.barRadiusTop}
                            maxBarSize={24}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
    );
  };

  const abas = [AbaVisaoGeral, AbaPorUnidade, AbaPorGestoras, AbaCustos, AbaTendencia, AbaPessoas, AbaEvolutivos];
  const AbaAtual = abas[aba];

  return (
    <div style={s.page}>
      {/* HEADER */}
      <div style={s.header}>
        <div>
          <div style={s.logo}>FinDash Pro (Modelo Unificado)</div>
          <div style={{ color: PALETTE.textoSec, fontSize: 12, marginTop: 2 }}>
            Visualizacao padronizada - {unidades.length} unidades
            {dashboardMeta?.owner?.name ? ` - Proprietario: ${dashboardMeta.owner.name}` : ''}
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


