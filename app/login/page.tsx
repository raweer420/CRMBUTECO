import { redirect } from "next/navigation";

import { selectAccessProfileAction } from "@/app/actions/access-actions";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user?.id) {
    redirect("/");
  }

  const users = await prisma.user.findMany({
    where: { active: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });

  if (users.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="mb-2 text-xl font-semibold text-slate-900">Tamales Bar</h1>
          <p className="text-sm text-slate-600">
            Nenhum perfil ativo encontrado. Crie um usuário no banco para acessar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-xl font-semibold text-slate-900">Tamales Bar</h1>
        <p className="mb-6 text-sm text-slate-600">Selecione o perfil para entrar no sistema.</p>
        <form action={selectAccessProfileAction} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Perfil</label>
            <select
              name="userId"
              required
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              defaultValue={users[0]?.id}
            >
              {users.map((listedUser) => (
                <option key={listedUser.id} value={listedUser.id}>
                  {listedUser.name} ({listedUser.role}) - {listedUser.email}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}
