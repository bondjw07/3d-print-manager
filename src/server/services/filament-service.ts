import { prisma } from "@/lib/prisma";

export async function getFilaments(includeInactive = true) {
  return prisma.filament.findMany({
    where: includeInactive ? undefined : { isActive: true },
    include: {
      productRequirements: {
        include: { product: true },
      },
      partialRolls: {
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
}

export async function getFilamentById(filamentId: string) {
  return prisma.filament.findUnique({
    where: { id: filamentId },
    include: {
      productRequirements: {
        include: {
          product: true,
        },
      },
      partialRolls: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });
}

export async function createFilament(data: {
  name: string;
  brand?: string;
  colorLabel: string;
  materialType: string;
  notes?: string;
  isActive: boolean;
}) {
  return prisma.filament.create({
    data: {
      name: data.name,
      brand: data.brand || null,
      colorLabel: data.colorLabel,
      materialType: data.materialType,
      notes: data.notes || null,
      isActive: data.isActive,
    },
  });
}

export async function updateFilament(
  filamentId: string,
  data: {
    name: string;
    brand?: string;
    colorLabel: string;
    materialType: string;
    notes?: string;
    isActive: boolean;
  },
) {
  return prisma.filament.update({
    where: { id: filamentId },
    data: {
      name: data.name,
      brand: data.brand || null,
      colorLabel: data.colorLabel,
      materialType: data.materialType,
      notes: data.notes || null,
      isActive: data.isActive,
    },
  });
}

export async function updateFilamentStock(
  filamentId: string,
  data: {
    fullRollCount: number;
    partialRollGrams: number[];
  },
) {
  const normalizedPartialRollGrams = data.partialRollGrams.map((grams) => Math.round(grams * 100) / 100);

  return prisma.$transaction(async (tx) => {
    await tx.filament.update({
      where: { id: filamentId },
      data: {
        fullRollCount: data.fullRollCount,
      },
    });

    await tx.filamentPartialRoll.deleteMany({
      where: { filamentId },
    });

    if (normalizedPartialRollGrams.length > 0) {
      await tx.filamentPartialRoll.createMany({
        data: normalizedPartialRollGrams.map((gramsRemaining, index) => ({
          filamentId,
          gramsRemaining,
          sortOrder: index,
        })),
      });
    }

    return tx.filament.findUnique({
      where: { id: filamentId },
      include: {
        partialRolls: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });
  });
}

export async function deactivateFilament(filamentId: string) {
  return prisma.filament.update({
    where: { id: filamentId },
    data: { isActive: false },
  });
}

export async function deleteFilament(filamentId: string, options?: { force?: boolean }) {
  const filament = await prisma.filament.findUnique({
    where: { id: filamentId },
    select: {
      id: true,
      _count: {
        select: {
          productRequirements: true,
        },
      },
    },
  });

  if (!filament) {
    throw new Error("Filament not found.");
  }

  const linkedRequirementCount = filament._count.productRequirements;
  const hasLinkedRequirements = linkedRequirementCount > 0;

  if (hasLinkedRequirements && !options?.force) {
    throw new Error(
      `This filament is linked to ${linkedRequirementCount} product requirement(s). Type "delete" to remove linked requirements and delete the filament.`,
    );
  }

  let removedRequirementCount = 0;

  await prisma.$transaction(async (tx) => {
    if (hasLinkedRequirements) {
      const removedRequirements = await tx.productFilamentRequirement.deleteMany({
        where: { filamentId },
      });
      removedRequirementCount = removedRequirements.count;
    }

    await tx.filament.delete({
      where: { id: filamentId },
    });
  });

  return {
    removedRequirementCount,
  };
}

export async function deleteAllFilaments() {
  let deletedFilamentCount = 0;
  let removedRequirementCount = 0;

  await prisma.$transaction(async (tx) => {
    const removedRequirements = await tx.productFilamentRequirement.deleteMany({});
    removedRequirementCount = removedRequirements.count;

    const deletedFilaments = await tx.filament.deleteMany({});
    deletedFilamentCount = deletedFilaments.count;
  });

  return {
    deletedFilamentCount,
    removedRequirementCount,
  };
}
