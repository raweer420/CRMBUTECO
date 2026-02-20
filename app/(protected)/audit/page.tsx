import { Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { hasAnyRole } from "@/lib/rbac";
import { requireUser } from "@/lib/session";

export default async function AuditPage() {
  const user = await requireUser();

  if (!hasAnyRole(user.role, [Role.ADMIN, Role.MANAGER])) {
    throw new Error("Sem permissão para auditoria.");
  }

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      actorUser: {
        select: { name: true, email: true },
      },
    },
  });

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-base font-semibold text-slate-900">Audit logs</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-2 pr-3">Data</th>
              <th className="py-2 pr-3">Usuário</th>
              <th className="py-2 pr-3">Ação</th>
              <th className="py-2 pr-3">Entidade</th>
              <th className="py-2 pr-3">Entity ID</th>
              <th className="py-2 pr-3">Antes</th>
              <th className="py-2 pr-3">Depois</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-t border-slate-100 align-top">
                <td className="py-2 pr-3 text-slate-700">
                  {new Intl.DateTimeFormat("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(log.createdAt)}
                </td>
                <td className="py-2 pr-3 text-slate-700">
                  <p>{log.actorUser.name}</p>
                  <p className="text-xs text-slate-500">{log.actorUser.email}</p>
                </td>
                <td className="py-2 pr-3 text-slate-700">{log.action}</td>
                <td className="py-2 pr-3 text-slate-700">{log.entity}</td>
                <td className="py-2 pr-3 text-slate-700">{log.entityId ?? "-"}</td>
                <td className="py-2 pr-3 text-xs text-slate-600">
                  {log.beforeJson ? JSON.stringify(log.beforeJson) : "-"}
                </td>
                <td className="py-2 pr-3 text-xs text-slate-600">
                  {log.afterJson ? JSON.stringify(log.afterJson) : "-"}
                </td>
              </tr>
            ))}
            {logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-3 text-sm text-slate-500">
                  Nenhum log registrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
