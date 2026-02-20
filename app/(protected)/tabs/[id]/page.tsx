import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  addPaymentAction,
  addTabItemAction,
  applyTabDiscountAction,
  cancelTabItemAction,
  updateTabStatusAction,
} from "@/app/actions/tab-actions";
import { calculateTabTotals } from "@/lib/domain/tabs";
import { prisma } from "@/lib/prisma";
import { hasAnyRole, ROLE_GROUPS } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import { formatCurrency, formatDateTime, toNumber } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TabDetailPage({ params, searchParams }: PageProps) {
  const user = await requireUser();

  if (
    !hasAnyRole(user.role, [Role.ADMIN, Role.MANAGER, Role.CASHIER, Role.WAITER])
  ) {
    throw new Error("Sem permissão para acessar comandas.");
  }

  const { id } = await params;
  const query = await searchParams;
  const mode = query.mode === "cashier" ? "cashier" : "waiter";

  const [tab, settings, products] = await Promise.all([
    prisma.tab.findUnique({
      where: { id },
      include: {
        openedBy: { select: { name: true } },
        closedBy: { select: { name: true } },
        items: {
          orderBy: { addedAt: "desc" },
          include: {
            addedBy: { select: { name: true } },
            canceledBy: { select: { name: true } },
          },
        },
        payments: {
          orderBy: { paidAt: "desc" },
          include: {
            receivedBy: { select: { name: true } },
          },
        },
      },
    }),
    prisma.settings.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1 },
    }),
    prisma.product.findMany({
      where: { active: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
  ]);

  if (!tab) {
    notFound();
  }

  const totals = calculateTabTotals(
    tab.items.map((item) => ({
      quantity: toNumber(item.quantity),
      unitPrice: toNumber(item.unitPriceSnapshot),
      canceled: Boolean(item.canceledAt),
    })),
    toNumber(tab.discount),
    toNumber(tab.serviceFeePercent),
  );

  const totalPaid = tab.payments.reduce((sum, payment) => sum + toNumber(payment.amount), 0);
  const pending = Math.max(0, Math.round((totals.total - totalPaid) * 100) / 100);
  const canCancelItem = hasAnyRole(user.role, ROLE_GROUPS.canCancelItems);
  const canCashier = hasAnyRole(user.role, ROLE_GROUPS.canOperateCashier);
  const canApplyDiscount = hasAnyRole(user.role, ROLE_GROUPS.canApplyDiscount);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">{tab.code}</h2>
              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                {tab.status}
              </span>
              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                {tab.kind}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Aberta por {tab.openedBy.name} em {formatDateTime(tab.openedAt)}
            </p>
            <p className="text-sm text-slate-600">
              Mesa/Cliente:{" "}
              {tab.tableNumber ? `Mesa ${tab.tableNumber}` : tab.customerName ?? "-"}
            </p>
            {tab.closedAt ? (
              <p className="text-sm text-slate-600">
                Fechada por {tab.closedBy?.name ?? "-"} em {formatDateTime(tab.closedAt)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/tabs/${tab.id}?mode=waiter`}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                mode === "waiter"
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 text-slate-700"
              }`}
            >
              Modo garçom
            </Link>
            <Link
              href={`/tabs/${tab.id}?mode=cashier`}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                mode === "cashier"
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 text-slate-700"
              }`}
            >
              Modo caixa
            </Link>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <form action={updateTabStatusAction}>
            <input type="hidden" name="tabId" value={tab.id} />
            <input type="hidden" name="nextStatus" value="BILLING" />
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
            >
              Enviar para cobrança
            </button>
          </form>
          <form action={updateTabStatusAction}>
            <input type="hidden" name="tabId" value={tab.id} />
            <input type="hidden" name="nextStatus" value="OPEN" />
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
            >
              Reabrir para consumo
            </button>
          </form>
          <form action={updateTabStatusAction}>
            <input type="hidden" name="tabId" value={tab.id} />
            <input type="hidden" name="nextStatus" value="PAID" />
            <button
              type="submit"
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm text-white"
            >
              Marcar como paga
            </button>
          </form>
          <form action={updateTabStatusAction}>
            <input type="hidden" name="tabId" value={tab.id} />
            <input type="hidden" name="nextStatus" value="CANCELED" />
            <button
              type="submit"
              className="rounded-md bg-rose-700 px-3 py-1.5 text-sm text-white"
            >
              Cancelar comanda
            </button>
          </form>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-base font-semibold text-slate-900">Itens da comanda</h3>
          {mode === "waiter" ? (
            <form action={addTabItemAction} className="mb-4 grid gap-3 md:grid-cols-4">
              <input type="hidden" name="tabId" value={tab.id} />
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">Produto</label>
                <select
                  name="productId"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  required
                >
                  <option value="">Selecione</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.category} · {product.name} ({formatCurrency(toNumber(product.price))})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Quantidade</label>
                <input
                  name="quantity"
                  type="number"
                  min="0.001"
                  step="0.001"
                  defaultValue="1"
                  required
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Observação</label>
                <input
                  name="note"
                  type="text"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Opcional"
                />
              </div>
              <div className="md:col-span-4">
                <button
                  type="submit"
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                >
                  Adicionar item
                </button>
                <p className="mt-2 text-xs text-slate-500">
                  Em BILLING, adicionar item está{" "}
                  {settings.allowAddItemsWhenBilling ? "habilitado" : "desabilitado"}.
                </p>
              </div>
            </form>
          ) : null}

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-2 pr-3">Item</th>
                  <th className="py-2 pr-3">Qtd</th>
                  <th className="py-2 pr-3">Preço</th>
                  <th className="py-2 pr-3">Subtotal</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Ação</th>
                </tr>
              </thead>
              <tbody>
                {tab.items.map((item) => {
                  const lineSubtotal = toNumber(item.quantity) * toNumber(item.unitPriceSnapshot);
                  return (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="py-2 pr-3 text-slate-800">
                        <p className="font-medium">{item.nameSnapshot}</p>
                        {item.note ? (
                          <p className="text-xs text-slate-500">Obs: {item.note}</p>
                        ) : null}
                        <p className="text-xs text-slate-500">
                          Incluído por {item.addedBy.name} em {formatDateTime(item.addedAt)}
                        </p>
                        {item.canceledAt ? (
                          <p className="text-xs text-rose-700">
                            Cancelado por {item.canceledBy?.name ?? "-"}: {item.cancelReason}
                          </p>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3 text-slate-700">{toNumber(item.quantity)}</td>
                      <td className="py-2 pr-3 text-slate-700">
                        {formatCurrency(toNumber(item.unitPriceSnapshot))}
                      </td>
                      <td className="py-2 pr-3 text-slate-700">{formatCurrency(lineSubtotal)}</td>
                      <td className="py-2 pr-3 text-slate-700">
                        {item.canceledAt ? "Cancelado" : "Ativo"}
                      </td>
                      <td className="py-2 pr-3">
                        {!item.canceledAt && canCancelItem ? (
                          <form action={cancelTabItemAction} className="flex gap-2">
                            <input type="hidden" name="itemId" value={item.id} />
                            <input
                              name="reason"
                              type="text"
                              required
                              placeholder="Motivo"
                              className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs"
                            />
                            <button
                              type="submit"
                              className="rounded-md bg-rose-700 px-2 py-1 text-xs font-medium text-white"
                            >
                              Cancelar
                            </button>
                          </form>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {tab.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-3 text-slate-500">
                      Nenhum item adicionado.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-base font-semibold text-slate-900">Resumo e cobrança</h3>
          <div className="space-y-1 text-sm text-slate-700">
            <p>Subtotal: {formatCurrency(totals.subtotal)}</p>
            <p>Desconto: {formatCurrency(totals.discount)}</p>
            <p>
              Taxa ({toNumber(tab.serviceFeePercent)}%): {formatCurrency(totals.serviceFee)}
            </p>
            <p className="pt-1 text-base font-semibold text-slate-900">
              Total final: {formatCurrency(totals.total)}
            </p>
            <p>Pago: {formatCurrency(totalPaid)}</p>
            <p className={pending > 0 ? "text-amber-700" : "text-emerald-700"}>
              Em aberto: {formatCurrency(pending)}
            </p>
          </div>

          {canApplyDiscount ? (
            <form action={applyTabDiscountAction} className="mt-4 space-y-2">
              <input type="hidden" name="tabId" value={tab.id} />
              <label className="block text-xs font-medium text-slate-600">Desconto (R$)</label>
              <div className="flex gap-2">
                <input
                  name="discount"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={toNumber(tab.discount)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
                >
                  Aplicar
                </button>
              </div>
            </form>
          ) : null}

          {mode === "cashier" && canCashier ? (
            <form action={addPaymentAction} className="mt-4 space-y-2 border-t border-slate-100 pt-4">
              <input type="hidden" name="tabId" value={tab.id} />
              <label className="block text-xs font-medium text-slate-600">Registrar pagamento</label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  name="method"
                  required
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="PIX">PIX</option>
                  <option value="CREDIT">Crédito</option>
                  <option value="DEBIT">Débito</option>
                  <option value="CASH">Dinheiro</option>
                  <option value="VOUCHER">Voucher</option>
                  <option value="FIADO">Fiado</option>
                </select>
                <input
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Valor"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
              >
                Registrar pagamento
              </button>
            </form>
          ) : null}

          <div className="mt-4 border-t border-slate-100 pt-4">
            <h4 className="mb-2 text-sm font-semibold text-slate-800">Pagamentos lançados</h4>
            <ul className="space-y-2 text-sm text-slate-700">
              {tab.payments.map((payment) => (
                <li key={payment.id} className="rounded-md bg-slate-50 px-3 py-2">
                  {payment.method} · {formatCurrency(toNumber(payment.amount))}
                  <p className="text-xs text-slate-500">
                    {payment.receivedBy.name} em {formatDateTime(payment.paidAt)}
                  </p>
                </li>
              ))}
              {tab.payments.length === 0 ? (
                <li className="text-slate-500">Nenhum pagamento registrado.</li>
              ) : null}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
