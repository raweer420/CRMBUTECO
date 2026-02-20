import { Role } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { hasAnyRole } from "@/lib/rbac";

const ACCESS_USER_COOKIE = "bar_access_user_id";

export const ACCESS_COOKIE_NAME = ACCESS_USER_COOKIE;

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(ACCESS_USER_COOKIE)?.value;

  if (!userId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
    },
  });

  if (!user || !user.active) {
    return null;
  }

  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireRoles(roles: Role[]) {
  const user = await requireUser();

  if (!hasAnyRole(user.role, roles)) {
    redirect("/unauthorized");
  }

  return user;
}
