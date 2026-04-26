import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { refreshProductFromSourceUrl } from "../src/server/services/product-import-service";
import { resolveProductImageDiskPaths } from "../src/server/storage/product-image-paths";

const prisma = new PrismaClient();

type ProductImageRow = {
  id: string;
  imagePath: string;
  isPrimary: boolean;
  sortOrder: number;
};

type ProductRow = {
  id: string;
  publicName: string;
  importSourceUrl: string | null;
  productionNotes: string | null;
  images: ProductImageRow[];
};

type ProductImageCheck = {
  image: ProductImageRow;
  exists: boolean;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const limitArg = args.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number.parseInt(limitArg.slice("--limit=".length), 10) : null;

  return {
    apply,
    limit: Number.isFinite(limit) && (limit ?? 0) > 0 ? (limit as number) : null,
  };
}

function sourceUrlFromNotes(notes: string | null) {
  if (!notes) return null;

  const line = notes
    .split("\n")
    .find((candidate) => candidate.trim().toLowerCase().startsWith("imported url:"));

  if (!line) return null;

  const value = line.slice(line.indexOf(":") + 1).trim();
  return value || null;
}

async function imageExistsOnDisk(imagePath: string) {
  for (const diskPath of resolveProductImageDiskPaths(imagePath)) {
    try {
      await access(diskPath, fsConstants.F_OK);
      return true;
    } catch {
      // Continue to the next candidate disk path.
    }
  }

  return false;
}

async function inspectProductImages(product: ProductRow): Promise<ProductImageCheck[]> {
  const checks: ProductImageCheck[] = [];

  for (const image of product.images) {
    checks.push({
      image,
      exists: await imageExistsOnDisk(image.imagePath),
    });
  }

  return checks;
}

async function ensurePrimaryImage(productId: string, validImages: ProductImageRow[]) {
  if (validImages.length === 0) return;

  const alreadyPrimary = validImages.some((image) => image.isPrimary);
  if (alreadyPrimary) return;

  const firstBySortOrder = [...validImages].sort((a, b) => a.sortOrder - b.sortOrder)[0];
  if (!firstBySortOrder) return;

  await prisma.$transaction([
    prisma.productImage.updateMany({
      where: { productId },
      data: { isPrimary: false },
    }),
    prisma.productImage.update({
      where: { id: firstBySortOrder.id },
      data: { isPrimary: true },
    }),
  ]);
}

async function main() {
  const { apply, limit } = parseArgs();
  const products = await prisma.product.findMany({
    where: { images: { some: {} } },
    select: {
      id: true,
      publicName: true,
      importSourceUrl: true,
      productionNotes: true,
      images: {
        select: {
          id: true,
          imagePath: true,
          isPrimary: true,
          sortOrder: true,
        },
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
      },
    },
    orderBy: { updatedAt: "desc" },
    ...(limit ? { take: limit } : {}),
  });

  let touchedProducts = 0;
  let productsWithMissingImages = 0;
  let removedImageRows = 0;
  let reimportedProducts = 0;
  let reimportFailures = 0;
  let productsNeedingManualRecovery = 0;
  let promotedPrimaryCount = 0;

  for (const product of products) {
    const checks = await inspectProductImages(product);
    const missingChecks = checks.filter((check) => !check.exists);
    if (missingChecks.length === 0) {
      continue;
    }

    productsWithMissingImages += 1;
    const validImages = checks.filter((check) => check.exists).map((check) => check.image);
    const sourceUrl = product.importSourceUrl || sourceUrlFromNotes(product.productionNotes);

    if (!apply) {
      const status =
        validImages.length === 0
          ? sourceUrl
            ? "recoverable-from-source"
            : "manual-recovery-required"
          : "has-valid-images";
      console.log(
        `[DRY RUN] ${product.id} (${product.publicName}): missing=${missingChecks.length}, valid=${validImages.length}, status=${status}`,
      );
      continue;
    }

    touchedProducts += 1;
    const missingIds = missingChecks.map((check) => check.image.id);
    if (missingIds.length > 0) {
      const deleted = await prisma.productImage.deleteMany({
        where: { id: { in: missingIds } },
      });
      removedImageRows += deleted.count;
    }

    if (validImages.length === 0) {
      if (!sourceUrl) {
        productsNeedingManualRecovery += 1;
        console.log(
          `[APPLY] ${product.id} (${product.publicName}): removed ${missingChecks.length} missing rows, no source URL available for auto-reimport`,
        );
        continue;
      }

      try {
        const result = await refreshProductFromSourceUrl({
          productId: product.id,
          sourceUrl,
          importImages: true,
        });
        reimportedProducts += 1;
        console.log(
          `[APPLY] ${product.id} (${product.publicName}): reimported ${result.importedImageCount} image(s), skipped ${result.skippedDuplicateImageCount}`,
        );
      } catch (error) {
        reimportFailures += 1;
        const message = error instanceof Error ? error.message : String(error);
        console.log(`[APPLY] ${product.id} (${product.publicName}): reimport failed - ${message}`);
      }

      continue;
    }

    const hadPrimary = validImages.some((image) => image.isPrimary);
    if (!hadPrimary) {
      await ensurePrimaryImage(product.id, validImages);
      promotedPrimaryCount += 1;
      console.log(`[APPLY] ${product.id} (${product.publicName}): promoted a valid image to primary`);
    } else {
      console.log(`[APPLY] ${product.id} (${product.publicName}): removed ${missingChecks.length} missing row(s)`);
    }
  }

  console.log("");
  console.log("=== Missing Product Image Repair Summary ===");
  console.log(`mode: ${apply ? "apply" : "dry-run"}`);
  console.log(`products_scanned: ${products.length}`);
  console.log(`products_with_missing_images: ${productsWithMissingImages}`);
  console.log(`products_touched: ${touchedProducts}`);
  console.log(`removed_image_rows: ${removedImageRows}`);
  console.log(`reimported_products: ${reimportedProducts}`);
  console.log(`reimport_failures: ${reimportFailures}`);
  console.log(`products_needing_manual_recovery: ${productsNeedingManualRecovery}`);
  console.log(`promoted_primary_count: ${promotedPrimaryCount}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
