import { prisma } from "@/lib/prisma";

export async function getShopifyCategoryTagMappings() {
  return prisma.shopifyCategoryTagMapping.findMany({ orderBy: { category: "asc" } });
}

export async function saveShopifyCategoryTagMapping(category: string, categoryTag: string) {
  return prisma.shopifyCategoryTagMapping.upsert({
    where: { category },
    create: { category, categoryTag },
    update: { categoryTag },
  });
}

export function getShopifyCategoryTagForProductCategory(category: string, mappings: Array<{ category: string; categoryTag: string }>) {
  return mappings.find((mapping) => mapping.category === category)?.categoryTag ?? "";
}
