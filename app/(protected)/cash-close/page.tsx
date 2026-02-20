import { AccountType, PaymentMethod, Role } from "@prisma/client";

import { createCashCloseAction } from "@/app/actions/finance-actions";
import { prisma } from "@/lib/prisma";
import { hasAnyRole } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import { formatCurrency, getDayRange, toNumber } from "@/lib/utils";

const METHODS: PaymentMethod[] = ["PIX", "CREDIT", "DEBIT", "CASH", "VOUCHER", "FIADO"];

export default async function CashClosePage() {
  const user = await requireUser();

  if (!hasAnyRole(user.role, [Role.ADMIN, Role.MANAGER, Role.CASHIER])) {
    throw new Error("Sem permissão para fechamento de caixa.");
  }

  const today = new Date();
  const { start, end } = getDayRange(today);

  const [entries, closes] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: {
        date: { gte: start, lt: end },
        paymentMethod: { not: null },
      },
      include: {
        category: {
          select: { type: true },
        },
      },
    }),
    prisma.cashClose.findMany({
      orderBy: { closedAt: "desc" },
      take: 30,
      include: {
        closedBy: {
          select: { name: true },
        },
      },
    }),
  ]);

  const expected = METHODS.reduce<Record<PaymentMethod, number>>(
    (acc, method) => {
      acc[method] = entries
        .filter((entry) => entry.paymentMethod === method)
        .reduce((sum, entry) => {
          const signal = entry.category.type === AccountType.REVENUE ? 1 : -1;
          return sum + toNumber(entry.amount) * signal;
        }, 0);
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

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Fechamento de caixa</h2>
        <form action={createCashCloseAction} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Data</label>
              <input
                type="date"
                name="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Turno</label>
              <input
                type="text"
                name="shift"
                placeholder="Ex: Noite"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Observação</label>
              <input
                type="text"
                name="observation"
                placeholder="Opcional"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-2 pr-3">Método</th>
                  <th className="py-2 pr-3">Esperado (sistema)</th>
                  <th className="py-2 pr-3">Contado</th>
                </tr>
              </thead>
              <tbody>
                {METHODS.map((method) => (
                  <tr key={method} className="border-t border-slate-100">
                    <td className="py-2 pr-3 font-medium text-slate-700">{method}</td>
                    <td className="py-2 pr-3 text-slate-700">
                      {formatCurrency(expected[method])}
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        step="0.01"
                        name={`counted_${method}`}
                        defaultValue={expected[method].toFixed(2)}
                        className="w-40 rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Salvar fechamento
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Fechamentos recentes</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2 pr-3">Data</th>
                <th className="py-2 pr-3">Turno</th>
                <th className="py-2 pr-3">Diferença</th>
                <th className="py-2 pr-3">Fechado por</th>
                <th className="py-2 pr-3">Fechado em</th>
              </tr>
            </thead>
            <tbody>
              {closes.map((close) => (
                <tr key={close.id} className="border-t border-slate-100">
                  <td className="py-2 pr-3 text-slate-700">
                    {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(close.date)}
                  </td>
                  <td className="py-2 pr-3 text-slate-700">{close.shift ?? "-"}</td>
                  <td className="py-2 pr-3 text-slate-700">
                    {formatCurrency(toNumber(close.difference))}
                  </td>
                  <td className="py-2 pr-3 text-slate-700">{close.closedBy.name}</td>
                  <td className="py-2 pr-3 text-slate-700">
                    {new Intl.DateTimeFormat("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(close.closedAt)}
                  </td>
                </tr>
              ))}
              {closes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-3 text-sm text-slate-500">
                    Nenhum fechamento registrado.
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
