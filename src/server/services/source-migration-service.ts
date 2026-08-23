import { ProductImportSource, SourceMigrationStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

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
    .replace(/\b(?:free\s+)?(?:no\s+(?:ams|supports?|glue)|support[- ]?free|easy\s+(?:print|assembly)|beginner\s+friendly)\b/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

type TargetModel = {
  title: string;
  referenceId: string;
  sourceUrl: string;
  normalizedUrl: string;
};

type CsvModel = TargetModel & { creator: string };

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (character === '"' && next === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(cell); cell = ""; }
    else if (character === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((values) => values.some((value) => value.trim()));
}

function parseThangsCsv(text: string, label: string): CsvModel[] {
  const [header, ...rows] = parseCsv(text);
  const required = ["creator", "title", "thangs_model_id", "thangs_url"];
  const columns = new Map((header ?? []).map((value, index) => [value.trim().toLowerCase(), index]));
  if (!required.every((column) => columns.has(column))) throw new Error(`${label} CSV must include: ${required.join(", ")}.`);
  const models = rows.map((values, index) => {
    const value = (column: string) => values[columns.get(column) ?? -1]?.trim() ?? "";
    const sourceUrl = value("thangs_url");
    const referenceId = value("thangs_model_id");
    if (!sourceUrl || !/^\d+$/.test(referenceId)) throw new Error(`${label} CSV row ${index + 2} has an invalid Thangs URL or model ID.`);
    const parsed = new URL(sourceUrl);
    if (parsed.hostname !== "thangs.com" || !/^\/designer\/[^/]+\/3d-model\/.+-\d+$/i.test(parsed.pathname)) throw new Error(`${label} CSV row ${index + 2} is not a canonical Thangs model URL.`);
    return { creator: value("creator"), title: value("title"), referenceId, sourceUrl: normalizeUrl(sourceUrl), normalizedUrl: normalizeUrl(sourceUrl) };
  });
  if (!models.length) throw new Error(`${label} CSV has no model rows.`);
  if (new Set(models.map((model) => model.referenceId)).size !== models.length) throw new Error(`${label} CSV contains duplicate Thangs model IDs.`);
  return models;
}

const ignoredTitleTokens = new Set("no ams support supports glue kit kits free print printable easy assembly beginner friendly prop cosplay model the a an of for and with sword dagger axe hammer container weapon chained final fantasy star wars marvel dc halo gun plane class".split(" "));
function titleTokens(value: string) { return new Set(titleKey(value).split(" ").filter((token) => token && !ignoredTitleTokens.has(token))); }
function similarity(left: string, right: string) {
  const leftTokens = titleTokens(left); const rightTokens = titleTokens(right);
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return overlap / Math.max(1, leftTokens.size + rightTokens.size - overlap);
}

export async function buildThangsCreatorMigrationFromCsv(input: {
  sourceCreator: string;
  sourceCreatorUrl?: string;
  targetCreatorUrl: string;
  sourceCsv: string;
  targetCsv: string;
  createdByUserId?: string;
}) {
  const sourceCreator = input.sourceCreator.trim();
  const sourceCreatorUrl = input.sourceCreatorUrl?.trim() || undefined;
  if (!sourceCreator) throw new Error("Source creator name is required.");

  const sourceModels = parseThangsCsv(input.sourceCsv, "Loot Lab");
  const targetModels = parseThangsCsv(input.targetCsv, "Kit Kiln");
  const targetCreatorUrl = normalizeUrl(input.targetCreatorUrl);
  const targetCreator = targetModels[0]?.creator || "Target creator";

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
  const sourceByReferenceId = new Map(sourceModels.map((model) => [model.referenceId, model]));
  const sourceByUrl = new Map(sourceModels.map((model) => [model.normalizedUrl, model]));
  const sourceProducts = products.filter((product) => {
    const matchesName = product.importSourceCreatorName ? creatorKey(product.importSourceCreatorName) === sourceNameKey : false;
    const matchesUrl = sourceCreatorUrlKey && product.importSourceCreatorUrl
      ? normalizeCreatorUrl(product.importSourceCreatorUrl) === sourceCreatorUrlKey
      : false;
    return Boolean(sourceByReferenceId.get(product.importSourceReferenceId ?? "") || sourceByUrl.get(product.importSourceNormalizedUrl ?? "") || matchesName || matchesUrl);
  });

  const proposedTargets = sourceProducts.map((product) => {
    const source = sourceByReferenceId.get(product.importSourceReferenceId ?? "") ?? sourceByUrl.get(product.importSourceNormalizedUrl ?? "");
    const matchTitle = source?.title || product.publicName;
    const ranked = targetModels.map((target) => ({ target, score: similarity(matchTitle, target.title) })).sort((left, right) => right.score - left.score);
    const best = ranked[0]; const runnerUp = ranked[1];
    const confidence = Math.round((best?.score ?? 0) * 100);
    const ambiguous = Boolean(runnerUp && best && best.score - runnerUp.score < 0.1);
    return { product, target: best?.target, confidence: ambiguous ? Math.min(confidence, 55) : confidence };
  });
  const proposedTargetCounts = new Map<string, number>();
  for (const proposal of proposedTargets) if (proposal.target) proposedTargetCounts.set(proposal.target.referenceId, (proposedTargetCounts.get(proposal.target.referenceId) ?? 0) + 1);

  return prisma.sourceMigration.create({
    data: {
      sourceCreator,
      sourceCreatorUrl: sourceCreatorUrl ?? null,
      targetCreator,
      targetCreatorUrl,
      createdByUserId: input.createdByUserId,
      targets: {
        create: targetModels.map((target) => ({
          title: target.title,
          referenceId: target.referenceId,
          sourceUrl: target.sourceUrl,
          normalizedUrl: target.normalizedUrl,
        })),
      },
      rows: {
        create: proposedTargets.map(({ product, target, confidence }) => {
          const duplicateProposal = target && (proposedTargetCounts.get(target.referenceId) ?? 0) > 1;
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
            matchMethod: duplicateProposal ? "Fuzzy title — duplicate candidate" : "Fuzzy title",
            confidence: duplicateProposal ? Math.min(confidence, 35) : confidence,
          };
        }),
      },
    },
  }).then((migration) => ({ migration, sourceCatalogCount: sourceModels.length, targetCatalogCount: targetModels.length }));
}

export async function getLatestSourceMigration() {
  return prisma.sourceMigration.findFirst({
    orderBy: { scannedAt: "desc" },
    include: {
      rows: { orderBy: [{ status: "asc" }, { productTitle: "asc" }] },
      targets: { orderBy: { title: "asc" } },
    },
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

export async function setSourceMigrationRowTarget(input: { migrationId: string; rowId: string; targetId: string }) {
  const migration = await prisma.sourceMigration.findUnique({ where: { id: input.migrationId } });
  if (!migration) throw new Error("Migration scan was not found.");
  const row = await prisma.sourceMigrationRow.findFirst({ where: { id: input.rowId, migrationId: migration.id } });
  if (!row || row.status === SourceMigrationStatus.APPLIED) throw new Error("This migration row can no longer be edited.");

  const target = await prisma.sourceMigrationTarget.findFirst({
    where: { id: input.targetId, migrationId: migration.id },
  });
  if (!target) throw new Error("Choose a Kit Kiln listing from this migration's catalog.");

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
