"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearSessionUser, setSessionUser } from "./mock-auth-provider";

function encodeError(message: string) {
  return encodeURIComponent(message);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

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

export async function createInitialAdminAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const allowWhenAdminExists = String(formData.get("allowWhenAdminExists") ?? "") === "1";
  const bootstrapTestModeEnabled = process.env.ENABLE_INITIAL_ADMIN_TEST_MODE === "true";

  if (!name || !email) {
    redirect(`/login?error=${encodeError("Name and email are required.")}`);
  }

  if (!isValidEmail(email)) {
    redirect(`/login?error=${encodeError("Enter a valid email address.")}`);
  }

  const existingAdmin = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });

  if (existingAdmin && !(allowWhenAdminExists && bootstrapTestModeEnabled)) {
    redirect(`/login?error=${encodeError("An active admin account already exists.")}`);
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, isActive: true },
  });

  if (existingUser) {
    redirect(`/login?error=${encodeError("A user with that email already exists.")}`);
  }

  const admin = await prisma.user.create({
    data: {
      name,
      email,
      role: "ADMIN",
      isActive: true,
    },
  });

  await setSessionUser(admin.id);
  revalidatePath("/", "layout");
  redirect("/admin");
}
