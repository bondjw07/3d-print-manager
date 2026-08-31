import { prisma } from "@/lib/prisma";

export async function getBambuBuddyCategoryTagMappings() {
  return prisma.bambuBuddyCategoryTagMapping.findMany({ orderBy: { category: "asc" } });
}

export async function saveBambuBuddyCategoryTagMapping(category: string, bambuBuddyTag: string) {
  return prisma.bambuBuddyCategoryTagMapping.upsert({
    where: { category },
    create: { category, bambuBuddyTag },
    update: { bambuBuddyTag },
  });
}

export function getBambuBuddyTagForProductCategory(category: string, mappings: Array<{ category: string; bambuBuddyTag: string }>) {
  const normalizedCategory = category.trim().toLocaleLowerCase();
  return mappings.find((mapping) => mapping.category.trim().toLocaleLowerCase() === normalizedCategory)?.bambuBuddyTag ?? "";
}
