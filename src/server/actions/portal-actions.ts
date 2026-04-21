"use server";

import {
  MarketplaceEventType,
  ProductStatus,
} from "@/generated/prisma/client";
import { humanizeEnum, productStatusOptions } from "@/lib/domain";
import { localProductImageStorage } from "@/server/storage/local-storage-service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/server/auth/mock-auth-provider";
import {
  createFilament,
  deactivateFilament,
  updateFilament,
} from "@/server/services/filament-service";
import {
  bulkUpdateListingProductControls,
  runListingAction,
  updateListing,
  createListing,
} from "@/server/services/listing-service";
import { simulateMarketplaceEvent } from "@/server/services/marketplace-event-service";
import { updateInventory } from "@/server/services/inventory-service";
import { createQueueItem, updateQueueItem } from "@/server/services/queue-service";
import {
  convertRequestToQueue,
  createRequestForUser,
  updateRequestByAdmin,
} from "@/server/services/request-service";
import { updateDefaultMarketplace } from "@/server/services/settings-service";
import {
  disconnectMyMiniFactoryOAuth,
  saveMyMiniFactoryClientCredentials,
} from "@/server/services/myminifactory-auth-service";
import {
  addFilamentRequirement,
  bulkUpdateProductControls,
  createProduct,
  deleteProduct,
  deleteProductImage,
  guessAndApplyFilamentRequirements,
  removeFilamentRequirement,
  reorderFilamentRequirement,
  setPrimaryProductImage,
  setProductStatus,
  updateProduct,
} from "@/server/services/product-service";
import { importProductFromSourceUrl, refreshProductFromSourceUrl } from "@/server/services/product-import-service";
import {
  filamentFormSchema,
  inventoryUpdateSchema,
  listingBulkProductUpdateSchema,
  listingFormSchema,
  marketplaceEventSimulationSchema,
  myMiniFactoryCredentialsSchema,
  productImportSchema,
  productFilamentRequirementSchema,
  productBulkUpdateSchema,
  productBulkImportSchema,
  productFormSchema,
  queueCreateSchema,
  queueUpdateSchema,
  requestAdminUpdateSchema,
  requestCreateSchema,
  settingsSchema,
} from "@/server/validation/schemas";

function firstIssueMessage(error: { issues?: { message: string }[] }) {
  return error.issues?.[0]?.message ?? "Invalid form input.";
}

