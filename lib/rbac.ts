import { Role } from "@prisma/client";

export const ROLE_GROUPS = {
  canManageUsers: [Role.ADMIN],
  canManageSettings: [Role.ADMIN],
  canManageProducts: [Role.ADMIN, Role.MANAGER],
  canCancelItems: [Role.ADMIN, Role.MANAGER, Role.CASHIER],
  canApplyDiscount: [Role.ADMIN, Role.MANAGER, Role.CASHIER],
  canOperateCashier: [Role.ADMIN, Role.MANAGER, Role.CASHIER],
  canManageStock: [Role.ADMIN, Role.MANAGER, Role.STOCK],
  canViewAudit: [Role.ADMIN, Role.MANAGER],
};

export function hasAnyRole(role: Role, allowed: Role[]) {
  return allowed.includes(role);
}

