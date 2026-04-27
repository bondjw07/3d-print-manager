import { prisma } from "@/lib/prisma";

export function recalculateInventoryAvailable(onHand: number, reserved: number, committed: number) {
  return onHand - reserved - committed;
}

export async function getInventory() {
  return prisma.inventoryRecord.findMany({
    include: {
      product: {
        include: {
          images: {
            where: { isPrimary: true },
            take: 1,
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function updateInventory(
  productId: string,
  input: {
    onHand: number;
    reserved: number;
    committed: number;
    reorderThreshold?: number;
  },
) {
  const available = recalculateInventoryAvailable(input.onHand, input.reserved, input.committed);

  return prisma.inventoryRecord.upsert({
    where: { productId },
    create: {
      productId,
      onHand: input.onHand,
      reserved: input.reserved,
      committed: input.committed,
      available,
      reorderThreshold: input.reorderThreshold,
    },
    update: {
      onHand: input.onHand,
      reserved: input.reserved,
      committed: input.committed,
      available,
      reorderThreshold: input.reorderThreshold,
    },
  });
}

export async function addInventoryStock(
  productId: string,
  input: {
    quantity: number;
  },
) {
  const existing = await prisma.inventoryRecord.findUnique({
    where: { productId },
  });

  if (!existing) {
    return prisma.inventoryRecord.create({
      data: {
        productId,
        onHand: input.quantity,
        reserved: 0,
        committed: 0,
        available: input.quantity,
      },
    });
  }

  return prisma.inventoryRecord.update({
    where: { id: existing.id },
    data: {
      onHand: { increment: input.quantity },
      available: { increment: input.quantity },
    },
  });
}

export async function getLowStockItems() {
  const records = await prisma.inventoryRecord.findMany({
    where: {
      reorderThreshold: { not: null },
    },
    include: { product: true },
    orderBy: { available: "asc" },
  });

  return records.filter(
    (record) =>
      record.available <= 0 ||
      (record.reorderThreshold !== null && record.available <= record.reorderThreshold),
  );
}
