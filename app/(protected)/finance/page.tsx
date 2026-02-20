import { AccountType, PaymentMethod, Role } from "@prisma/client";
import Link from "next/link";

import {
  createAccountCategoryAction,
  createLedgerEntryAction,
} from "@/app/actions/finance-actions";
import { prisma } from "@/lib/prisma";
import { hasAnyRole } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import { formatCurrency, getDayRange, getMonthRange, toNumber } from "@/lib/utils";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const METHODS: PaymentMethod[] = ["PIX", "CREDIT", "DEBIT", "CASH", "VOUCHER", "FIADO"];

function getRange(period: "daily" | "monthly", baseDate: Date) {
  if (period === "monthly") {
    return getMonthRange(baseDate);
  }

  return getDayRange(baseDate);
}

export default async function FinancePage({ searchParams }: PageProps) {
  const user = await requireUser();

  if (!hasAnyRole(user.role, [Role.ADMIN, Role.MANAGER, Role.CASHIER])) {
    throw new Error("Sem permissão para financeiro.");
  }

  const query = await searchParams;
  const period = query.period === "monthly" ? "monthly" : "daily";
  const dateValue = String(query.date ?? "").trim();
  const baseDate = dateValue ? new Date(dateValue) : new Date();
  const { start, end } = getRange(period, baseDate);

  const [categories, entries, soldItems] = await Promise.all([
    prisma.accountCategory.findMany({
      orderBy: [{ type: "asc" }, { name: "asc" }],
    }),
    prisma.ledgerEntry.findMany({
      where: { date: { gte: start, lt: end } },
      include: {
        category: true,
        createdBy: { select: { name: true } },
      },
      orderBy: { date: "desc" },
    }),
    prisma.tabItem.findMany({
      where: {
        canceledAt: null,
        tab: {
          status: "PAID",
          closedAt: { gte: start, lt: end },
        },
      },
      select: {
        nameSnapshot: true,
        quantity: true,
        unitPriceSnapshot: true,
      },
    }),
  ]);

  const revenue = entries
    .filter((entry) => entry.category.type === AccountType.REVENUE)
    .reduce((sum, entry) => sum + toNumber(entry.amount), 0);
  const expenses = entries
    .filter((entry) => entry.category.type === AccountType.EXPENSE)
    .reduce((sum, entry) => sum + toNumber(entry.amount), 0);
  const balance = revenue - expenses;

  const revenueByMethod = METHODS.reduce<Record<PaymentMethod, number>>(
    (acc, method) => {
      acc[method] = entries
        .filter(
          (entry) =>
            entry.category.type === AccountType.REVENUE && entry.paymentMethod === method,
        )
        .reduce((sum, entry) => sum + toNumber(entry.amount), 0);
      return acc;
    },
    {
      PIX: 0,
      CREDIT: 0,
      DEBIT: 0,
      CASH: 0,
      VOUCHER: 0,
      FIADO: 0,
    },
  );

  const topProductsMap = new Map<string, { quantity: number; revenue: number }>();
  for (const item of soldItems) {
    const current = topProductsMap.get(item.nameSnapshot) ?? { quantity: 0, revenue: 0 };
    current.quantity += toNumber(item.quantity);
    current.revenue += toNumber(item.quantity) * toNumber(item.unitPriceSnapshot);
    topProductsMap.set(item.nameSnapshot, current);
  }

  const topProductsByQuantity = Array.from(topProductsMap.entries())
    .map(([name, values]) => ({ name, ...values }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);
  const topProductsByRevenue = Array.from(topProductsMap.entries())
    .map(([name, values]) => ({ name, ...values }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <form method="GET" className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Período</label>
              <select
                name="period"
                defaultValue={period}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="daily">Diário</option>
                <option value="monthly">Mensal</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Data base</label>
              <input
                type="date"
                name="date"
                defaultValue={
                  dateValue || new Date().toISOString().slice(0, 10)
                }
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              Atualizar
            </button>
          </form>
          <Link
            href="/cash-close"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
          >
            Ir para fechamento de caixa
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">Receita</p>
          <p className="text-2xl font-bold text-emerald-700">{formatCurrency(revenue)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">Despesas</p>
          <p className="text-2xl font-bold text-rose-700">{formatCurrency(expenses)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">Saldo</p>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(balance)}</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-base font-semibold text-slate-900">Lançamento manual</h3>
          <form action={createLedgerEntryAction} className="grid gap-3 md:grid-cols-2">
            <input
              type="date"
              name="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              name="categoryId"
              required
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  [{category.type}] {category.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              min="0.01"
              name="amount"
              required
              placeholder="Valor"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              name="paymentMethod"
              defaultValue="NONE"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="NONE">Sem método</option>
              {METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
            <input
              type="text"
              name="description"
              required
              placeholder="Descrição"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm md:col-span-2"
            />
            <div className="md:col-span-2">
              <button
                type="submit"
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              >
                Salvar lançamento
              </button>
            </div>
          </form>
        </section>

        {hasAnyRole(user.role, [Role.ADMIN, Role.MANAGER]) ? (
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-base font-semibold text-slate-900">Nova categoria</h3>
            <form action={createAccountCategoryAction} className="grid gap-3 md:grid-cols-2">
              <input
                name="name"
                placeholder="Nome da categoria"
                required
                className="rounded-md border border-slate-300 px-3 py-2 text-sm md:col-span-2"
              />
              <select
                name="type"
                defaultValue="EXPENSE"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="REVENUE">Receita</option>
                <option value="EXPENSE">Despesa</option>
              </select>
              <select
                name="parentId"
                defaultValue=""
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Sem categoria pai</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    [{category.type}] {category.name}
                  </option>
                ))}
              </select>
              <div className="md:col-span-2">
                <button
                  type="submit"
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Criar categoria
                </button>
              </div>
            </form>
          </section>
        ) : null}
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-base font-semibold text-slate-900">Receita por método</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {METHODS.map((method) => (
            <div key={method} className="rounded-md border border-slate-200 p-3">
              <p className="text-xs text-slate-600">{method}</p>
              <p className="text-lg font-semibold text-slate-900">
                {formatCurrency(revenueByMethod[method])}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-base font-semibold text-slate-900">
            Top produtos (quantidade)
          </h3>
          <ul className="space-y-2 text-sm">
            {topProductsByQuantity.map((product) => (
              <li key={product.name} className="rounded-md bg-slate-50 px-3 py-2">
                {product.name}: {product.quantity.toFixed(3)}
              </li>
            ))}
            {topProductsByQuantity.length === 0 ? (
              <li className="text-slate-500">Sem vendas no período.</li>
            ) : null}
          </ul>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-base font-semibold text-slate-900">
            Top produtos (receita)
          </h3>
          <ul className="space-y-2 text-sm">
            {topProductsByRevenue.map((product) => (
              <li key={product.name} className="rounded-md bg-slate-50 px-3 py-2">
                {product.name}: {formatCurrency(product.revenue)}
              </li>
            ))}
            {topProductsByRevenue.length === 0 ? (
              <li className="text-slate-500">Sem vendas no período.</li>
            ) : null}
          </ul>
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-base font-semibold text-slate-900">Lançamentos</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2 pr-3">Data</th>
                <th className="py-2 pr-3">Categoria</th>
                <th className="py-2 pr-3">Descrição</th>
                <th className="py-2 pr-3">Método</th>
                <th className="py-2 pr-3">Valor</th>
                <th className="py-2 pr-3">Usuário</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t border-slate-100">
                  <td className="py-2 pr-3 text-slate-700">
                    {new Intl.DateTimeFormat("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(entry.date)}
                  </td>
                  <td className="py-2 pr-3 text-slate-700">
                    [{entry.category.type}] {entry.category.name}
                  </td>
                  <td className="py-2 pr-3 text-slate-700">{entry.description}</td>
                  <td className="py-2 pr-3 text-slate-700">{entry.paymentMethod ?? "-"}</td>
                  <td className="py-2 pr-3 text-slate-700">
                    {formatCurrency(toNumber(entry.amount))}
                  </td>
                  <td className="py-2 pr-3 text-slate-700">{entry.createdBy.name}</td>
                </tr>
              ))}
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-3 text-sm text-slate-500">
                    Nenhum lançamento no período selecionado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

