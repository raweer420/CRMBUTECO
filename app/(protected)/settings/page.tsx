import { Role } from "@prisma/client";

import { updateSettingsAction } from "@/app/actions/settings-actions";
import { prisma } from "@/lib/prisma";
import { hasAnyRole } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import { toNumber } from "@/lib/utils";

export default async function SettingsPage() {
  const user = await requireUser();

  if (!hasAnyRole(user.role, [Role.ADMIN])) {
    throw new Error("Sem permissão para configurações.");
  }

  const settings = await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-slate-900">
          Configurações do fluxo
        </h2>
        <form action={updateSettingsAction} className="space-y-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="allowAddItemsWhenBilling"
              defaultChecked={settings.allowAddItemsWhenBilling}
            />
            Permitir adicionar itens quando comanda estiver em BILLING
          </label>
          <div>
            <label className="mb-1 block text-sm text-slate-700">
              Taxa de serviço padrão (%)
            </label>
            <input
              type="number"
              name="defaultServiceFeePercent"
              min="0"
              max="100"
              step="0.01"
              defaultValue={toNumber(settings.defaultServiceFeePercent)}
              className="w-56 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="enableStockModule"
              defaultChecked={settings.enableStockModule}
            />
            Habilitar módulo de estoque
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="enableCustomerFields"
              defaultChecked={settings.enableCustomerFields}
            />
            Habilitar campos de cliente nas comandas
          </label>
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Salvar configurações
          </button>
        </form>
        <p className="mt-3 text-xs text-slate-500">
          Configurações aplicam um fluxo padrão flexível para operação sem fluxo
          previamente definido.
        </p>
      </section>
    </div>
  );
}
