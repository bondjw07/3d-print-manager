import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ThreeMfMappingReview } from "@/components/admin/three-mf-mapping-review";
import { inspectThreeMf } from "@/server/files/three-mf-processor";
import { withMaterializedSourceCandidate } from "@/server/files/source-candidate-service";
import { getSettings } from "@/server/services/settings-service";

export default async function ProcessThreeMfPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sourceFileId?: string; entryPath?: string }>;
}) {
  const [{ id: productId }, query] = await Promise.all([params, searchParams]);
  const [product, sourceFile, reference, mappings, settings] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId }, select: { id: true, publicName: true } }),
    query.sourceFileId ? prisma.productSourceFile.findFirst({ where: { id: query.sourceFileId, productId } }) : null,
    prisma.applicationFile.findUnique({ where: { kind: "P2S_REFERENCE" } }),
    prisma.bambuBuddyFilamentMapping.findMany({ orderBy: [{ materialType: "asc" }, { colorName: "asc" }] }),
    getSettings(),
  ]);
  if (!product || !sourceFile) notFound();
  const entryPath = query.entryPath ?? null;
  let inspection = null;
  let inspectionError: string | null = null;
  if (!reference) inspectionError = "Configure a P2S reference in Admin Settings before processing Product files.";
  else {
    try {
      inspection = await withMaterializedSourceCandidate({
        sourceFile,
        entryPath,
        maxBytes: settings.fileUploadMaxBytes,
        run: (filePath) => inspectThreeMf(filePath, mappings),
      });
    } catch (error) {
      inspectionError = error instanceof Error ? error.message : "Unable to inspect the selected 3MF.";
    }
  }

  return <div className="space-y-4">
    <PageHeader>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Mapping Review</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{product.publicName}</h1>
          <p className="mt-1 text-sm text-slate-600">Review every proposed plate mapping before generating the processed P2S 3MF.</p>
        </div>
        <Link href={`/admin/products/${product.id}/files`}><Button variant="secondary">Back to Files</Button></Link>
      </div>
    </PageHeader>
    <Card>
      <CardHeader><CardTitle>Plate mappings</CardTitle><CardDescription>Automatic matches are suggestions until you explicitly confirm them.</CardDescription></CardHeader>
      <CardContent>
        {inspectionError ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{inspectionError}</p> : inspection ? <ThreeMfMappingReview
          productId={product.id}
          sourceFileId={sourceFile.id}
          entryPath={entryPath}
          sourceName={entryPath ? `${sourceFile.originalName} / ${entryPath}` : sourceFile.originalName}
          plates={inspection.plates}
          mappings={mappings.map((mapping) => ({ id: mapping.id, colorName: mapping.colorName, hexColor: mapping.hexColor, materialType: mapping.materialType, effectType: mapping.effectType }))}
        /> : null}
      </CardContent>
    </Card>
  </div>;
}
