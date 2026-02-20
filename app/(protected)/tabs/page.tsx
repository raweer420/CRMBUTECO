import { Prisma, Role, TabStatus } from "@prisma/client";
import Link from "next/link";

import { createTabAction } from "@/app/actions/tab-actions";
import { calculateTabTotals } from "@/lib/domain/tabs";
import { prisma } from "@/lib/prisma";
import { hasAnyRole } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import { formatCurrency, toNumber } from "@/lib/utils";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function dateRangeFromISO(rawDate: string) {
  const day = new Date(rawDate);
  day.setHours(0, 0, 0, 0);
  const next = new Date(day);
  next.setDate(next.getDate() + 1);
  return { day, next };
}

export default async function TabsPage({ searchParams }: PageProps) {
  const user = await requireUser();

  if (
    !hasAnyRole(user.role, [Role.ADMIN, Role.MANAGER, Role.CASHIER, Role.WAITER])
  ) {
    throw new Error("Sem permissão para comandas.");
  }

  const params = await searchParams;
  const statusParam = String(params.status ?? "");
  const dateParam = String(params.date ?? "");
  const tableParam = String(params.table ?? "");

  const where: Prisma.TabWhereInput = {};

  if (
    statusParam &&
    ["OPEN", "BILLING", "PAID", "CANCELED"].includes(statusParam.toUpperCase())
  ) {
    where.status = statusParam.toUpperCase() as TabStatus;
  }

  if (dateParam) {
    const { day, next } = dateRangeFromISO(dateParam);
    where.openedAt = { gte: day, lt: next };
  }

  if (tableParam && Number.isFinite(Number(tableParam))) {
    where.tableNumber = Number(tableParam);
  }

  const [settings, tabs] = await Promise.all([
    prisma.settings.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1 },
    }),
    prisma.tab.findMany({
      where,
      orderBy: { openedAt: "desc" },
      include: {
        items: {
          select: {
            quantity: true,
            unitPriceSnapshot: true,
            canceledAt: true,
          },
        },
        payments: {
          select: {
            amount: true,
          },
        },
      },
      take: 120,
    }),
  ]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Abrir comanda</h2>
          <form action={createTabAction} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Tipo</label>
              <select
                name="kind"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                defaultValue="TABLE"
              >
                <option value="TABLE">Mesa</option>
                <option value="BAR">Balcão</option>
                <option value="DELIVERY">Delivery</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Número da mesa
              </label>
              <input
                name="tableNumber"
                type="number"
                min={1}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Opcional"
              />
            </div>
            {settings.enableCustomerFields ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Nome do cliente
                </label>
                <input
                  name="customerName"
                  type="text"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Opcional"
                />
              </div>
            ) : null}
            <button
              type="submit"
              className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Criar comanda
            </button>
          </form>
          <p className="mt-3 text-xs text-slate-500">
            Taxa de serviço padrão: {toNumber(settings.defaultServiceFeePercent)}%
          </p>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Filtros</h2>
          <form method="GET" className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Status</label>
              <select
                name="status"
                defaultValue={statusParam}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Todos</option>
                <option value="OPEN">Aberta</option>
                <option value="BILLING">Cobrança</option>
                <option value="PAID">Paga</option>
                <option value="CANCELED">Cancelada</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Data</label>
              <input
                name="date"
                type="date"
                defaultValue={dateParam}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Mesa</label>
              <input
                name="table"
                type="number"
                min={1}
                defaultValue={tableParam}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Ex: 12"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              >
                Filtrar
              </button>
              <Link
                href="/tabs"
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Limpar
              </Link>
            </div>
          </form>
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2 pr-3">Código</th>
                <th className="py-2 pr-3">Tipo</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Mesa/Cliente</th>
                <th className="py-2 pr-3">Total</th>
                <th className="py-2 pr-3">Pago</th>
                <th className="py-2 pr-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {tabs.map((tab) => {
                const totals = calculateTabTotals(
                  tab.items.map((item) => ({
                    quantity: toNumber(item.quantity),
                    unitPrice: toNumber(item.unitPriceSnapshot),
                    canceled: Boolean(item.canceledAt),
                  })),
                  toNumber(tab.discount),
                  toNumber(tab.serviceFeePercent),
                );
                const paid = tab.payments.reduce(
                  (sum, payment) => sum + toNumber(payment.amount),
                  0,
                );

                return (
                  <tr key={tab.id} className="border-t border-slate-100">
                    <td className="py-2 pr-3 font-medium text-slate-900">{tab.code}</td>
                    <td className="py-2 pr-3 text-slate-700">{tab.kind}</td>
                    <td className="py-2 pr-3 text-slate-700">{tab.status}</td>
                    <td className="py-2 pr-3 text-slate-700">
                      {tab.tableNumber ? `Mesa ${tab.tableNumber}` : tab.customerName ?? "-"}
                    </td>
                    <td className="py-2 pr-3 text-slate-700">{formatCurrency(totals.total)}</td>
                    <td className="py-2 pr-3 text-slate-700">{formatCurrency(paid)}</td>
                    <td className="py-2 pr-3">
                      <div className="flex gap-3">
                        <Link href={`/tabs/${tab.id}?mode=waiter`} className="underline">
                          Garçom
                        </Link>
                        <Link href={`/tabs/${tab.id}?mode=cashier`} className="underline">
                          Caixa
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {tabs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-3 text-sm text-slate-500">
                    Nenhuma comanda encontrada.
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

