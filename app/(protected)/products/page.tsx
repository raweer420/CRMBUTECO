import {
  createProductAction,
  toggleProductActiveAction,
  updateProductAction,
} from "@/app/actions/product-actions";
import { prisma } from "@/lib/prisma";
import { hasAnyRole, ROLE_GROUPS } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import { formatCurrency, toNumber } from "@/lib/utils";

export default async function ProductsPage() {
  const user = await requireUser();

  const canManage = hasAnyRole(user.role, ROLE_GROUPS.canManageProducts);

  const products = await prisma.product.findMany({
    orderBy: [{ active: "desc" }, { category: "asc" }, { name: "asc" }],
  });

  return (
    <div className="space-y-4">
      {canManage ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Novo produto</h2>
          <form action={createProductAction} className="grid gap-3 md:grid-cols-3">
            <input
              name="name"
              required
              placeholder="Nome"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              name="category"
              required
              placeholder="Categoria"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              name="price"
              type="number"
              step="0.01"
              min="0.01"
              required
              placeholder="Preço"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              name="cost"
              type="number"
              step="0.01"
              min="0"
              placeholder="Custo (opcional)"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              name="minStock"
              type="number"
              step="0.001"
              min="0"
              placeholder="Estoque mínimo"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700">
              <input type="checkbox" name="controlsStock" />
              Controla estoque
            </label>
            <div className="md:col-span-3">
              <button
                type="submit"
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              >
                Cadastrar produto
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Produtos</h2>
        <div className="space-y-3">
          {products.map((product) => (
            <article key={product.id} className="rounded-md border border-slate-200 p-3">
              {canManage ? (
                <form action={updateProductAction} className="grid gap-2 md:grid-cols-6">
                  <input type="hidden" name="productId" value={product.id} />
                  <input
                    name="name"
                    defaultValue={product.name}
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    required
                  />
                  <input
                    name="category"
                    defaultValue={product.category}
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    required
                  />
                  <input
                    name="price"
                    type="number"
                    step="0.01"
                    min="0.01"
                    defaultValue={toNumber(product.price)}
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    required
                  />
                  <input
                    name="cost"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={
                      product.cost === null ? "" : String(toNumber(product.cost))
                    }
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    placeholder="Custo"
                  />
                  <input
                    name="minStock"
                    type="number"
                    step="0.001"
                    min="0"
                    defaultValue={
                      product.minStock === null ? "" : String(toNumber(product.minStock))
                    }
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    placeholder="Mínimo"
                  />
                  <label className="flex items-center gap-2 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-700">
                    <input
                      name="controlsStock"
                      type="checkbox"
                      defaultChecked={product.controlsStock}
                    />
                    Estoque
                  </label>
                  <div className="md:col-span-6 flex flex-wrap gap-2">
                    <button
                      type="submit"
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700"
                    >
                      Salvar
                    </button>
                  </div>
                </form>
              ) : (
                <div className="text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">{product.name}</p>
                  <p>
                    {product.category} · {formatCurrency(toNumber(product.price))}
                  </p>
                  <p>Status: {product.active ? "Ativo" : "Inativo"}</p>
                </div>
              )}
              {canManage ? (
                <div className="mt-2 flex items-center justify-between text-sm">
                  <p className="text-slate-600">
                    {product.active ? "Ativo" : "Inativo"} · Preço atual{" "}
                    {formatCurrency(toNumber(product.price))}
                  </p>
                  <form action={toggleProductActiveAction}>
                    <input type="hidden" name="productId" value={product.id} />
                    <button
                      type="submit"
                      className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      {product.active ? "Inativar" : "Reativar"}
                    </button>
                  </form>
                </div>
              ) : null}
            </article>
          ))}
          {products.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum produto cadastrado.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
