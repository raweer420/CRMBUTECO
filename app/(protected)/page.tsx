import { TabStatus } from "@prisma/client";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { formatCurrency, getDayRange, toNumber } from "@/lib/utils";

export default async function DashboardPage() {
  await requireUser();

  const { start, end } = getDayRange(new Date());

  const [openCount, billingCount, paidToday, recentTabs, recentCashClose] = await Promise.all(
    [
      prisma.tab.count({ where: { status: TabStatus.OPEN } }),
      prisma.tab.count({ where: { status: TabStatus.BILLING } }),
      prisma.tab.findMany({
        where: {
          status: TabStatus.PAID,
          closedAt: { gte: start, lt: end },
        },
        select: { id: true, payments: { select: { amount: true } } },
      }),
      prisma.tab.findMany({
        orderBy: { openedAt: "desc" },
        take: 8,
        select: {
          id: true,
          code: true,
          kind: true,
          status: true,
          openedAt: true,
          tableNumber: true,
          customerName: true,
        },
      }),
      prisma.cashClose.findFirst({
        orderBy: { closedAt: "desc" },
      }),
    ],
  );

  const paidTodayTotal = paidToday.reduce(
    (sum, tab) =>
      sum + tab.payments.reduce((acc, payment) => acc + toNumber(payment.amount), 0),
    0,
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">Comandas abertas</p>
          <p className="text-2xl font-bold text-slate-900">{openCount}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">Em cobrança</p>
          <p className="text-2xl font-bold text-slate-900">{billingCount}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">Recebido hoje</p>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(paidTodayTotal)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Comandas recentes</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-2 pr-3">Código</th>
                  <th className="py-2 pr-3">Tipo</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Mesa/Cliente</th>
                  <th className="py-2 pr-3">Ação</th>
                </tr>
              </thead>
              <tbody>
                {recentTabs.map((tab) => (
                  <tr key={tab.id} className="border-t border-slate-100">
                    <td className="py-2 pr-3 font-medium text-slate-800">{tab.code}</td>
                    <td className="py-2 pr-3 text-slate-700">{tab.kind}</td>
                    <td className="py-2 pr-3 text-slate-700">{tab.status}</td>
                    <td className="py-2 pr-3 text-slate-700">
                      {tab.tableNumber ? `Mesa ${tab.tableNumber}` : tab.customerName ?? "-"}
                    </td>
                    <td className="py-2 pr-3">
                      <Link
                        href={`/tabs/${tab.id}`}
                        className="text-sm font-medium text-slate-900 underline"
                      >
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
                {recentTabs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-3 text-sm text-slate-500">
                      Nenhuma comanda cadastrada.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Fechamento recente</h2>
          {recentCashClose ? (
            <div className="space-y-2 text-sm text-slate-700">
              <p>
                Data:{" "}
                {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
                  recentCashClose.date,
                )}
              </p>
              <p>Diferença: {formatCurrency(toNumber(recentCashClose.difference))}</p>
              <p>Turno: {recentCashClose.shift ?? "-"}</p>
              <Link href="/cash-close" className="inline-block text-slate-900 underline">
                Ver fechamento de caixa
              </Link>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              Nenhum fechamento de caixa registrado ainda.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

