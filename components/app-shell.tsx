import { Role } from "@prisma/client";
import Link from "next/link";
import type { ReactNode } from "react";

import { SignOutButton } from "@/components/sign-out-button";
import { hasAnyRole, ROLE_GROUPS } from "@/lib/rbac";

type Props = {
  userName?: string | null;
  role: Role;
  children: ReactNode;
};

type NavLink = {
  href: string;
  label: string;
  visible: boolean;
};

export function AppShell({ userName, role, children }: Props) {
  const links: NavLink[] = [
    { href: "/", label: "Dashboard", visible: true },
    {
      href: "/tabs",
      label: "Comandas",
      visible: hasAnyRole(role, [Role.ADMIN, Role.MANAGER, Role.CASHIER, Role.WAITER]),
    },
    { href: "/products", label: "Produtos", visible: true },
    {
      href: "/stock",
      label: "Estoque",
      visible: hasAnyRole(role, ROLE_GROUPS.canManageStock),
    },
    {
      href: "/finance",
      label: "Balancete",
      visible: hasAnyRole(role, [Role.ADMIN, Role.MANAGER, Role.CASHIER]),
    },
    {
      href: "/cash-close",
      label: "Fechamento de Caixa",
      visible: hasAnyRole(role, ROLE_GROUPS.canOperateCashier),
    },
    {
      href: "/users",
      label: "Usuários",
      visible: hasAnyRole(role, ROLE_GROUPS.canManageUsers),
    },
    {
      href: "/settings",
      label: "Configurações",
      visible: hasAnyRole(role, ROLE_GROUPS.canManageSettings),
    },
    {
      href: "/audit",
      label: "Auditoria",
      visible: hasAnyRole(role, ROLE_GROUPS.canViewAudit),
    },
  ];

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Tamales Bar</h1>
            <p className="text-xs text-slate-600">
              {userName ?? "Usuário"} · {role}
            </p>
          </div>
          <SignOutButton />
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 py-4 md:grid-cols-[240px_1fr]">
        <aside className="rounded-lg border border-slate-200 bg-white p-3">
          <nav className="space-y-1">
            {links
              .filter((link) => link.visible)
              .map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  {link.label}
                </Link>
              ))}
          </nav>
        </aside>
        <main>{children}</main>
      </div>
    </div>
  );
}

