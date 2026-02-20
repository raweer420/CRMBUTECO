import { Role } from "@prisma/client";

import {
  createUserAction,
  resetUserPasswordAction,
  toggleUserActiveAction,
  updateUserRoleAction,
} from "@/app/actions/user-actions";
import { prisma } from "@/lib/prisma";
import { hasAnyRole, ROLE_GROUPS } from "@/lib/rbac";
import { requireUser } from "@/lib/session";

const ROLE_OPTIONS: Role[] = ["ADMIN", "MANAGER", "CASHIER", "WAITER", "STOCK"];

export default async function UsersPage() {
  const user = await requireUser();

  if (!hasAnyRole(user.role, ROLE_GROUPS.canManageUsers)) {
    throw new Error("Sem permissão para usuários.");
  }

  const users = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Novo usuário</h2>
        <form action={createUserAction} className="grid gap-3 md:grid-cols-4">
          <input
            name="name"
            required
            placeholder="Nome"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            name="email"
            type="email"
            required
            placeholder="email@local"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            name="password"
            type="password"
            required
            minLength={6}
            placeholder="Senha inicial"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            name="role"
            defaultValue="WAITER"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {ROLE_OPTIONS.map((roleOption) => (
              <option key={roleOption} value={roleOption}>
                {roleOption}
              </option>
            ))}
          </select>
          <div className="md:col-span-4">
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              Criar usuário
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Usuários cadastrados</h2>
        <div className="space-y-3">
          {users.map((listed) => (
            <article key={listed.id} className="rounded-md border border-slate-200 p-3">
              <div className="mb-2 text-sm">
                <p className="font-medium text-slate-900">{listed.name}</p>
                <p className="text-slate-600">{listed.email}</p>
                <p className="text-slate-600">Status: {listed.active ? "Ativo" : "Inativo"}</p>
              </div>

              <div className="grid gap-2 md:grid-cols-[220px_1fr]">
                <form action={updateUserRoleAction} className="flex gap-2">
                  <input type="hidden" name="userId" value={listed.id} />
                  <select
                    name="role"
                    defaultValue={listed.role}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                  >
                    {ROLE_OPTIONS.map((roleOption) => (
                      <option key={roleOption} value={roleOption}>
                        {roleOption}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
                  >
                    Salvar perfil
                  </button>
                </form>

                <div className="flex flex-wrap gap-2">
                  <form action={toggleUserActiveAction}>
                    <input type="hidden" name="userId" value={listed.id} />
                    <button
                      type="submit"
                      className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white"
                    >
                      {listed.active ? "Inativar" : "Reativar"}
                    </button>
                  </form>

                  <form action={resetUserPasswordAction} className="flex gap-2">
                    <input type="hidden" name="userId" value={listed.id} />
                    <input
                      name="password"
                      type="password"
                      minLength={6}
                      required
                      placeholder="Nova senha"
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                    />
                    <button
                      type="submit"
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
                    >
                      Resetar senha
                    </button>
                  </form>
                </div>
              </div>
            </article>
          ))}
          {users.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum usuário cadastrado.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

