import { type Prisma, type UserRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export async function getAdminUsers(input?: {
  q?: string;
  role?: UserRole;
  isActive?: boolean;
}) {
  const where: Prisma.UserWhereInput = {};

  if (input?.q) {
    where.OR = [
      { name: { contains: input.q, mode: "insensitive" } },
      { email: { contains: input.q, mode: "insensitive" } },
    ];
  }

  if (input?.role) {
    where.role = input.role;
  }

  if (typeof input?.isActive === "boolean") {
    where.isActive = input.isActive;
  }

  return prisma.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          requests: true,
          queueItems: true,
        },
      },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
}

export async function getAdminUserById(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          requests: true,
          queueItems: true,
        },
      },
      requests: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          quantity: true,
          status: true,
          createdAt: true,
          product: {
            select: {
              id: true,
              publicName: true,
            },
          },
        },
      },
      queueItems: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          quantity: true,
          sourceType: true,
          status: true,
          priority: true,
          createdAt: true,
          product: {
            select: {
              id: true,
              publicName: true,
            },
          },
        },
      },
    },
  });
}

export async function updateUserByAdmin(
  userId: string,
  input: {
    role: UserRole;
    isActive: boolean;
  },
) {
  return prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isActive: true },
    });

    if (!existingUser) {
      throw new Error("User not found.");
    }

    const removingActiveAdmin =
      existingUser.role === "ADMIN" &&
      existingUser.isActive &&
      (input.role !== "ADMIN" || input.isActive === false);

    if (removingActiveAdmin) {
      const otherActiveAdminCount = await tx.user.count({
        where: {
          role: "ADMIN",
          isActive: true,
          id: { not: userId },
        },
      });

      if (otherActiveAdminCount === 0) {
        throw new Error("At least one active admin account is required.");
      }
    }

    return tx.user.update({
      where: { id: userId },
      data: {
        role: input.role,
        isActive: input.isActive,
      },
    });
  });
}