function appendStatus(path: string, key: "success" | "error", message: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${key}=${encodeURIComponent(message)}`;
}

export async function createProductAction(formData: FormData) {
  await requireRole("ADMIN");

  const redirectTo = String(formData.get("redirectTo") ?? "/admin/products");
  const parsed = productFormSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirect(appendStatus(redirectTo, "error", firstIssueMessage(parsed.error)));
  }

  const product = await createProduct(parsed.data);
  revalidatePath("/admin/products");
  revalidatePath("/catalog");
  redirect(appendStatus(`/admin/products/${product.id}`, "success", "Product created."));
}

export async function importProductFromUrlAction(formData: FormData) {
  await requireRole("ADMIN");

  const redirectTo = String(formData.get("redirectTo") ?? "/admin/products");
  const parsed = productImportSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirect(appendStatus(redirectTo, "error", firstIssueMessage(parsed.error)));
  }

  try {
    const result = await importProductFromSourceUrl({
      sourceUrl: parsed.data.sourceUrl,
      importImages: parsed.data.importImages,
    });

    revalidatePath("/admin/products");
    revalidatePath(`/admin/products/${result.product.id}`);
    revalidatePath("/catalog");

    const duplicateDetail =
      result.skippedDuplicateImageCount > 0
        ? ` ${result.skippedDuplicateImageCount} duplicate image${result.skippedDuplicateImageCount === 1 ? "" : "s"} skipped.`
        : "";
    const message = result.wasDuplicate
      ? `${humanizeEnum(result.source)} already imported. Opened existing product; no duplicate was created.`
      : `${humanizeEnum(result.source)} import completed with ${result.importedImageCount} image${result.importedImageCount === 1 ? "" : "s"}.${duplicateDetail} Filament guess: ${result.guessedFilamentCount} matched, ${result.addedFilamentRequirementCount} added.`;
    redirect(appendStatus(`/admin/products/${result.product.id}`, "success", message));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed.";
    redirect(appendStatus(redirectTo, "error", message));
  }
}

export async function refreshProductFromUrlAction(formData: FormData) {
  await requireRole("ADMIN");

  const productId = String(formData.get("productId") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? `/admin/products/${productId}`);
  const parsed = productImportSchema.safeParse(Object.fromEntries(formData));

  if (!productId || !parsed.success) {
    redirect(appendStatus(redirectTo, "error", parsed.success ? "Product id is required." : firstIssueMessage(parsed.error)));
  }

  try {
    const result = await refreshProductFromSourceUrl({
      productId,
      sourceUrl: parsed.data.sourceUrl,
      importImages: parsed.data.importImages,
    });

    revalidatePath("/admin/products");
    revalidatePath(`/admin/products/${productId}`);
    revalidatePath("/catalog");
    revalidatePath("/admin");

    const message = `Updated from ${humanizeEnum(result.source)}: ${result.importedImageCount} new image${result.importedImageCount === 1 ? "" : "s"} imported, ${result.skippedDuplicateImageCount} duplicate${result.skippedDuplicateImageCount === 1 ? "" : "s"} skipped. Filament guess: ${result.guessedFilamentCount} matched, ${result.addedFilamentRequirementCount} added.`;
    redirect(appendStatus(redirectTo, "success", message));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refresh failed.";
    redirect(appendStatus(redirectTo, "error", message));
  }
}

export async function bulkImportProductsFromUrlsAction(formData: FormData) {
  await requireRole("ADMIN");

  const redirectTo = String(formData.get("redirectTo") ?? "/admin/products");
  const parsed = productBulkImportSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirect(appendStatus(redirectTo, "error", firstIssueMessage(parsed.error)));
  }

  const rawUrls = parsed.data.sourceUrls
    .split(/\r?\n|,|;/g)
    .map((value) => value.trim())
    .filter(Boolean);

  const urls = Array.from(new Set(rawUrls));
  if (urls.length === 0) {
    redirect(appendStatus(redirectTo, "error", "Paste at least one URL."));
  }

  const validUrls: string[] = [];
  const invalidUrls: string[] = [];

  for (const candidate of urls) {
    try {
      const parsedUrl = new URL(candidate);
      validUrls.push(parsedUrl.toString());
    } catch {
      invalidUrls.push(candidate);
    }
  }

  if (validUrls.length === 0) {
    redirect(appendStatus(redirectTo, "error", "No valid URLs found in the bulk import list."));
  }

  let importedCount = 0;
  let duplicateCount = 0;
  let failedImportCount = 0;
  let firstFailureMessage: string | null = null;

  for (const sourceUrl of validUrls) {
    try {
      const result = await importProductFromSourceUrl({
        sourceUrl,
        importImages: parsed.data.importImages,
      });
      if (result.wasDuplicate) {
        duplicateCount += 1;
      } else {
        importedCount += 1;
      }
    } catch (error) {
      failedImportCount += 1;
      const message = error instanceof Error ? error.message : "Import failed.";
      if (!firstFailureMessage) {
        firstFailureMessage = message;
      }
      console.error("Bulk import failed", { sourceUrl, message });
    }
  }

  revalidatePath("/admin/products");
  revalidatePath("/catalog");
  revalidatePath("/admin");

  const invalidCount = invalidUrls.length;
  const failedCount = failedImportCount + invalidCount;
  const totalCount = urls.length;

  const summary = `Processed ${totalCount} URL${totalCount === 1 ? "" : "s"}: ${importedCount} imported, ${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"} skipped, ${failedCount} failed.`;
  const detail =
    invalidCount > 0
      ? ` ${invalidCount} URL${invalidCount === 1 ? " was" : "s were"} invalid.`
      : firstFailureMessage
        ? ` First failure: ${firstFailureMessage}`
        : "";

  redirect(appendStatus(redirectTo, failedCount > 0 ? "error" : "success", `${summary}${detail}`));
}

export async function updateProductAction(formData: FormData) {
  await requireRole("ADMIN");

  const productId = String(formData.get("productId") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? `/admin/products/${productId}`);

  if (!productId) {
    redirect(appendStatus(redirectTo, "error", "Product id is required."));
  }

  const parsed = productFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(appendStatus(redirectTo, "error", firstIssueMessage(parsed.error)));
  }

  await updateProduct(productId, parsed.data);
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/catalog");
  redirect(appendStatus(redirectTo, "success", "Product saved."));
}

