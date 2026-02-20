# Tamales Bar - Gestão de Comandas, Caixa e Balancete

MVP web para operação de bar com foco em:
- Comandas (abertura, itens, cobrança, split payment)
- Caixa (pagamentos e fechamento por método)
- Balancete (receitas, despesas e relatórios essenciais)
- RBAC + Auditoria

## Stack
- Next.js (App Router) + TypeScript + Tailwind
- PostgreSQL + Prisma
- NextAuth (Credentials) + bcrypt
- Zod
- Docker Compose (`app + postgres`)

## Perfis (RBAC)
- `ADMIN`
- `MANAGER`
- `CASHIER`
- `WAITER`
- `STOCK`

## Fluxo padrão implementado
- Comanda inicia em `OPEN`.
- Pode ir para `BILLING` para cobrança.
- Em `BILLING`, pode continuar adicionando itens conforme configuração (`allowAddItemsWhenBilling`).
- Em `PAID`, alterações ficam bloqueadas (exceto override de `ADMIN`, que reabre para `BILLING`).
- Cancelamento de item exige motivo e papel autorizado (`ADMIN`, `MANAGER`, `CASHIER`).
- Pagamentos podem ser fracionados por múltiplos métodos.
- Ao marcar comanda como `PAID`:
  - gera saída automática de estoque para produtos com `controlsStock=true`;
  - gera lançamentos de receita no balancete por método de pagamento.

## Configurações flexíveis (tabela `Settings`)
- `allowAddItemsWhenBilling` (default: `true`)
- `defaultServiceFeePercent` (default: `10`)
- `enableStockModule` (default: `true`)
- `enableCustomerFields` (default: `false`)

## Entidades principais
- `User`, `Settings`, `AuditLog`
- `Tab`, `TabItem`, `Payment`
- `Product`, `StockMovement`
- `AccountCategory`, `LedgerEntry`, `CashClose`

## Rodando com Docker
1. Ajuste os valores em `.env` (opcional). Exemplo base em `.env.example`.
2. Suba tudo:

```bash
docker compose up --build
```

3. Acesse: `http://localhost:3000`

O container da aplicação executa automaticamente:
- `prisma migrate deploy`
- `prisma db seed`
- `next build` + `next start`

## Rodando local (sem container da app)
1. Suba apenas o banco:

```bash
docker compose up -d db
```

2. Configure `.env` com:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bar_system?schema=public
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=dev-secret-123456
SEED_DEFAULT_PASSWORD=123456
```

3. Instale e prepare banco:

```bash
npm install
npx prisma generate
npm run prisma:migrate
npm run prisma:seed
```

4. Rode a aplicação:

```bash
npm run dev
```

## Credenciais seed
- Todas as contas de seed usam senha `123456` (apenas teste):
- `admin@local` (`ADMIN`)
- `manager@local` (`MANAGER`)
- `cashier@local` (`CASHIER`)
- `waiter@local` (`WAITER`)
- `stock@local` (`STOCK`)

## Categorias financeiras seed
- Receita: `Vendas`, `Outras Receitas`
- Despesa: `Fornecedores`, `Aluguel`, `Taxas`, `Salários`, `Utilidades`, `Gás`, `Gelo`

## Testes
Executa testes unitários de:
- cálculo de totais da comanda (desconto/taxa),
- regras de status (`OPEN`/`BILLING`/`PAID`),
- geração de lançamentos por método.

```bash
npm run test
```

## Estrutura resumida
- `prisma/schema.prisma`: domínio completo e relacionamentos
- `prisma/migrations`: migração inicial
- `prisma/seed.ts`: dados iniciais
- `app/actions/*`: regras de negócio com validação Zod, RBAC e auditoria
- `app/(protected)/*`: telas de operação
- `lib/domain/*`: regras puras testáveis
