import { prisma } from "@/lib/prisma";

export async function getFilaments(includeInactive = true) {
  return prisma.filament.findMany({
    where: includeInactive ? undefined : { isActive: true },
    include: {
      productRequirements: {
        include: { product: true },
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
