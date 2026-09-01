import { prisma } from "@/lib/prisma";

export function normalizeBambuBuddyMaterialType(value: string) {
  return value.trim().toUpperCase();
}

export function normalizeBambuBuddyHexColor(value: string) {
  const hex = value.trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(hex)) throw new Error("Hex color must be in #RRGGBB format.");
  return hex;
}

export async function getBambuBuddyFilamentMappings() {
  return prisma.bambuBuddyFilamentMapping.findMany({ orderBy: [{ materialType: "asc" }, { colorName: "asc" }] });
}

export async function upsertBambuBuddyFilamentMapping(input: {
  materialType: string; hexColor: string; colorName: string; manufacturer?: string; materialName?: string; effectType?: string;
}) {
  const materialType = normalizeBambuBuddyMaterialType(input.materialType);
  const hexColor = normalizeBambuBuddyHexColor(input.hexColor);
  const colorName = input.colorName.trim();
  if (!materialType || !colorName) throw new Error("Material type and display name are required.");
  const optional = (value?: string) => value?.trim() || null;
  return prisma.$transaction(async (transaction) => {
    const mapping = await transaction.bambuBuddyFilamentMapping.upsert({
      where: { materialType_hexColor: { materialType, hexColor } },
      create: { materialType, hexColor, colorName, manufacturer: optional(input.manufacturer), materialName: optional(input.materialName), effectType: optional(input.effectType) },
      update: { colorName, manufacturer: optional(input.manufacturer), materialName: optional(input.materialName), effectType: optional(input.effectType) },
    });
    await transaction.productMappingDraft.deleteMany();
    return mapping;
  });
}
