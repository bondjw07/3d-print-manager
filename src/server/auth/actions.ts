"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearSessionUser, setSessionUser } from "./mock-auth-provider";
import { hashPassword, verifyPassword } from "./password";

function encodeError(message: string) {
  return encodeURIComponent(message);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function loginWithPasswordAction(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/login?error=Email%20and%20password%20are%20required");
  }

  if (!isValidEmail(email)) {
    redirect(`/login?error=${encodeError("Enter a valid email address.")}`);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive || !user.passwordHash) {
    redirect("/login?error=Invalid%20email%20or%20password");
  }

  const passwordIsValid = await verifyPassword(password, user.passwordHash);
  if (!passwordIsValid) {
    redirect("/login?error=Invalid%20email%20or%20password");
  }

  await setSessionUser(user.id);
  revalidatePath("/", "layout");

  if (user.role === "ADMIN") {
    redirect("/admin");
  }

  redirect("/catalog");
}

export async function logoutAction() {
  await clearSessionUser();
  revalidatePath("/", "layout");
  redirect("/catalog");
}

export async function signupRequestUserAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!name || !email || !password || !confirmPassword) {
    redirect(`/signup?error=${encodeError("Name, email, and password are required.")}`);
  }

  if (!isValidEmail(email)) {
    redirect(`/signup?error=${encodeError("Enter a valid email address.")}`);
  }

  if (password.length < 8) {
    redirect(`/signup?error=${encodeError("Password must be at least 8 characters.")}`);
  }

  if (password !== confirmPassword) {
    redirect(`/signup?error=${encodeError("Passwords do not match.")}`);
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    redirect(`/signup?error=${encodeError("A user with that email already exists.")}`);
  }

  const newUser = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(password),
      role: "REQUEST_USER",
      isActive: true,
    },
  });

  await setSessionUser(newUser.id);
  revalidatePath("/", "layout");
  redirect("/catalog");
}

export async function createInitialAdminAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const allowWhenAdminExists = String(formData.get("allowWhenAdminExists") ?? "") === "1";
  const bootstrapTestModeEnabled = process.env.ENABLE_INITIAL_ADMIN_TEST_MODE === "true";

  if (!name || !email || !password || !confirmPassword) {
    redirect(`/login?error=${encodeError("Name, email, and password are required.")}`);
  }

  if (!isValidEmail(email)) {
    redirect(`/login?error=${encodeError("Enter a valid email address.")}`);
  }

  if (password.length < 8) {
    redirect(`/login?error=${encodeError("Password must be at least 8 characters.")}`);
  }

  if (password !== confirmPassword) {
    redirect(`/login?error=${encodeError("Passwords do not match.")}`);
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
      passwordHash: await hashPassword(password),
      role: "ADMIN",
      isActive: true,
    },
  });

  await setSessionUser(admin.id);
  revalidatePath("/", "layout");
  redirect("/admin");
}
