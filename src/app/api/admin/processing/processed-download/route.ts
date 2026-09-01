import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import yazl from "yazl";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/server/auth/mock-auth-provider";
import { attachmentContentDisposition } from "@/server/files/file-name";
import { privateFileStorage, resolvePrivateStoragePath } from "@/server/storage/private-file-storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const formData = await request.formData();
  const productIds = Array.from(new Set(formData.getAll("productIds").filter((value): value is string => typeof value === "string" && Boolean(value)))).slice(0, 100);
  if (!productIds.length) return NextResponse.json({ error: "Select at least one processed 3MF." }, { status: 400 });
  const artifacts = await prisma.productArtifact.findMany({
    where: { productId: { in: productIds }, kind: "PROCESSED_3MF" },
    select: { productId: true, storageKey: true, downloadName: true },
  });
  if (artifacts.length !== productIds.length) return NextResponse.json({ error: "One or more selected Products no longer has a processed 3MF." }, { status: 409 });
  try { await Promise.all(artifacts.map((artifact) => privateFileStorage.stat(artifact.storageKey))); }
  catch { return NextResponse.json({ error: "One or more selected processed files is unavailable in storage." }, { status: 404 }); }

  const zip = new yazl.ZipFile();
  const usedNames = new Set<string>();
  for (const artifact of artifacts) {
    let entryName = artifact.downloadName;
    let sequence = 2;
    while (usedNames.has(entryName.toLocaleLowerCase())) {
      entryName = artifact.downloadName.replace(/\.3mf$/i, `-${sequence}.3mf`);
      sequence += 1;
    }
    usedNames.add(entryName.toLocaleLowerCase());
    zip.addFile(resolvePrivateStoragePath(artifact.storageKey), entryName);
  }
  zip.end();
  return new Response(Readable.toWeb(zip.outputStream as Readable) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": attachmentContentDisposition(`PMP-processed-3MFs-${new Date().toISOString().slice(0, 10)}.zip`),
      "Cache-Control": "private, no-store",
    },
  });
}