export async function deleteProductAction(formData: FormData) {
  await requireRole("ADMIN");

  const productId = String(formData.get("productId") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/admin/products");
  const confirmWord = String(formData.get("confirmWord") ?? "")
    .trim()
    .toLowerCase();

  if (!productId) {
    redirect(appendStatus(redirectTo, "error", "Product id is required."));
  }

  try {
    const { deletedImagePaths, deletedQueueCount, deletedRequestCount } = await deleteProduct(productId, {
      force: confirmWord === "delete",
    });
    await Promise.all(
      deletedImagePaths.map((imagePath) => localProductImageStorage.deleteProductImage(imagePath)),
    );

    revalidatePath("/admin/products");
    revalidatePath("/catalog");
    revalidatePath("/admin");
    const linkedCleanupDetail =
      deletedQueueCount > 0 || deletedRequestCount > 0
        ? ` Removed ${deletedQueueCount} queue item${deletedQueueCount === 1 ? "" : "s"} and ${deletedRequestCount} request${deletedRequestCount === 1 ? "" : "s"}.`
        : "";
    redirect(appendStatus(redirectTo, "success", `Product deleted.${linkedCleanupDetail}`));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete product.";
    redirect(appendStatus(redirectTo, "error", message));
  }
}

export async function setProductStatusAction(formData: FormData) {
  await requireRole("ADMIN");

  const productId = String(formData.get("productId") ?? "");
  const statusRaw = String(formData.get("status") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? `/admin/products/${productId}`);

  if (!productId || !productStatusOptions.includes(statusRaw as (typeof productStatusOptions)[number])) {
    redirect(appendStatus(redirectTo, "error", "Invalid status update."));
  }

  const status = statusRaw as ProductStatus;
  await setProductStatus(productId, status);
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/catalog");
  redirect(appendStatus(redirectTo, "success", "Status updated."));
}

export async function bulkUpdateProductControlsAction(formData: FormData) {
  await requireRole("ADMIN");

  const redirectTo = String(formData.get("redirectTo") ?? "/admin/products");
  const parsed = productBulkUpdateSchema.safeParse({
    productIds: formData.getAll("productIds").map((value) => String(value)),
    status: formData.get("status"),
    isPublic: formData.get("isPublic"),
    isRequestable: formData.get("isRequestable"),
  });

  if (!parsed.success) {
    redirect(appendStatus(redirectTo, "error", firstIssueMessage(parsed.error)));
  }

  const updatedProducts = await bulkUpdateProductControls(parsed.data);
  revalidatePath("/admin/products");
  revalidatePath("/admin/listings");
  revalidatePath("/catalog");
  revalidatePath("/admin");
  redirect(
    appendStatus(
      redirectTo,
      "success",
      `${updatedProducts} product${updatedProducts === 1 ? "" : "s"} updated.`,
    ),
  );
}

export async function addProductFilamentRequirementAction(formData: FormData) {
  await requireRole("ADMIN");

  const productId = String(formData.get("productId") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? `/admin/products/${productId}`);
  const parsed = productFilamentRequirementSchema.safeParse(Object.fromEntries(formData));

  if (!productId || !parsed.success) {
    redirect(appendStatus(redirectTo, "error", parsed.success ? "Product is required." : firstIssueMessage(parsed.error)));
  }

  await addFilamentRequirement({ productId, ...parsed.data });
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/queue");
  redirect(appendStatus(redirectTo, "success", "Filament requirement updated."));
}

export async function removeProductFilamentRequirementAction(formData: FormData) {
  await requireRole("ADMIN");

  const requirementId = String(formData.get("requirementId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? `/admin/products/${productId}`);

  if (!requirementId) {
    redirect(appendStatus(redirectTo, "error", "Requirement is missing."));
  }

  await removeFilamentRequirement(requirementId);
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/queue");
  redirect(appendStatus(redirectTo, "success", "Filament requirement removed."));
}

export async function reorderProductFilamentRequirementAction(formData: FormData) {
  await requireRole("ADMIN");

  const requirementId = String(formData.get("requirementId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const sortOrder = Number(formData.get("sortOrder") ?? 0);
  const redirectTo = String(formData.get("redirectTo") ?? `/admin/products/${productId}`);

  if (!requirementId || Number.isNaN(sortOrder)) {
    redirect(appendStatus(redirectTo, "error", "Invalid reorder request."));
  }

  await reorderFilamentRequirement(requirementId, sortOrder);
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/queue");
  redirect(appendStatus(redirectTo, "success", "Requirement order updated."));
}

export async function guessProductFilamentRequirementsAction(formData: FormData) {
  await requireRole("ADMIN");

  const productId = String(formData.get("productId") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? `/admin/products/${productId}`);

  if (!productId) {
    redirect(appendStatus(redirectTo, "error", "Product is required."));
  }

  try {
    const result = await guessAndApplyFilamentRequirements({ productId });
    revalidatePath(`/admin/products/${productId}`);
    revalidatePath("/admin/queue");

    const message =
      result.matchedCount === 0
        ? "No filament names detected in product text."
        : `Filament guess complete: ${result.matchedCount} matched, ${result.addedCount} added, ${result.alreadyAssignedCount} already assigned.`;
    redirect(appendStatus(redirectTo, "success", message));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to guess filament requirements.";
    redirect(appendStatus(redirectTo, "error", message));
  }
}

export async function setPrimaryImageAction(formData: FormData) {
  await requireRole("ADMIN");

  const productId = String(formData.get("productId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? `/admin/products/${productId}`);

  if (!productId || !imageId) {
    redirect(appendStatus(redirectTo, "error", "Missing image reference."));
  }

  await setPrimaryProductImage(productId, imageId);
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/catalog");
  redirect(appendStatus(redirectTo, "success", "Primary image selected."));
}

export async function deleteProductImageAction(formData: FormData) {
  await requireRole("ADMIN");

  const imageId = String(formData.get("imageId") ?? "");
  const imagePath = String(formData.get("imagePath") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? `/admin/products/${productId}`);

  if (!imageId) {
    redirect(appendStatus(redirectTo, "error", "Missing image reference."));
  }

  await deleteProductImage(imageId);
  if (imagePath) {
    await localProductImageStorage.deleteProductImage(imagePath);
  }

  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/catalog");
  redirect(appendStatus(redirectTo, "success", "Image deleted."));
}

export async function createFilamentAction(formData: FormData) {
  await requireRole("ADMIN");

  const redirectTo = String(formData.get("redirectTo") ?? "/admin/filaments");
  const parsed = filamentFormSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirect(appendStatus(redirectTo, "error", firstIssueMessage(parsed.error)));
  }

  await createFilament(parsed.data);
  revalidatePath("/admin/filaments");
  revalidatePath("/admin/products");
  redirect(appendStatus(redirectTo, "success", "Filament created."));
}

export async function updateFilamentAction(formData: FormData) {
  await requireRole("ADMIN");

  const filamentId = String(formData.get("filamentId") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/admin/filaments");
  const parsed = filamentFormSchema.safeParse(Object.fromEntries(formData));

  if (!filamentId || !parsed.success) {
    redirect(appendStatus(redirectTo, "error", parsed.success ? "Filament id is missing." : firstIssueMessage(parsed.error)));
  }

  await updateFilament(filamentId, parsed.data);
  revalidatePath("/admin/filaments");
  revalidatePath("/admin/products");
  redirect(appendStatus(redirectTo, "success", "Filament updated."));
}

export async function deactivateFilamentAction(formData: FormData) {
  await requireRole("ADMIN");

  const filamentId = String(formData.get("filamentId") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/admin/filaments");

  if (!filamentId) {
    redirect(appendStatus(redirectTo, "error", "Filament id is required."));
  }

  await deactivateFilament(filamentId);
  revalidatePath("/admin/filaments");
  redirect(appendStatus(redirectTo, "success", "Filament deactivated."));
}

export async function createListingAction(formData: FormData) {
  await requireRole("ADMIN");

  const redirectTo = String(formData.get("redirectTo") ?? "/admin/listings");
  const parsed = listingFormSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirect(appendStatus(redirectTo, "error", firstIssueMessage(parsed.error)));
  }

  await createListing(parsed.data);
  revalidatePath("/admin/listings");
  revalidatePath("/admin/products");
  revalidatePath("/catalog");
  redirect(appendStatus(redirectTo, "success", "Listing saved."));
}

export async function updateListingAction(formData: FormData) {
  await requireRole("ADMIN");

  const listingId = String(formData.get("listingId") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/admin/listings");
  const parsed = listingFormSchema.safeParse(Object.fromEntries(formData));

  if (!listingId || !parsed.success) {
    redirect(appendStatus(redirectTo, "error", parsed.success ? "Listing id is missing." : firstIssueMessage(parsed.error)));
  }

  await updateListing(listingId, {
    externalListingId: parsed.data.externalListingId,
    title: parsed.data.title,
    description: parsed.data.description,
    tags: parsed.data.tags,
    price: parsed.data.price,
    externalUrl: parsed.data.externalUrl,
    status: parsed.data.status,
    syncStatus: parsed.data.syncStatus,
  });

  revalidatePath("/admin/listings");
  revalidatePath("/catalog");
  redirect(appendStatus(redirectTo, "success", "Listing updated."));
}

export async function bulkUpdateListingProductControlsAction(formData: FormData) {
  await requireRole("ADMIN");

  const redirectTo = String(formData.get("redirectTo") ?? "/admin/listings");
  const parsed = listingBulkProductUpdateSchema.safeParse({
    listingIds: formData.getAll("listingIds").map((value) => String(value)),
    status: formData.get("status"),
    isPublic: formData.get("isPublic"),
    isRequestable: formData.get("isRequestable"),
  });

  if (!parsed.success) {
    redirect(appendStatus(redirectTo, "error", firstIssueMessage(parsed.error)));
  }

  const updatedProducts = await bulkUpdateListingProductControls(parsed.data);
  revalidatePath("/admin/listings");
  revalidatePath("/admin/products");
  revalidatePath("/catalog");
  revalidatePath("/admin");
  redirect(
    appendStatus(
      redirectTo,
      "success",
      `${updatedProducts} product${updatedProducts === 1 ? "" : "s"} updated from selected listings.`,
    ),
  );
}

export async function runListingActionAction(formData: FormData) {
  await requireRole("ADMIN");

  const listingId = String(formData.get("listingId") ?? "");
  const action = String(formData.get("action") ?? "") as "publish" | "update" | "remove" | "refresh";
  const redirectTo = String(formData.get("redirectTo") ?? "/admin/listings");

  if (!listingId || !["publish", "update", "remove", "refresh"].includes(action)) {
    redirect(appendStatus(redirectTo, "error", "Invalid listing action."));
  }

  await runListingAction(listingId, action);
  revalidatePath("/admin/listings");
  revalidatePath("/catalog");
  redirect(appendStatus(redirectTo, "success", `Mock ${action} completed.`));
}

export async function submitRequestAction(formData: FormData) {
  const user = await requireRole(["REQUEST_USER", "ADMIN"]);

  const redirectTo = String(formData.get("redirectTo") ?? "/my-requests");
  const parsed = requestCreateSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirect(appendStatus(redirectTo, "error", firstIssueMessage(parsed.error)));
  }

  await createRequestForUser({
    requesterUserId: user.id,
    productId: parsed.data.productId,
    quantity: parsed.data.quantity,
    notes: parsed.data.notes,
  });

  revalidatePath("/my-requests");
  revalidatePath("/admin/requests");
  redirect(appendStatus(redirectTo, "success", "Request submitted."));
}

export async function updateRequestByAdminAction(formData: FormData) {
  await requireRole("ADMIN");

  const requestId = String(formData.get("requestId") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/admin/requests");
  const parsed = requestAdminUpdateSchema.safeParse(Object.fromEntries(formData));

  if (!requestId || !parsed.success) {
    redirect(appendStatus(redirectTo, "error", parsed.success ? "Request id is missing." : firstIssueMessage(parsed.error)));
  }

  await updateRequestByAdmin(requestId, parsed.data);
  revalidatePath("/admin/requests");
  revalidatePath("/my-requests");
  redirect(appendStatus(redirectTo, "success", "Request updated."));
}

export async function convertRequestToQueueAction(formData: FormData) {
  await requireRole("ADMIN");

  const requestId = String(formData.get("requestId") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/admin/requests");

  if (!requestId) {
    redirect(appendStatus(redirectTo, "error", "Request id is required."));
  }

  await convertRequestToQueue(requestId);
  revalidatePath("/admin/requests");
  revalidatePath("/admin/queue");
  revalidatePath("/admin/inventory");
  revalidatePath("/my-requests");
  redirect(appendStatus(redirectTo, "success", "Request converted to queue item."));
}

export async function createQueueItemAction(formData: FormData) {
  await requireRole("ADMIN");

  const redirectTo = String(formData.get("redirectTo") ?? "/admin/queue");
  const parsed = queueCreateSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirect(appendStatus(redirectTo, "error", firstIssueMessage(parsed.error)));
  }

  await createQueueItem(parsed.data);
  revalidatePath("/admin/queue");
  redirect(appendStatus(redirectTo, "success", "Queue item created."));
}

export async function updateQueueItemAction(formData: FormData) {
  await requireRole("ADMIN");

  const queueItemId = String(formData.get("queueItemId") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/admin/queue");
  const parsed = queueUpdateSchema.safeParse(Object.fromEntries(formData));

  if (!queueItemId || !parsed.success) {
    redirect(appendStatus(redirectTo, "error", parsed.success ? "Queue item id missing." : firstIssueMessage(parsed.error)));
  }

  await updateQueueItem(queueItemId, parsed.data);
  revalidatePath("/admin/queue");
  redirect(appendStatus(redirectTo, "success", "Queue item updated."));
}

export async function updateInventoryAction(formData: FormData) {
  await requireRole("ADMIN");

  const productId = String(formData.get("productId") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/admin/inventory");
  const parsed = inventoryUpdateSchema.safeParse(Object.fromEntries(formData));

  if (!productId || !parsed.success) {
    redirect(appendStatus(redirectTo, "error", parsed.success ? "Product id missing." : firstIssueMessage(parsed.error)));
  }

  await updateInventory(productId, parsed.data);
  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  redirect(appendStatus(redirectTo, "success", "Inventory updated."));
}

export async function updateSettingsAction(formData: FormData) {
  await requireRole("ADMIN");

  const redirectTo = String(formData.get("redirectTo") ?? "/admin/settings");
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirect(appendStatus(redirectTo, "error", firstIssueMessage(parsed.error)));
  }

  await updateDefaultMarketplace(parsed.data.defaultMarketplace);
  revalidatePath("/admin/settings");
  revalidatePath("/catalog");
  redirect(appendStatus(redirectTo, "success", "Default marketplace updated."));
}

export async function updateMyMiniFactoryCredentialsAction(formData: FormData) {
  await requireRole("ADMIN");

  const redirectTo = String(formData.get("redirectTo") ?? "/admin/settings");
  const parsed = myMiniFactoryCredentialsSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirect(appendStatus(redirectTo, "error", firstIssueMessage(parsed.error)));
  }

  try {
    await saveMyMiniFactoryClientCredentials({
      clientId: parsed.data.myMiniFactoryClientId,
      clientSecret: parsed.data.myMiniFactoryClientSecret,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save MyMiniFactory credentials.";
    redirect(appendStatus(redirectTo, "error", message));
  }

  revalidatePath("/admin/settings");
  redirect(appendStatus(redirectTo, "success", "MyMiniFactory OAuth credentials saved. Connect OAuth to enable bulk import."));
}

export async function disconnectMyMiniFactoryOAuthAction(formData: FormData) {
  await requireRole("ADMIN");

  const redirectTo = String(formData.get("redirectTo") ?? "/admin/settings");

  try {
    await disconnectMyMiniFactoryOAuth();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to disconnect MyMiniFactory OAuth.";
    redirect(appendStatus(redirectTo, "error", message));
  }

  revalidatePath("/admin/settings");
  redirect(appendStatus(redirectTo, "success", "MyMiniFactory OAuth connection removed."));
}

export async function simulateMarketplaceEventAction(formData: FormData) {
  await requireRole("ADMIN");

  const redirectTo = String(formData.get("redirectTo") ?? "/admin/listings");
  const parsed = marketplaceEventSimulationSchema.safeParse({
    marketplaceType: formData.get("marketplaceType"),
    eventType: formData.get("eventType"),
    listingId: formData.get("listingId") || undefined,
    productId: formData.get("productId") || undefined,
    payloadSummary: formData.get("payloadSummary"),
  });

  if (!parsed.success) {
    redirect(appendStatus(redirectTo, "error", firstIssueMessage(parsed.error)));
  }

  await simulateMarketplaceEvent({
    marketplaceType: parsed.data.marketplaceType,
    eventType: parsed.data.eventType as MarketplaceEventType,
    payloadSummary: parsed.data.payloadSummary,
    relatedListingId: parsed.data.listingId,
    relatedProductId: parsed.data.productId,
  });

  revalidatePath("/admin/listings");
  revalidatePath("/admin/queue");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  redirect(appendStatus(redirectTo, "success", "Mock event processed."));
}
