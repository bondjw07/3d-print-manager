import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

function normalizeOptionalUrl(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isKnownUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function getManagedCreators() {
  return prisma.creator.findMany({
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
  });
}

export async function createManagedCreator(input: { name: string; url?: string }) {
  try {
    return await prisma.creator.create({
      data: {
        name: input.name.trim(),
        url: normalizeOptionalUrl(input.url),
      },
    });
  } catch (error) {
    if (!isKnownUniqueConstraintError(error)) {
      throw error;
    }
    throw new Error("A creator with that name already exists.");
  }
}

export async function updateManagedCreator(creatorId: string, input: { name: string; url?: string }) {
  try {
    return await prisma.creator.update({
      where: { id: creatorId },
      data: {
        name: input.name.trim(),
        url: normalizeOptionalUrl(input.url),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new Error("Creator not found.");
    }
    if (!isKnownUniqueConstraintError(error)) {
      throw error;
    }
    throw new Error("A creator with that name already exists.");
  }
}

export async function deleteManagedCreator(creatorId: string) {
  try {
    await prisma.creator.delete({
      where: { id: creatorId },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new Error("Creator not found.");
    }
    throw error;
  }
}

export async function getManagedCreatorById(creatorId: string) {
  return prisma.creator.findUnique({
    where: { id: creatorId },
  });
}
