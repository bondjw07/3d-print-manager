import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProductSourceFiles } from "@/components/admin/product-source-files";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PrintReadyUpload } from "@/components/admin/print-ready-upload";
import { BambuBuddyPublishButton } from "@/components/admin/bambuddy-publish-button";

export default async function ProductFilesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ success?: string; error?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      sourceFiles: { orderBy: { createdAt: "desc" } },
      artifacts: true,
    },
  });
  if (!product) notFound();
  const processed = product.artifacts.find((artifact) => artifact.kind === "PROCESSED_3MF");
  const printReady = product.artifacts.find((artifact) => artifact.kind === "PRINT_READY");
  const printReadyIsStale = Boolean(processed && printReady && printReady.basedOnProcessedSha256 !== processed.sha256);
  const publishedIsCurrent = Boolean(printReady && product.bambuBuddyFileId && printReady.publishedSha256 === printReady.sha256);

  return <div className="space-y-4">
    <PageHeader>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Files &amp; Print Preparation</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{product.publicName}</h1>
          <p className="mt-1 text-sm text-slate-600">Preserve sources, prepare a P2S project, slice manually, and publish to BamBuddy.</p>
        </div>
        <Link href={`/admin/products/${product.id}`}><Button variant="secondary">Back to Product</Button></Link>
      </div>
    </PageHeader>

    {query.success ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{query.success}</p> : null}
    {query.error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{query.error}</p> : null}

    <Card>
      <CardHeader>
        <CardTitle>Source Files</CardTitle>
        <CardDescription>Upload individual files or ZIP packages. ZIP contents are inspected without storing duplicate extracted copies.</CardDescription>
      </CardHeader>
      <CardContent>
        <ProductSourceFiles
          productId={product.id}
          sourceFiles={product.sourceFiles.map((sourceFile) => ({
            id: sourceFile.id,
            originalName: sourceFile.originalName,
            mediaType: sourceFile.mediaType,
            sizeBytes: sourceFile.sizeBytes.toString(),
            sha256: sourceFile.sha256,
            createdAt: sourceFile.createdAt.toISOString(),
            packageManifest: sourceFile.packageManifest as never,
          }))}
        />
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>Processed P2S 3MF</CardTitle><CardDescription>The current PMP-generated project after complete P2S settings replacement and reviewed color mapping.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {processed ? <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
            <div><p className="font-medium text-emerald-900">Processed 3MF ready</p><p className="mt-1 text-xs text-emerald-700">{processed.downloadName} · SHA-256 {processed.sha256.slice(0, 12)}…</p></div>
            <Link prefetch={false} href={`/api/admin/products/${product.id}/files/artifact/processed/download`}><Button>Download for Bambu Studio</Button></Link>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600"><li>Download and open the processed project in Bambu Studio.</li><li>Slice all plates.</li><li>Export a <code>.gcode.3mf</code> print-ready file.</li><li>Upload it below.</li></ol>
        </> : <p className="text-sm text-slate-500">Select a source 3MF above, review every mapping, and generate the processed project.</p>}
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>Print-Ready BamBuddy File</CardTitle><CardDescription>Only Bambu Studio <code>.gcode.3mf</code> files are accepted. Uploading replaces PMP&apos;s current print-ready artifact.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        {printReady ? <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm ${printReadyIsStale ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
          <div><p className="font-medium text-slate-900">{printReady.downloadName}</p><p className="mt-1 text-xs text-slate-600">SHA-256 {printReady.sha256.slice(0, 12)}… · {printReadyIsStale ? "Based on an older processed 3MF" : publishedIsCurrent ? "Published to BamBuddy" : "Ready to publish"}</p></div>
          <Link prefetch={false} href={`/api/admin/products/${product.id}/files/artifact/print-ready/download`}><Button size="sm" variant="secondary">Download</Button></Link>
        </div> : null}
        {processed ? <PrintReadyUpload productId={product.id} /> : <p className="text-sm text-slate-500">Generate the processed P2S 3MF before uploading a sliced file.</p>}
        {printReady ? <div className="space-y-2 border-t border-slate-200 pt-4">
          {!product.importSourceCreatorName?.trim() ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Assign a creator to this Product before publishing. BamBuddy folders use &lt;creator&gt;/&lt;product name&gt;/.</p> : null}
          {printReady.lastPublishError ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">Last publish attempt failed: {printReady.lastPublishError}</p> : null}
          <BambuBuddyPublishButton
            productId={product.id}
            publishedIsCurrent={publishedIsCurrent}
            blockedReason={
              !product.importSourceCreatorName?.trim()
                ? "Publishing is blocked until this product has a creator."
                : printReadyIsStale
                  ? "Publishing is blocked until you slice and upload the current processed 3MF."
                  : undefined
            }
          />
          {product.bambuBuddyFileId ? <p className="text-xs text-slate-500">Current BamBuddy File ID: {product.bambuBuddyFileId}{printReady.bambuBuddyTagsSyncedAt ? ` · Tags synced ${printReady.bambuBuddyTagsSyncedAt.toLocaleString()}` : ""}</p> : null}
        </div> : null}
      </CardContent>
    </Card>
  </div>;
}
