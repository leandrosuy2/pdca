const xlsx = require('../node_modules/xlsx');

const normalizeText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

const buildDynamicKpisFromRows = ({
  rows,
  bucketColumn,
  valueColumn,
  primaryBuckets = [],
}) => {
  const totals = {};
  const primarySet = new Set(primaryBuckets.map(normalizeText));

  for (const row of rows) {
    const bucket = normalizeText(row[bucketColumn]);
    const value = Number(row[valueColumn] || 0) || 0;
    if (!bucket || !Number.isFinite(value)) continue;
    totals[bucket] = (totals[bucket] || 0) + value;
  }

  const primaryTotals = Object.fromEntries(
    Array.from(primarySet.values()).map((bucket) => [bucket, totals[bucket] || 0]),
  );

  const extras = Object.fromEntries(
    Object.entries(totals).filter(([bucket]) => !primarySet.has(bucket)),
  );

  return { totals, primaryTotals, extras };
};

const [, , filePath, bucketColumn = 'Tipo', valueColumn = 'Valor'] = process.argv;

if (!filePath) {
  console.error('Uso: node scripts/preview-dynamic-kpis.js "<arquivo.xlsx>" [colunaBucket] [colunaValor]');
  process.exit(1);
}

const workbook = xlsx.readFile(filePath);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

const result = buildDynamicKpisFromRows({
  rows,
  bucketColumn,
  valueColumn,
  primaryBuckets: ['Receita', 'Despesa'],
});

console.log(JSON.stringify({
  filePath,
  sheet: workbook.SheetNames[0],
  bucketColumn,
  valueColumn,
  ...result,
}, null, 2));
