import {
  RequestStatus,
  QueueStatus,
  type QueuePriority,
  type QueueSourceType,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export async function getQueueItems(filters?: {
  status?: QueueStatus;
  sourceType?: QueueSourceType;
  priority?: QueuePriority;
}) {
  return prisma.queueItem.findMany({
    where: {
      status: filters?.status,
      sourceType: filters?.sourceType,
      priority: filters?.priority,
    },
    include: {
      product: {
        include: {
          images: {
            where: { isPrimary: true },
            take: 1,
          },
          listings: {
            where: { externalUrl: { not: null } },
            select: {
              externalUrl: true,
            },
            orderBy: { updatedAt: "desc" },
          },
          filamentRequirements: {
            include: { filament: true },
          },
        },
      },
      requesterUser: true,
      sourceRequest: true,
    },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
}

export async function getQueueItemByIdForAdmin(queueItemId: string) {
  return prisma.queueItem.findUnique({
    where: { id: queueItemId },
    include: {
      product: {
        include: {
          images: {
            where: { isPrimary: true },
            take: 1,
          },
          listings: {
            where: { externalUrl: { not: null } },
            select: {
              externalUrl: true,
            },
            orderBy: { updatedAt: "desc" },
          },
        },
      },
      requesterUser: true,
      sourceRequest: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });
}

export async function createQueueItem(input: {
  productId: string;
  sourceType: QueueSourceType;
  sourceReferenceId?: string;
  requesterUserId?: string;
  quantity: number;
  status: QueueStatus;
  priority: QueuePriority;
  dueDate?: Date;
  notes?: string;
}) {
  return prisma.queueItem.create({
    data: {
      productId: input.productId,
      sourceType: input.sourceType,
      sourceReferenceId: input.sourceReferenceId || null,
      requesterUserId: input.requesterUserId || null,
      quantity: input.quantity,
      status: input.status,
      priority: input.priority,
      dueDate: input.dueDate,
      notes: input.notes || null,
    },
  });
}

export async function updateQueueItem(
  queueItemId: string,
  input: {
    status: QueueStatus;
    priority: QueuePriority;
    notes?: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    const updatedQueueItem = await tx.queueItem.update({
      where: { id: queueItemId },
      data: {
        status: input.status,
        priority: input.priority,
        notes: input.notes || null,
      },
    });

    if (updatedQueueItem.sourceRequestId) {
      if (input.status === QueueStatus.COMPLETED) {
        await tx.request.update({
          where: { id: updatedQueueItem.sourceRequestId },
          data: { status: RequestStatus.COMPLETED },
        });
      } else if (input.status === QueueStatus.CANCELLED) {
        await tx.request.update({
          where: { id: updatedQueueItem.sourceRequestId },
          data: { status: RequestStatus.CANCELLED },
        });
      }
    }

    return updatedQueueItem;
  });
}

export async function getQueueStatusCounts() {
  const counts = await prisma.queueItem.groupBy({
    by: ["status"],
    _count: { status: true },
  });

  const defaultMap: Record<QueueStatus, number> = {
    PENDING: 0,
    READY_TO_PRINT: 0,
    PRINTING: 0,
    POST_PROCESSING: 0,
    PACKED: 0,
    READY_FOR_PICKUP: 0,
    SHIPPED: 0,
    COMPLETED: 0,
    CANCELLED: 0,
    BLOCKED: 0,
  };

  for (const entry of counts) {
    defaultMap[entry.status] = entry._count.status;
  }

  return defaultMap;
}

export async function getRecentQueueItems(limit = 8) {
  return prisma.queueItem.findMany({
    include: {
      product: true,
      requesterUser: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getFilamentDemandSummary() {
  const activeQueueStatuses: QueueStatus[] = [
    QueueStatus.PENDING,
    QueueStatus.READY_TO_PRINT,
    QueueStatus.PRINTING,
    QueueStatus.POST_PROCESSING,
    QueueStatus.PACKED,
    QueueStatus.BLOCKED,
  ];

  const queueItems = await prisma.queueItem.findMany({
    where: {
      status: { in: activeQueueStatuses },
    },
    include: {
      product: {
        include: {
          filamentRequirements: {
            include: {
              filament: true,
            },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const summaryMap = new Map<
    string,
    {
      filamentId: string;
      filamentName: string;
      materialType: string;
      colorLabel: string;
      queueItemCount: number;
      totalUnits: number;
      totalEstimatedGrams: number;
      missingGramEstimates: number;
    }
  >();

  for (const queueItem of queueItems) {
    for (const requirement of queueItem.product.filamentRequirements) {
      const key = requirement.filamentId;
      const existing = summaryMap.get(key) ?? {
        filamentId: requirement.filamentId,
        filamentName: requirement.filament.name,
        materialType: requirement.filament.materialType,
        colorLabel: requirement.filament.colorLabel,
        queueItemCount: 0,
        totalUnits: 0,
        totalEstimatedGrams: 0,
        missingGramEstimates: 0,
      };

      existing.queueItemCount += 1;
      existing.totalUnits += queueItem.quantity;
      const filamentScaleMultiplier = Number(queueItem.filamentScalePercent ?? 100) / 100;

      if (requirement.estimatedGramsPerPrint !== null) {
        existing.totalEstimatedGrams += Number(requirement.estimatedGramsPerPrint) * queueItem.quantity * filamentScaleMultiplier;
      } else {
        existing.missingGramEstimates += queueItem.quantity;
      }

      summaryMap.set(key, existing);
    }
  }

  return Array.from(summaryMap.values()).sort((a, b) => b.totalEstimatedGrams - a.totalEstimatedGrams);
}
