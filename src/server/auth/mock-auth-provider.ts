import { type UserRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const MOCK_SESSION_COOKIE = "mock_session_user_id";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
};

export async function listMockUsers() {
  return prisma.user.findMany({
    where: { isActive: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
    },
  });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const userId = cookieStore.get(MOCK_SESSION_COOKIE)?.value;

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
      isActive: true,
    },
  });
  if (!user || !user.isActive) {
    return null;
  }

  return user;
}

export async function setSessionUser(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set(MOCK_SESSION_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionUser() {
  const cookieStore = await cookies();
  cookieStore.delete(MOCK_SESSION_COOKIE);
}

export async function requireAuth() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireRole(allowedRoles: UserRole | UserRole[]) {
  const user = await requireAuth();
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  if (!roles.includes(user.role)) {
    if (user.role === "REQUEST_USER") {
      redirect("/my-requests");
    }

    redirect("/catalog");
  }

  return user;
}
