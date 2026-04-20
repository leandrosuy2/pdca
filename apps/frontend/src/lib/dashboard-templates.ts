export const DASHBOARD_TEMPLATE_OPTIONS = [
  {
    value: 'RESTAURANTE',
    label: 'Restaurante',
    slug: 'restaurante',
    description: 'Modelo atual com foco em faturamento, despesas, folha e lucratividade por unidade.',
  },
  {
    value: 'COZINHA',
    label: 'Cozinha',
    slug: 'cozinha',
    description: 'Modelo para operacao de cozinha, producao, insumos, desperdicio e centros produtivos.',
  },
  {
    value: 'FINANCEIRO',
    label: 'Financeiro',
    slug: 'financeiro',
    description: 'Modelo para analise financeira consolidada, contas, centros de custo e classificacoes.',
  },
] as const;

export const getDashboardTemplateMeta = (value: unknown) =>
  DASHBOARD_TEMPLATE_OPTIONS.find((item) => item.value === value) || DASHBOARD_TEMPLATE_OPTIONS[0];
