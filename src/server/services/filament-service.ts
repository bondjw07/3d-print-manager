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
