export const DASHBOARD_TEMPLATES = ['RESTAURANTE', 'COZINHA', 'FINANCEIRO'] as const;

export type DashboardTemplateCode = (typeof DASHBOARD_TEMPLATES)[number];

type TemplateAliases = {
  month: string[];
  unit: string[];
  value: string[];
  type: string[];
  category: string[];
  manager: string[];
  year: string[];
  headcount: string[];
};

type DashboardTemplateDefinition = {
  key: DashboardTemplateCode;
  slug: 'restaurante' | 'cozinha' | 'financeiro';
  label: string;
  description: string;
  importHint: string;
  supportsStructuredSheets: boolean;
  aliases: TemplateAliases;
};

export const DASHBOARD_TEMPLATE_DEFINITIONS: Record<
  DashboardTemplateCode,
  DashboardTemplateDefinition
> = {
  RESTAURANTE: {
    key: 'RESTAURANTE',
    slug: 'restaurante',
    label: 'Restaurante',
    description:
      'Modelo operacional atual, com leitura de faturamento, despesas, folha e lucratividade por unidade.',
    importHint:
      'Aceita o layout atual do restaurante e tambem planilhas planas com colunas de unidade, valor, tipo, categoria, gestora e competencia.',
    supportsStructuredSheets: true,
    aliases: {
      month: ['MES', 'MÊS', 'COMPETENCIA', 'COMPETÊNCIA', 'PERIODO', 'PERÍODO', 'DATA', 'MES_ANO', 'MÊS/ANO'],
      unit: ['UNIDADE', 'UNID', 'CENTRO DE CUSTO'],
      value: ['VALOR', 'VALOR TOTAL', 'VLR', 'VLR_TOTAL'],
      type: ['TIPO', 'TIPO_LANCAMENTO'],
      category: ['DEFINICAO', 'DEFINIÇÃO', 'CATEGORIA', 'NATUREZA'],
      manager: ['GESTORA', 'GESTOR', 'RESPONSAVEL', 'RESPONSÁVEL'],
      year: ['ANO', 'EXERCICIO', 'EXERCÍCIO', 'DATA'],
      headcount: ['QTD FUNC', 'QTD_FUNC', 'QTD FUNCIONARIOS', 'QTD_FUNCIONARIOS', 'QTD'],
    },
  },
  COZINHA: {
    key: 'COZINHA',
    slug: 'cozinha',
    label: 'Cozinha',
    description:
      'Modelo voltado para operacao de cozinha, producao, insumos, desperdicio e centros produtivos.',
    importHint:
      'Aceita planilhas planas com nomenclaturas de cozinha, como setor, producao, insumo, desperdicio, responsavel e quantidade de equipe.',
    supportsStructuredSheets: false,
    aliases: {
      month: ['MES', 'MÊS', 'COMPETENCIA', 'COMPETÊNCIA', 'PERIODO', 'PERÍODO', 'DATA', 'REFERENCIA', 'REFERÊNCIA'],
      unit: ['UNIDADE', 'SETOR', 'COZINHA', 'CENTRO PRODUTIVO', 'CENTRO DE PRODUCAO', 'CENTRO DE PRODUÇÃO'],
      value: ['VALOR', 'CUSTO', 'VALOR TOTAL', 'TOTAL', 'VLR'],
      type: ['TIPO', 'NATUREZA', 'MOVIMENTO', 'CLASSIFICACAO', 'CLASSIFICAÇÃO'],
      category: ['CATEGORIA', 'INSUMO', 'GRUPO', 'PROCESSO', 'FAMILIA', 'FAMÍLIA'],
      manager: ['GESTORA', 'GESTOR', 'RESPONSAVEL', 'RESPONSÁVEL', 'COORDENADOR', 'LIDER'],
      year: ['ANO', 'EXERCICIO', 'EXERCÍCIO', 'DATA', 'REFERENCIA', 'REFERÊNCIA'],
      headcount: ['QTD FUNC', 'QTD_FUNC', 'QTD COLABORADORES', 'QTD EQUIPE', 'FUNCIONARIOS', 'FUNCIONÁRIOS'],
    },
  },
  FINANCEIRO: {
    key: 'FINANCEIRO',
    slug: 'financeiro',
    label: 'Financeiro',
    description:
      'Modelo para analise financeira consolidada, com contas, centros de custo, receitas, despesas e classificacoes financeiras.',
    importHint:
      'Aceita planilhas planas com nomenclaturas financeiras, como conta, centro de custo, classificacao, credito, debito e valor liquido.',
    supportsStructuredSheets: false,
    aliases: {
      month: ['MES', 'MÊS', 'COMPETENCIA', 'COMPETÊNCIA', 'PERIODO', 'PERÍODO', 'DATA', 'DATA LANCAMENTO', 'DATA LANÇAMENTO'],
      unit: ['UNIDADE', 'EMPRESA', 'FILIAL', 'CENTRO DE CUSTO', 'CC', 'AREA', 'ÁREA'],
      value: ['VALOR', 'VALOR LIQUIDO', 'VALOR LÍQUIDO', 'LANCAMENTO', 'LANÇAMENTO', 'CREDITO', 'CRÉDITO', 'DEBITO', 'DÉBITO'],
      type: ['TIPO', 'NATUREZA', 'CLASSIFICACAO', 'CLASSIFICAÇÃO', 'OPERACAO', 'OPERAÇÃO'],
      category: ['CATEGORIA', 'CONTA', 'PLANO DE CONTAS', 'CLASSIFICACAO', 'CLASSIFICAÇÃO', 'SUBGRUPO'],
      manager: ['GESTORA', 'GESTOR', 'RESPONSAVEL', 'RESPONSÁVEL', 'DIRETORIA', 'AREA', 'ÁREA'],
      year: ['ANO', 'EXERCICIO', 'EXERCÍCIO', 'DATA', 'COMPETENCIA', 'COMPETÊNCIA'],
      headcount: ['QTD FUNC', 'QTD_FUNC', 'HEADCOUNT', 'COLABORADORES', 'FUNCIONARIOS', 'FUNCIONÁRIOS'],
    },
  },
};

export const normalizeDashboardTemplate = (value: unknown): DashboardTemplateCode => {
  const normalized = String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  if (normalized === 'RESTAURANTE') return 'RESTAURANTE';
  if (normalized === 'COZINHA') return 'COZINHA';
  if (normalized === 'FINANCEIRO') return 'FINANCEIRO';
  return 'RESTAURANTE';
};
