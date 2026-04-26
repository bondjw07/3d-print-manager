import { Prisma, QueuePriority, QueueSourceType, QueueStatus, RequestStatus, type UserRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateRequestEstimate } from "@/lib/request-estimates";
import {
  DEFAULT_SCALE_PERCENT,
  defaultFilamentScalePercentForModelScale,
  isKitKilnModel,
  isKitKilnUserModelScaleAllowed,
  normalizeScalePercent,
} from "@/lib/request-scale";
import { recalculateInventoryAvailable } from "./inventory-service";

const ADMIN_MODEL_SCALE_MIN_PERCENT = 10;
const ADMIN_MODEL_SCALE_MAX_PERCENT = 400;
const ADMIN_FILAMENT_SCALE_MIN_PERCENT = 1;
const ADMIN_FILAMENT_SCALE_MAX_PERCENT = 400;
const FULL_FILAMENT_ROLL_GRAMS = 1000;
const REQUEST_FILAMENT_PLANNING_STATUSES: RequestStatus[] = [
  RequestStatus.SUBMITTED,
  RequestStatus.UNDER_REVIEW,
  RequestStatus.APPROVED,
  RequestStatus.QUEUED,
];

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (typeof value === "bigint") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  if (value && typeof value === "object" && "toString" in value && typeof value.toString === "function") {
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function roundToTwo(value: number) {
  return Math.round(value * 100) / 100;
}

function assertAdminModelScalePercent(modelScalePercent: number) {
  const normalized = normalizeScalePercent(modelScalePercent);
  if (normalized < ADMIN_MODEL_SCALE_MIN_PERCENT || normalized > ADMIN_MODEL_SCALE_MAX_PERCENT) {
    throw new Error(`Model scale must be between ${ADMIN_MODEL_SCALE_MIN_PERCENT}% and ${ADMIN_MODEL_SCALE_MAX_PERCENT}%.`);
  }
  return normalized;
}

function assertAdminFilamentScalePercent(filamentScalePercent: number) {
  const normalized = normalizeScalePercent(filamentScalePercent);
  if (normalized < ADMIN_FILAMENT_SCALE_MIN_PERCENT || normalized > ADMIN_FILAMENT_SCALE_MAX_PERCENT) {
    throw new Error(
      `Filament scale must be between ${ADMIN_FILAMENT_SCALE_MIN_PERCENT}% and ${ADMIN_FILAMENT_SCALE_MAX_PERCENT}%.`,
    );
  }
  return normalized;
}

function resolveRequesterModelScalePercent(input: {
  modelScalePercent: number;
  isKitKilnProduct: boolean;
  actorRole: UserRole;
}) {
  const normalized = normalizeScalePercent(input.modelScalePercent);

  if (input.actorRole === "ADMIN") {
    return assertAdminModelScalePercent(normalized);
  }

  if (!input.isKitKilnProduct) {
    if (normalized !== DEFAULT_SCALE_PERCENT) {
      throw new Error("Scaled requests are only available for Kit Kiln models.");
    }

    return DEFAULT_SCALE_PERCENT;
  }

  if (!isKitKilnUserModelScaleAllowed(normalized)) {
    throw new Error("Kit Kiln requests currently support 75% or 100% model scale.");
  }

  return normalized;
}

export type ProductRequestSummary = {
  productId: string;
  requestCount: number;
  totalQuantity: number;
  latestStatus: RequestStatus;
  latestRequestedAt: Date;
};

export type FilamentRequestPurchaseInsight = {
  filamentId: string;
  filamentName: string;
  materialType: string;
  colorLabel: string;
  availableGrams: number;
  remainingGrams: number;
  totalRequiredGrams: number;
  missingGrams: number;
  requestCount: number;
  blockedRequestCount: number;
  requestsWithMissingEstimate: number;
};

export type FilamentRequestPurchaseDashboard = {
  openRequestCount: number;
  requestsWithoutFilamentRequirements: number;
  requestsWithMissingEstimates: number;
  insights: FilamentRequestPurchaseInsight[];
};

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

export async function getRequestSummariesForUserByProductIds(userId: string, productIds: string[]) {
  if (productIds.length === 0) {
    return new Map<string, ProductRequestSummary>();
  }

  const requests = await prisma.request.findMany({
    where: {
      requesterUserId: userId,
      productId: { in: productIds },
    },
    select: {
      productId: true,
      quantity: true,
      status: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "desc" }],
  });

  const summaries = new Map<string, ProductRequestSummary>();

  for (const request of requests) {
    const existing = summaries.get(request.productId);

    if (!existing) {
      summaries.set(request.productId, {
        productId: request.productId,
        requestCount: 1,
        totalQuantity: request.quantity,
        latestStatus: request.status,
        latestRequestedAt: request.createdAt,
      });
      continue;
    }

    summaries.set(request.productId, {
      ...existing,
      requestCount: existing.requestCount + 1,
      totalQuantity: existing.totalQuantity + request.quantity,
    });
  }

  return summaries;
}

