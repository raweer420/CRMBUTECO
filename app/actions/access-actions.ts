"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { ACCESS_COOKIE_NAME } from "@/lib/session";

const selectProfileSchema = z.object({
  userId: z.string().min(1),
});

export async function selectAccessProfileAction(formData: FormData) {
  const parsed = selectProfileSchema.safeParse({
    userId: formData.get("userId"),
  });

  if (!parsed.success) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, active: true },
  });

  if (!user || !user.active) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  cookieStore.set(ACCESS_COOKIE_NAME, user.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect("/");
}

export async function clearAccessProfileAction() {
  const cookieStore = await cookies();
  cookieStore.delete(ACCESS_COOKIE_NAME);
  redirect("/login");
}
