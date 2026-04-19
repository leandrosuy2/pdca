export type DynamicKpiDefinition = {
  key: string;
  label: string;
  total: number;
  sourceColumn: string;
  kind: 'primary' | 'extra';
};

type BuildDynamicKpisOptions<T> = {
  items: T[];
  bucketSelector: (item: T) => string;
  valueSelector: (item: T) => number;
  primaryBuckets?: string[];
  sourceColumn: string;
  labelMap?: Record<string, string>;
};

const normalizeBucketKey = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

const toTitleCase = (value: string) =>
  String(value || '')
    .toLowerCase()
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export const buildDynamicKpis = <T>({
  items,
  bucketSelector,
  valueSelector,
  primaryBuckets = [],
  sourceColumn,
  labelMap = {},
}: BuildDynamicKpisOptions<T>) => {
  const totals: Record<string, number> = {};
  const primarySet = new Set(primaryBuckets.map(normalizeBucketKey));

  for (const item of items) {
    const bucket = normalizeBucketKey(bucketSelector(item));
    if (!bucket) continue;
    const value = Number(valueSelector(item));
    if (!Number.isFinite(value)) continue;
    totals[bucket] = (totals[bucket] || 0) + value;
  }

  const primaryTotals = Object.fromEntries(
    Array.from(primarySet.values()).map((bucket) => [bucket, totals[bucket] || 0]),
  );

  const otherTotals = Object.fromEntries(
    Object.entries(totals).filter(([bucket]) => !primarySet.has(bucket)),
  );

  const dynamicKpis: DynamicKpiDefinition[] = Object.entries(totals)
    .map(([bucket, total]) => ({
      key: bucket,
      label: labelMap[bucket] || toTitleCase(bucket),
      total,
      sourceColumn,
      kind: (primarySet.has(bucket) ? 'primary' : 'extra') as 'primary' | 'extra',
    }))
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'primary' ? -1 : 1;
      return b.total - a.total;
    });

  return {
    totals,
    primaryTotals,
    otherTotals,
    dynamicKpis,
  };
};
