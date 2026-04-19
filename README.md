# PDCA — Dashboards financeiros e operacionais

Sistema web para **importar planilhas**, consolidar **receitas e despesas** por **unidade**, **categoria** e **gestora**, e visualizar **indicadores**, gráficos e rankings em dashboards com controle de acesso.

---

## Visão geral

| Camada | Tecnologia |
|--------|------------|
| API | [NestJS](https://nestjs.com/) 10, Prisma, PostgreSQL |
| Autenticação | JWT (Bearer), bcrypt |
| Frontend | [Next.js](https://nextjs.org/) 14 (App Router), React 18, Tailwind CSS, Recharts |
| Importação | Planilhas Excel (`.xlsx`) via biblioteca `xlsx` |

O backend expõe endpoints REST sob autenticação; o frontend consome a API, guarda o token em **cookie** (`token`) e protege rotas com **middleware**.

---

## Monorepo (npm workspaces + Turborepo)

O repositório é um **monorepo** com pacotes em `apps/` e orquestração na raiz.

| Pacote npm | Pasta | Descrição |
|--------------|-------|-----------|
| `@pdca/web` | `apps/frontend` | Interface Next.js |
| `@pdca/api` | `apps/backend` | API NestJS + Prisma |

**Na raiz** (`PDCA-main/`):

```bash
npm install
npm run dev      # Turbo: API + Next em paralelo
npm run build    # Build de todos os apps
npm run start    # Produção: build + API + Next (Supervisor/Docker na raiz)
npm run start:api   # Só Nest (build + node dist/src/main.js)
npm run start:web   # Só Next (build + next start)
npm run lint     # Lint em paralelo
```

**Prisma** (executado no workspace da API):

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:studio
```

**Variáveis de ambiente:** `apps/backend/.env` e `apps/frontend/.env` ficam **versionados** neste repo (ajuste valores no clone se precisar). O Next lê só `.env` em `apps/frontend/`.

---

## Funcionalidades principais

- Login com JWT e perfis **ADMIN** e **USER**
- **Múltiplos dashboards** por usuário, com dashboard **padrão** e compartilhamento via **DashboardAccess**
- Administrador enxerga **todos** os dashboards; usuário comum vê apenas os **próprios** ou **liberados**
- Painéis: visão geral (KPIs, série mensal, ranking), **unidades**, **custos**, **pessoas/folha**, **tendências acumuladas**, análise por **gestoras**
- **Importação Excel** com dois modos: planilha **tabular genérica** (colunas com aliases) ou **abas estruturadas** (Faturamento, Despesas, Salários/Folha)
- Seed opcional com usuário admin e dados de exemplo

---

## Arquitetura do repositório

```mermaid
flowchart LR
  subgraph cliente["Navegador"]
    UI[Next.js UI]
  end
  subgraph servidor["Servidor local"]
    API[NestJS API :3001]
    DB[(PostgreSQL)]
  end
  UI -->|HTTP + JWT| API
  API -->|Prisma| DB
```

```mermaid
flowchart TB
  subgraph raiz["pdca — raiz do repo"]
    TB[turbo.json + package.json workspaces]
    subgraph apps["apps/"]
      WEB["@pdca/web — Next.js :3000"]
      API["@pdca/api — NestJS :3001"]
    end
    PR["Prisma — apps/backend/prisma"]
  end
  WEB -.->|HTTP + JWT| API
  API --> PR
  TB -.-> apps
```

---

## Fluxograma: acesso ao sistema (login e rotas)

```mermaid
flowchart TD
  A[Usuário acessa o site] --> B{URL é /login?}
  B -->|Sim| C{Tem cookie token?}
  C -->|Sim| D[Redireciona para /dashboards]
  C -->|Não| E[Exibe página de login]
  B -->|Não| F{Rota protegida?}
  F -->|/dashboard /dashboards /admin| G{Tem cookie token?}
  G -->|Não| H[Redireciona para /login]
  G -->|Sim| I[Continua para a página]
  F -->|Outras| I
  E --> J[POST /auth/login]
  J --> K{Credenciais válidas?}
  K -->|Sim| L[Salva token e entra nos dashboards]
  K -->|Não| M[Mensagem de erro]
```

Rotas consideradas protegidas pelo middleware: `/`, `/login`, `/dashboard/*`, `/dashboards/*`, `/admin/*` (com lógica específica para público vs autenticado).

---

## Fluxograma: escopo de um dashboard e chamadas à API

```mermaid
flowchart TD
  A[Usuário escolhe um dashboard no catálogo] --> B[Frontend envia dashboardId nas queries]
  B --> C[GET /dashboard/* com Authorization Bearer]
  C --> D{Backend resolve contexto}
  D --> E{Usuário é ADMIN ou tem acesso ao dashboard?}
  E -->|Não| F[403 Forbidden]
  E -->|Sim| G[Consultas usam userId do DONO do dashboard scopedUserId]
  G --> H[Agregações: overview units costs managers trends people]
```

Administradores importam dados em nome do **dono** do dashboard selecionado; usuários comuns só importam no dashboard que **possuem** ou conforme regra de permissão implementada no serviço.

---

## Fluxograma: importação de planilha Excel

```mermaid
flowchart TD
  A[POST /dashboard/import multipart file] --> B{Arquivo presente?}
  B -->|Não| C[400 Bad Request]
  B -->|Sim| D{Permissão no dashboard?}
  D -->|Não| E[403 Forbidden]
  D -->|Sim| F[Lê workbook xlsx]
  F --> G{Tem linhas de abas estruturadas?}
  G -->|Sim| H[Parse DESPESAS + FATURAMENTO + SALÁRIOS/FOLHA]
  G -->|Não| I[Parse planilha plana: Unidade Valor Mês Tipo etc.]
  H --> J{Linhas válidas > 0?}
  I --> J
  J -->|Não| K[400 Nenhuma linha válida]
  J -->|Sim| L[Transação Prisma: apaga transações unidades categorias do dono]
  L --> M[Recria Unidades Categorias e Transações em lote]
  M --> N[200 Resumo total importado]
```

**Importante:** a importação **substitui** todas as transações, unidades e categorias do usuário **dono** do dashboard alvo (conforme implementação atual em `DashboardService.importExcel`).

---

## Modelo de dados (simplificado)

```mermaid
erDiagram
  User ||--o{ Unidade : possui
  User ||--o{ Categoria : possui
  User ||--o{ Transacao : possui
  User ||--o{ Dashboard : dono
  User ||--o{ DashboardAccess : acesso
  Dashboard ||--o{ DashboardAccess : compartilha
  Unidade ||--o{ Transacao : classifica
  Categoria ||--o{ Transacao : classifica

  User {
    uuid id PK
    string email UK
    string password
    string role
    boolean active
  }
  Dashboard {
    uuid id PK
    string name
    string slug UK
    uuid ownerId FK
    boolean isDefault
  }
  Transacao {
    uuid id PK
    string description
    string gestora
    float amount
    datetime date
    string type
    int qtdFunc
  }
```

---

## Pré-requisitos

- [Node.js](https://nodejs.org/) (recomendado: LTS)
- [PostgreSQL](https://www.postgresql.org/) em execução
- npm (ou pnpm/yarn, ajustando os comandos)

---

## Configuração (primeira vez)

1. **PostgreSQL** acessível e banco criado.

2. Na **raiz** do repositório:

```bash
npm install
```

3. Crie `apps/backend/.env` (o Nest também resolve este caminho quando você sobe a API pela **raiz** do monorepo com Turbo):

```env
DATABASE_URL="postgresql://USUARIO:SENHA@localhost:5432/NOME_DO_BANCO?schema=public"
JWT_SECRET="uma-chave-secreta-forte"
PORT=3001
```

Sem `JWT_SECRET`, o login quebra com `secretOrPrivateKey must have a value`.

4. Migrações e seed (opcional):

```bash
npm run db:migrate
npm run db:seed
```

O seed (`apps/backend/prisma/seed.ts`) **zera** usuários e dados relacionados e recria um cenário completo de demonstração (vários usuários, dashboards, unidades, categorias, transações com gestoras e folha). **Senha de todos os logins de demo:** `123456`.

| E-mail | Perfil |
|--------|--------|
| `admin@pdca.com` | ADMIN |
| `maria.silva@pdca.com` | USER (dados ricos, 2 dashboards) |
| `carlos.oliveira@pdca.com` | USER |
| `ana.santos@pdca.com` | USER (acesso VIEW ao dashboard da Maria) |
| `inativo@pdca.com` | USER inativo (login bloqueado) |

> Não rode o seed em produção se precisar manter dados. Altere senhas em ambientes reais.

5. (Opcional) Em `apps/frontend/.env`, ajuste `NEXT_PUBLIC_API_URL` se a API não for `http://localhost:3001`.

6. Desenvolvimento — **na raiz**:

```bash
npm run dev
```

Isso sobe **Nest** (`http://localhost:3001` ou `PORT`) e **Next** (`http://localhost:3000`) em paralelo via Turborepo. Endpoint de saúde: `GET /health`.

**Rodar um app só:**

```bash
npm run dev -w @pdca/api
npm run dev -w @pdca/web
```

---

## Endpoints principais da API

| Método | Caminho | Descrição |
|--------|---------|-----------|
| `POST` | `/auth/login` | Corpo: `{ "email", "password" }` → `{ access_token, user }` |
| `GET` | `/health` | Saúde do serviço |
| `GET` | `/dashboard/catalog` | Lista dashboards (JWT) |
| `GET` | `/dashboard/catalog/:dashboardId` | Metadados de um dashboard |
| `GET` | `/dashboard/overview` | KPIs e gráficos (query: `dashboardId`, `month` YYYY-MM) |
| `GET` | `/dashboard/units` | Dados por unidade |
| `GET` | `/dashboard/costs` | Despesas por categoria |
| `GET` | `/dashboard/managers` | Consolidação por gestora |
| `GET` | `/dashboard/trends` | Tendências acumuladas |
| `GET` | `/dashboard/people` | Pessoas / folha por unidade |
| `POST` | `/dashboard/import` | Upload `file` (multipart); query `dashboardId` quando admin |

Todos os endpoints em `/dashboard/*` exigem header:

`Authorization: Bearer <access_token>`

---

## Estrutura de pastas (resumo)

```
PDCA-main/
├── package.json              ← workspaces + scripts turbo
├── turbo.json
├── apps/
│   ├── backend/              ← @pdca/api (NestJS)
│   │   ├── prisma/
│   │   └── src/
│   └── frontend/             ← @pdca/web (Next.js)
│       └── src/
│           ├── app/
│           ├── components/dashboard/
│           └── lib/api-url.ts   ← base URL da API (env)
└── README.md
```

---

## Conceitos de negócio úteis

- **Receita / Despesa:** campo `type` da transação (`RECEITA` ou `DESPESA`).
- **FOPAG (folha):** despesas classificadas como categoria **PROVENTOS** ou **ENCARGOS FOLHA** (ou equivalente na descrição) entram nos cálculos de massa salarial.
- **Funcionários (`qtdFunc`):** usado para métricas por cabeça; o serviço usa **máximo por unidade no mês** onde aplicável para evitar duplicação por múltiplas linhas.
- **Gestora:** campo opcional nas transações para agrupar resultados por responsável.

---

## Produção e segurança

- **`npm start` na raiz** existe para PaaS/Supervisor: executa **build** e sobe API + frontend. Avisos `deprecated` no `npm install` vêm sobretudo de dependências **transitivas** (eslint, glob, etc.); `npm audit` ajuda a priorizar correções. O erro `unix:///var/run/supervisor.sock` é do **host/supervisor**, não do Node.
- Restrinja **CORS** (`apps/backend/src/main.ts` hoje usa `origin: '*'`) ao domínio do frontend.
- Use `JWT_SECRET` forte e rotação de credenciais.
- Configure HTTPS e cookies com flags adequadas (`Secure`, `SameSite`) se unificar API e UI no mesmo domínio.

---

## Licença

Conforme `apps/backend/package.json`: campo `license` indica **UNLICENSED** — defina a licença do projeto conforme a decisão da equipe.

---

Documentação gerada para facilitar onboarding e manutenção. Diagramas em [Mermaid](https://mermaid.js.org/): renderizam no GitHub, no GitLab e em extensões de Markdown no VS Code/Cursor.
