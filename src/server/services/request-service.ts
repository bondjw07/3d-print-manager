import { QueuePriority, QueueSourceType, QueueStatus, RequestStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { recalculateInventoryAvailable } from "./inventory-service";

export async function getRequestsForUser(userId: string) {
  return prisma.request.findMany({
    where: { requesterUserId: userId },
    include: {
      product: {
        include: {
          images: {
            where: { isPrimary: true },
            take: 1,
          },
        },
      },
      queueItems: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getAllRequests() {
  return prisma.request.findMany({
    include: {
      requesterUser: true,
      product: true,
      queueItems: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createRequestForUser(input: {
  requesterUserId: string;
  productId: string;
  quantity: number;
  notes?: string;
}) {
  const product = await prisma.product.findUnique({ where: { id: input.productId } });

  if (!product || !product.isRequestable) {
    throw new Error("This product is not currently requestable.");
  }

  return prisma.request.create({
    data: {
      requesterUserId: input.requesterUserId,
      productId: input.productId,
      quantity: input.quantity,
      notes: input.notes,
      status: RequestStatus.SUBMITTED,
    },
  });
}

export async function updateRequestByAdmin(
  requestId: string,
  input: {
    status: RequestStatus;
    adminNotes?: string;
  },
) {
  return prisma.request.update({
    where: { id: requestId },
    data: {
      status: input.status,
      adminNotes: input.adminNotes || null,
    },
  });
}

export async function convertRequestToQueue(requestId: string) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.request.findUnique({ where: { id: requestId } });
    if (!request) {
      throw new Error("Request not found.");
    }

    const queueItem = await tx.queueItem.create({
      data: {
        productId: request.productId,
        sourceType: QueueSourceType.REQUEST,
        sourceReferenceId: request.id,
        sourceRequestId: request.id,
        requesterUserId: request.requesterUserId,
        quantity: request.quantity,
        status: QueueStatus.PENDING,
        priority: QueuePriority.NORMAL,
      },
    });

    await tx.request.update({
      where: { id: requestId },
      data: { status: RequestStatus.QUEUED },
    });

    await tx.inventoryRecord.updateMany({
      where: { productId: request.productId },
      data: {
        reserved: { increment: request.quantity },
      },
    });

    const inventory = await tx.inventoryRecord.findUnique({
      where: { productId: request.productId },
    });

    if (inventory) {
      await tx.inventoryRecord.update({
        where: { id: inventory.id },
        data: { available: recalculateInventoryAvailable(inventory.onHand, inventory.reserved + request.quantity, inventory.committed) },
      });
    }

    return queueItem;
  });
}

export async function getPendingRequestCount() {
  return prisma.request.count({
    where: {
      status: {
        in: [RequestStatus.SUBMITTED, RequestStatus.UNDER_REVIEW],
      },
    },
  });
}
