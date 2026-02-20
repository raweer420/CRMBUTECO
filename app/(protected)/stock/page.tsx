import { Role, StockMovementType } from "@prisma/client";

import { createStockMovementAction } from "@/app/actions/stock-actions";
import { prisma } from "@/lib/prisma";
import { hasAnyRole, ROLE_GROUPS } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import { formatDateTime, toNumber } from "@/lib/utils";

function movementSignal(type: StockMovementType) {
  if (type === "OUT" || type === "LOSS") {
    return -1;
  }

  return 1;
}

export default async function StockPage() {
  const user = await requireUser();

  if (!hasAnyRole(user.role, [Role.ADMIN, Role.MANAGER, Role.STOCK])) {
    throw new Error("Sem permissão para estoque.");
  }

  const [settings, products, movementTotals, movements] = await Promise.all([
    prisma.settings.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1 },
    }),
    prisma.product.findMany({
      where: { controlsStock: true },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    prisma.stockMovement.findMany({
      select: {
        productId: true,
        type: true,
        quantity: true,
      },
    }),
    prisma.stockMovement.findMany({
      include: {
        product: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 120,
    }),
  ]);

  if (!settings.enableStockModule) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
        O módulo de estoque está desativado nas configurações.
      </div>
    );
  }

  const stockByProduct = new Map<string, number>();
  for (const movement of movementTotals) {
    const current = stockByProduct.get(movement.productId) ?? 0;
    stockByProduct.set(
      movement.productId,
      current + toNumber(movement.quantity) * movementSignal(movement.type),
    );
  }

  const lowStock = products
    .filter((product) => product.minStock !== null)
    .map((product) => ({
      id: product.id,
      name: product.name,
      minStock: toNumber(product.minStock),
      current: stockByProduct.get(product.id) ?? 0,
    }))
    .filter((item) => item.current <= item.minStock);

  const canLaunch = hasAnyRole(user.role, ROLE_GROUPS.canManageStock);

  return (
    <div className="space-y-4">
      {canLaunch ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Lançar movimento</h2>
          <form action={createStockMovementAction} className="grid gap-3 md:grid-cols-5">
            <select
              name="productId"
              required
              className="rounded-md border border-slate-300 px-3 py-2 text-sm md:col-span-2"
            >
              <option value="">Produto</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
            <select
              name="type"
              required
              defaultValue="IN"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="IN">Entrada</option>
              <option value="LOSS">Perda</option>
              <option value="ADJUST">Ajuste</option>
              <option value="OUT">Saída manual</option>
            </select>
            <input
              name="quantity"
              type="number"
              step="0.001"
              min="0.001"
              required
              placeholder="Quantidade"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              name="unitCost"
              type="number"
              step="0.01"
              min="0"
              placeholder="Custo unitário"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              name="note"
              required
              placeholder="Observação"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm md:col-span-4"
            />
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              Salvar movimento
            </button>
          </form>
        </section>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Alertas de estoque mínimo</h2>
        {lowStock.length > 0 ? (
          <ul className="space-y-2 text-sm text-rose-700">
            {lowStock.map((item) => (
              <li key={item.id} className="rounded-md bg-rose-50 px-3 py-2">
                {item.name}: atual {item.current.toFixed(3)} | mínimo {item.minStock.toFixed(3)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Nenhum alerta no momento.</p>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Movimentos recentes</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2 pr-3">Data</th>
                <th className="py-2 pr-3">Produto</th>
                <th className="py-2 pr-3">Tipo</th>
                <th className="py-2 pr-3">Qtd</th>
                <th className="py-2 pr-3">Obs</th>
                <th className="py-2 pr-3">Usuário</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.id} className="border-t border-slate-100">
                  <td className="py-2 pr-3 text-slate-700">{formatDateTime(movement.createdAt)}</td>
                  <td className="py-2 pr-3 text-slate-700">{movement.product.name}</td>
                  <td className="py-2 pr-3 text-slate-700">{movement.type}</td>
                  <td className="py-2 pr-3 text-slate-700">{toNumber(movement.quantity)}</td>
                  <td className="py-2 pr-3 text-slate-700">{movement.note}</td>
                  <td className="py-2 pr-3 text-slate-700">{movement.createdBy.name}</td>
                </tr>
              ))}
              {movements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-3 text-sm text-slate-500">
                    Nenhum movimento registrado.
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
