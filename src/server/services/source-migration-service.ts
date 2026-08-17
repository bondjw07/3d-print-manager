import { ProductImportSource, SourceMigrationStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { discoverThangsCreatorModelUrls } from "@/server/importers/thangs-importer";
import { resolveProductImporter } from "@/server/importers/provider";

const THANGS_SOURCE = ProductImportSource.THANGS;

function normalizeUrl(value: string) {
  const parsed = new URL(value);
  parsed.hash = "";
  parsed.search = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return parsed.toString();
}

function normalizeCreatorUrl(value: string) {
  return normalizeUrl(value).toLowerCase();
}

function creatorKey(value: string) {
  return value.trim().toLocaleLowerCase().replace(/^the\s+/, "");
}

function titleKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\|\s*(?:no supports?|no ams|no glue).*$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

type TargetModel = {
  title: string;
  referenceId: string;
  sourceUrl: string;
  normalizedUrl: string;
};

async function fetchTargetModel(sourceUrl: string): Promise<TargetModel | null> {
  try {
    const importer = resolveProductImporter(sourceUrl);
    if (!importer) return null;
    const imported = await importer.importFromUrl(sourceUrl);
    if (!imported.sourceReferenceId) return null;
    return {
      title: imported.title,
      referenceId: imported.sourceReferenceId,
      sourceUrl: imported.sourceUrl,
      normalizedUrl: normalizeUrl(imported.sourceUrl),
    };
  } catch {
    // An unavailable individual model should remain unmatched and never block review.
    return null;
  }
}

export async function scanThangsCreatorMigration(input: {
  sourceCreator: string;
  sourceCreatorUrl?: string;
  targetCreatorUrl: string;
  createdByUserId?: string;
}) {
  const sourceCreator = input.sourceCreator.trim();
  const sourceCreatorUrl = input.sourceCreatorUrl?.trim() || undefined;
  if (!sourceCreator) throw new Error("Source creator name is required.");

  const targetDiscovery = await discoverThangsCreatorModelUrls({ creatorUrl: input.targetCreatorUrl, maxPages: 200 });
  const targetModels = (await mapWithConcurrency(targetDiscovery.modelUrls, 5, fetchTargetModel)).filter(
    (model): model is TargetModel => Boolean(model),
  );

  const sourceCreatorUrlKey = sourceCreatorUrl ? normalizeCreatorUrl(sourceCreatorUrl) : null;
  const products = await prisma.product.findMany({
    where: { importSource: THANGS_SOURCE },
    select: {
      id: true,
      publicName: true,
      internalName: true,
      importSourceCreatorName: true,
      importSourceCreatorUrl: true,
      importSourceReferenceId: true,
      importSourceUrl: true,
      importSourceNormalizedUrl: true,
    },
    orderBy: { publicName: "asc" },
  });
  const sourceNameKey = creatorKey(sourceCreator);
  const sourceProducts = products.filter((product) => {
    const matchesName = product.importSourceCreatorName ? creatorKey(product.importSourceCreatorName) === sourceNameKey : false;
    const matchesUrl = sourceCreatorUrlKey && product.importSourceCreatorUrl
      ? normalizeCreatorUrl(product.importSourceCreatorUrl) === sourceCreatorUrlKey
      : false;
    return matchesName || matchesUrl;
  });

  const targetsByTitle = new Map<string, TargetModel[]>();
  for (const target of targetModels) {
    const key = titleKey(target.title);
    if (!key) continue;
    targetsByTitle.set(key, [...(targetsByTitle.get(key) ?? []), target]);
  }

  return prisma.sourceMigration.create({
    data: {
      sourceCreator,
      sourceCreatorUrl: sourceCreatorUrl ?? null,
      targetCreator: targetDiscovery.creatorName ?? "Target creator",
      targetCreatorUrl: targetDiscovery.creatorUrl,
      createdByUserId: input.createdByUserId,
      rows: {
        create: sourceProducts.map((product) => {
          const candidates = targetsByTitle.get(titleKey(product.publicName)) ?? targetsByTitle.get(titleKey(product.internalName)) ?? [];
          const target = candidates.length === 1 ? candidates[0] : null;
          return {
            productId: product.id,
            productTitle: product.publicName,
            oldReferenceId: product.importSourceReferenceId,
            oldSourceUrl: product.importSourceUrl,
            oldNormalizedUrl: product.importSourceNormalizedUrl,
            targetTitle: target?.title,
            targetReferenceId: target?.referenceId,
            targetSourceUrl: target?.sourceUrl,
            targetNormalizedUrl: target?.normalizedUrl,
            matchMethod: target ? "Exact normalized title" : null,
            confidence: target ? 100 : null,
          };
        }),
      },
    },
  });
}

export async function getLatestSourceMigration() {
  return prisma.sourceMigration.findFirst({
    orderBy: { scannedAt: "desc" },
    include: { rows: { orderBy: [{ status: "asc" }, { productTitle: "asc" }] } },
  });
}

export async function applySourceMigrationRows(input: { migrationId: string; rowIds: string[] }) {
  const rowIds = Array.from(new Set(input.rowIds)).slice(0, 100);
  if (!input.migrationId || rowIds.length === 0) throw new Error("Select at least one mapped product.");

  const migration = await prisma.sourceMigration.findUnique({ where: { id: input.migrationId } });
  if (!migration) throw new Error("Migration scan was not found.");

  let applied = 0;
  let conflicts = 0;
  for (const rowId of rowIds) {
    try {
      await prisma.$transaction(async (tx) => {
        const row = await tx.sourceMigrationRow.findFirst({ where: { id: rowId, migrationId: migration.id } });
        if (!row || row.status === SourceMigrationStatus.APPLIED) return;
        if (!row.targetReferenceId || !row.targetSourceUrl || !row.targetNormalizedUrl) {
          throw new Error("This row has no unambiguous target match.");
        }

        const owner = await tx.product.findFirst({
          where: {
            id: { not: row.productId },
            importSource: THANGS_SOURCE,
            OR: [
              { importSourceReferenceId: row.targetReferenceId },
              { importSourceNormalizedUrl: row.targetNormalizedUrl },
            ],
          },
          select: { id: true, publicName: true },
        });
        if (owner) throw new Error(`Target identity is already assigned to ${owner.publicName}.`);

        await tx.product.update({
          where: { id: row.productId },
          data: {
            importSourceReferenceId: row.targetReferenceId,
            importSourceUrl: row.targetSourceUrl,
            importSourceNormalizedUrl: row.targetNormalizedUrl,
            importSourceCreatorName: migration.targetCreator,
            importSourceCreatorUrl: migration.targetCreatorUrl,
          },
        });
        await tx.sourceMigrationRow.update({
          where: { id: row.id },
          data: { status: SourceMigrationStatus.APPLIED, appliedAt: new Date(), error: null },
        });
        applied += 1;
      });
    } catch (error) {
      conflicts += 1;
      await prisma.sourceMigrationRow.updateMany({
        where: { id: rowId, migrationId: migration.id, status: { not: SourceMigrationStatus.APPLIED } },
        data: { status: SourceMigrationStatus.CONFLICT, error: error instanceof Error ? error.message : "Unable to apply migration." },
      });
    }
  }
  return { applied, conflicts };
}

export async function setSourceMigrationRowTarget(input: { migrationId: string; rowId: string; targetSourceUrl: string }) {
  const migration = await prisma.sourceMigration.findUnique({ where: { id: input.migrationId } });
  if (!migration) throw new Error("Migration scan was not found.");
  const row = await prisma.sourceMigrationRow.findFirst({ where: { id: input.rowId, migrationId: migration.id } });
  if (!row || row.status === SourceMigrationStatus.APPLIED) throw new Error("This migration row can no longer be edited.");

  const target = await fetchTargetModel(input.targetSourceUrl);
  if (!target) throw new Error("Unable to read a Thangs model ID from that target listing.");
  const targetCreatorUrl = new URL(target.sourceUrl).pathname.match(/^\/designer\/[^/]+/i)?.[0];
  const expectedCreatorUrl = new URL(migration.targetCreatorUrl).pathname;
  if (!targetCreatorUrl || targetCreatorUrl.toLocaleLowerCase() !== expectedCreatorUrl.toLocaleLowerCase()) {
    throw new Error("The selected listing does not belong to this migration's destination creator.");
  }

  await prisma.sourceMigrationRow.update({
    where: { id: row.id },
    data: {
      targetTitle: target.title,
      targetReferenceId: target.referenceId,
      targetSourceUrl: target.sourceUrl,
      targetNormalizedUrl: target.normalizedUrl,
      matchMethod: "Manual URL",
      confidence: 100,
      status: SourceMigrationStatus.PENDING,
      error: null,
    },
  });
}