export async function getAllRequests() {
  const requests = await prisma.request.findMany({
    include: {
      requesterUser: true,
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
            include: {
              filament: {
                select: {
                  id: true,
                  name: true,
                  spoolCostPerKg: true,
                  fullRollCount: true,
                  partialRolls: {
                    select: {
                      gramsRemaining: true,
                    },
                  },
                },
              },
            },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return requests.map((request) => ({
    ...request,
    ...calculateRequestEstimate(request),
  }));
}

export async function getFilamentRequestPurchaseDashboard(): Promise<FilamentRequestPurchaseDashboard> {
  const requests = await prisma.request.findMany({
    where: {
      status: {
        in: REQUEST_FILAMENT_PLANNING_STATUSES,
      },
    },
    select: {
      id: true,
      quantity: true,
      filamentScalePercent: true,
      createdAt: true,
      product: {
        select: {
          filamentRequirements: {
            orderBy: { sortOrder: "asc" },
            select: {
              filamentId: true,
              estimatedGramsPerPrint: true,
              filament: {
                select: {
                  id: true,
                  name: true,
                  materialType: true,
                  colorLabel: true,
                  fullRollCount: true,
                  partialRolls: {
                    select: {
                      gramsRemaining: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const requestsWithMissingEstimateIds = new Set<string>();
  let requestsWithoutFilamentRequirements = 0;
  const insightMap = new Map<
    string,
    {
      filamentId: string;
      filamentName: string;
      materialType: string;
      colorLabel: string;
      availableGrams: number;
      remainingGrams: number;
      totalRequiredGrams: number;
      missingGrams: number;
      requestIds: Set<string>;
      blockedRequestIds: Set<string>;
      unknownEstimateRequestIds: Set<string>;
    }
  >();

  for (const request of requests) {
    const requirements = request.product.filamentRequirements;
    if (requirements.length === 0) {
      requestsWithoutFilamentRequirements += 1;
      continue;
    }

    const filamentScaleMultiplier = Math.max(0, (toFiniteNumber(request.filamentScalePercent) ?? 100) / 100);

    for (const requirement of requirements) {
      const partialRollGrams = requirement.filament.partialRolls.reduce(
        (sum, roll) => sum + (toFiniteNumber(roll.gramsRemaining) ?? 0),
        0,
      );
      const availableGrams = requirement.filament.fullRollCount * FULL_FILAMENT_ROLL_GRAMS + partialRollGrams;
      const insight = insightMap.get(requirement.filamentId) ?? {
        filamentId: requirement.filamentId,
        filamentName: requirement.filament.name,
        materialType: requirement.filament.materialType,
        colorLabel: requirement.filament.colorLabel,
        availableGrams,
        remainingGrams: availableGrams,
        totalRequiredGrams: 0,
        missingGrams: 0,
        requestIds: new Set<string>(),
        blockedRequestIds: new Set<string>(),
        unknownEstimateRequestIds: new Set<string>(),
      };

      const estimatedGramsPerPrint = toFiniteNumber(requirement.estimatedGramsPerPrint);
      if (estimatedGramsPerPrint === null || estimatedGramsPerPrint <= 0) {
        insight.unknownEstimateRequestIds.add(request.id);
        requestsWithMissingEstimateIds.add(request.id);
        insightMap.set(requirement.filamentId, insight);
        continue;
      }

      const requiredGrams = estimatedGramsPerPrint * request.quantity * filamentScaleMultiplier;
      insight.requestIds.add(request.id);
      insight.totalRequiredGrams += requiredGrams;

      if (insight.remainingGrams + 0.001 >= requiredGrams) {
        insight.remainingGrams = Math.max(0, insight.remainingGrams - requiredGrams);
      } else {
        const shortfallGrams = requiredGrams - insight.remainingGrams;
        insight.missingGrams += shortfallGrams;
        insight.remainingGrams = 0;
        insight.blockedRequestIds.add(request.id);
      }

      insightMap.set(requirement.filamentId, insight);
    }
  }

  const insights = Array.from(insightMap.values())
    .map((insight): FilamentRequestPurchaseInsight => ({
      filamentId: insight.filamentId,
      filamentName: insight.filamentName,
      materialType: insight.materialType,
      colorLabel: insight.colorLabel,
      availableGrams: roundToTwo(insight.availableGrams),
      remainingGrams: roundToTwo(insight.remainingGrams),
      totalRequiredGrams: roundToTwo(insight.totalRequiredGrams),
      missingGrams: roundToTwo(insight.missingGrams),
      requestCount: insight.requestIds.size,
      blockedRequestCount: insight.blockedRequestIds.size,
      requestsWithMissingEstimate: insight.unknownEstimateRequestIds.size,
    }))
    .sort((left, right) => {
      if (right.blockedRequestCount !== left.blockedRequestCount) {
        return right.blockedRequestCount - left.blockedRequestCount;
      }

      if (right.missingGrams !== left.missingGrams) {
        return right.missingGrams - left.missingGrams;
      }

      if (right.requestCount !== left.requestCount) {
        return right.requestCount - left.requestCount;
      }

      if (right.totalRequiredGrams !== left.totalRequiredGrams) {
        return right.totalRequiredGrams - left.totalRequiredGrams;
      }

      return left.filamentName.localeCompare(right.filamentName);
    });

  return {
    openRequestCount: requests.length,
    requestsWithoutFilamentRequirements,
    requestsWithMissingEstimates: requestsWithMissingEstimateIds.size,
    insights,
  };
}

export async function getRequestByIdForAdmin(requestId: string) {
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: {
      requesterUser: true,
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
            include: {
              filament: true,
            },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
      queueItems: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!request) {
    return null;
  }

  return {
    ...request,
    ...calculateRequestEstimate(request),
  };
}

export async function createRequestForUser(input: {
  requesterUserId: string;
  productId: string;
  quantity: number;
  modelScalePercent: number;
  notes?: string;
  actorRole: UserRole;
}) {
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    select: {
      id: true,
      isRequestable: true,
      importSourceCreatorName: true,
      importSourceUrl: true,
      productionNotes: true,
    },
  });

  if (!product || !product.isRequestable) {
    throw new Error("This product is not currently requestable.");
  }

  const isKitKilnProductRequest = isKitKilnModel(product);
  const modelScalePercent = resolveRequesterModelScalePercent({
    modelScalePercent: input.modelScalePercent,
    isKitKilnProduct: isKitKilnProductRequest,
    actorRole: input.actorRole,
  });
  const filamentScalePercent = defaultFilamentScalePercentForModelScale({
    modelScalePercent,
    isKitKilnModel: isKitKilnProductRequest,
  });

  return prisma.request.create({
    data: {
      requesterUserId: input.requesterUserId,
      productId: input.productId,
      quantity: input.quantity,
      modelScalePercent,
      filamentScalePercent,
      notes: input.notes,
      status: RequestStatus.SUBMITTED,
    },
  });
}

export async function updateSubmittedRequestForUser(
  requestId: string,
  requesterUserId: string,
  input: {
    quantity: number;
    modelScalePercent: number;
    notes?: string;
  },
  actorRole: UserRole,
) {
  const request = await prisma.request.findFirst({
    where: {
      id: requestId,
      requesterUserId,
      status: RequestStatus.SUBMITTED,
    },
    select: {
      id: true,
      product: {
        select: {
          importSourceCreatorName: true,
          importSourceUrl: true,
          productionNotes: true,
        },
      },
    },
  });

  if (!request) {
    throw new Error("Only submitted requests can be edited.");
  }

  const isKitKilnProductRequest = isKitKilnModel(request.product);
  const modelScalePercent = resolveRequesterModelScalePercent({
    modelScalePercent: input.modelScalePercent,
    isKitKilnProduct: isKitKilnProductRequest,
    actorRole,
  });
  const filamentScalePercent = defaultFilamentScalePercentForModelScale({
    modelScalePercent,
    isKitKilnModel: isKitKilnProductRequest,
  });

  await prisma.request.update({
    where: { id: request.id },
    data: {
      quantity: input.quantity,
      modelScalePercent,
      filamentScalePercent,
      notes: input.notes || null,
    },
  });
}

export async function deleteSubmittedRequestForUser(requestId: string, requesterUserId: string) {
  const deleted = await prisma.request.deleteMany({
    where: {
      id: requestId,
      requesterUserId,
      status: RequestStatus.SUBMITTED,
    },
  });

  if (deleted.count === 0) {
    throw new Error("Only submitted requests can be deleted.");
  }
}

export async function updateRequestByAdmin(
  requestId: string,
  input: {
    status: RequestStatus;
    modelScalePercent?: number;
    filamentScalePercent?: number;
    adminNotes?: string;
  },
) {
  const data: Prisma.RequestUpdateInput = {
    status: input.status,
    adminNotes: input.adminNotes || null,
  };

  if (input.modelScalePercent !== undefined) {
    data.modelScalePercent = assertAdminModelScalePercent(input.modelScalePercent);
  }

  if (input.filamentScalePercent !== undefined) {
    data.filamentScalePercent = assertAdminFilamentScalePercent(input.filamentScalePercent);
  }

  return prisma.request.update({
    where: { id: requestId },
    data,
  });
}

export async function bulkUpdateRequestsByAdmin(input: {
  requestIds: string[];
  status: RequestStatus;
  adminNotes?: string;
}) {
  const requestIds = Array.from(new Set(input.requestIds));
  if (requestIds.length === 0) {
    return 0;
  }

  const updated = await prisma.request.updateMany({
    where: {
      id: { in: requestIds },
    },
    data: {
      status: input.status,
      adminNotes: input.adminNotes || null,
    },
  });

  return updated.count;
}

export async function convertRequestToQueue(requestId: string) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.request.findUnique({ where: { id: requestId } });
    if (!request) {
      throw new Error("Request not found.");
    }

    const hasQueueItem = await tx.queueItem.findFirst({
      where: { sourceRequestId: request.id },
      select: { id: true },
    });

    if (request.status === RequestStatus.QUEUED || hasQueueItem) {
      throw new Error("Request has already been converted to queue.");
    }

    const queueItem = await tx.queueItem.create({
      data: {
        productId: request.productId,
        sourceType: QueueSourceType.REQUEST,
        sourceReferenceId: request.id,
        sourceRequestId: request.id,
        requesterUserId: request.requesterUserId,
        quantity: request.quantity,
        modelScalePercent: request.modelScalePercent,
        filamentScalePercent: request.filamentScalePercent,
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

export async function bulkConvertRequestsToQueue(requestIds: string[]) {
  const uniqueRequestIds = Array.from(new Set(requestIds));
  if (uniqueRequestIds.length === 0) {
    return {
      selectedCount: 0,
      convertedCount: 0,
      skippedAlreadyQueuedCount: 0,
      skippedNotFoundCount: 0,
    };
  }

  const requests = await prisma.request.findMany({
    where: { id: { in: uniqueRequestIds } },
    select: { id: true, status: true },
  });
  const requestById = new Map(requests.map((request) => [request.id, request]));

  const linkedQueueItems = await prisma.queueItem.findMany({
    where: { sourceRequestId: { in: uniqueRequestIds } },
    select: { sourceRequestId: true },
  });
  const queuedRequestIds = new Set(
    linkedQueueItems
      .map((queueItem) => queueItem.sourceRequestId)
      .filter((sourceRequestId): sourceRequestId is string => Boolean(sourceRequestId)),
  );

  let convertedCount = 0;
  let skippedAlreadyQueuedCount = 0;
  let skippedNotFoundCount = 0;

  for (const requestId of uniqueRequestIds) {
    const request = requestById.get(requestId);
    if (!request) {
      skippedNotFoundCount += 1;
      continue;
    }

    if (request.status === RequestStatus.QUEUED || queuedRequestIds.has(requestId)) {
      skippedAlreadyQueuedCount += 1;
      continue;
    }

    try {
      await convertRequestToQueue(requestId);
      convertedCount += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "Request not found.") {
        skippedNotFoundCount += 1;
        continue;
      }

      if (message === "Request has already been converted to queue.") {
        skippedAlreadyQueuedCount += 1;
        continue;
      }

      throw error;
    }
  }

  return {
    selectedCount: uniqueRequestIds.length,
    convertedCount,
    skippedAlreadyQueuedCount,
    skippedNotFoundCount,
  };
}

export async function bulkDeleteRequestsByAdmin(requestIds: string[]) {
  const uniqueRequestIds = Array.from(new Set(requestIds));
  if (uniqueRequestIds.length === 0) {
    return {
      selectedCount: 0,
      deletedCount: 0,
      blockedCount: 0,
      notFoundCount: 0,
    };
  }

  const existingRequests = await prisma.request.findMany({
    where: { id: { in: uniqueRequestIds } },
    select: { id: true },
  });
  const existingRequestIds = new Set(existingRequests.map((request) => request.id));

  const linkedQueueItems = await prisma.queueItem.findMany({
    where: { sourceRequestId: { in: uniqueRequestIds } },
    select: { sourceRequestId: true },
  });
  const blockedIds = new Set(
    linkedQueueItems
      .map((queueItem) => queueItem.sourceRequestId)
      .filter((sourceRequestId): sourceRequestId is string => Boolean(sourceRequestId)),
  );

  const deletableRequestIds = uniqueRequestIds.filter(
    (requestId) => existingRequestIds.has(requestId) && !blockedIds.has(requestId),
  );

  const deleted = deletableRequestIds.length
    ? await prisma.request.deleteMany({
        where: { id: { in: deletableRequestIds } },
      })
    : { count: 0 };

  const notFoundCount = uniqueRequestIds.filter((requestId) => !existingRequestIds.has(requestId)).length;

  return {
    selectedCount: uniqueRequestIds.length,
    deletedCount: deleted.count,
    blockedCount: blockedIds.size,
    notFoundCount,
  };
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
