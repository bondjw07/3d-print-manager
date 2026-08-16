import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export async function getPricingTiers() {
  return prisma.pricingTier.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { label: "asc" }] });
}

export async function createPricingTier(input: { category: string; label: string; suggestedPrice: number }) {
  const existing = await prisma.pricingTier.findUnique({
    where: { category_label: { category: input.category, label: input.label } },
  });
  if (existing) return { tier: existing, created: false };

  const lastTier = await prisma.pricingTier.findFirst({
    where: { category: input.category },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  try {
    const tier = await prisma.pricingTier.create({ data: { ...input, sortOrder: (lastTier?.sortOrder ?? -1) + 1 } });
    return { tier, created: true };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const tier = await prisma.pricingTier.findUnique({
      where: { category_label: { category: input.category, label: input.label } },
    });
    if (!tier) throw error;
    return { tier, created: false };
  }
}

export async function updatePricingTier(input: { id: string; label: string; suggestedPrice: number }) {
  return prisma.pricingTier.update({ where: { id: input.id }, data: { label: input.label, suggestedPrice: input.suggestedPrice } });
}

export async function deletePricingTier(id: string) {
  return prisma.pricingTier.delete({ where: { id } });
}

export async function ensurePricingTierForCategory(pricingTierId: string | null | undefined, category: string) {
  if (!pricingTierId) return null;
  const tier = await prisma.pricingTier.findUnique({ where: { id: pricingTierId }, select: { id: true, category: true } });
  if (!tier || tier.category !== category) throw new Error("Select a pricing tier configured for this product category.");
  return tier.id;
}

export async function ensurePricingTierForProducts(pricingTierId: string, productIds: string[]) {
  const tier = await prisma.pricingTier.findUnique({ where: { id: pricingTierId }, select: { category: true } });
  if (!tier) throw new Error("Selected pricing tier was not found.");
  const qualifyingCount = await prisma.product.count({ where: { id: { in: productIds }, category: tier.category } });
  if (qualifyingCount !== productIds.length) throw new Error(`Only products in ${tier.category} can use this pricing tier.`);
}
