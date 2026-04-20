"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearSessionUser, setSessionUser } from "./mock-auth-provider";

export async function loginAsUserAction(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");

  if (!userId) {
    redirect("/login?error=Select%20a%20user");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    redirect("/login?error=Selected%20user%20is%20not%20available");
  }

  await setSessionUser(user.id);
  revalidatePath("/", "layout");

  if (user.role === "ADMIN") {
    redirect("/admin");
  }

  redirect("/my-requests");
}

export async function logoutAction() {
  await clearSessionUser();
  revalidatePath("/", "layout");
  redirect("/catalog");
}

export async function continueAsGuestAction() {
  await clearSessionUser();
  revalidatePath("/", "layout");
  redirect("/catalog");
}
