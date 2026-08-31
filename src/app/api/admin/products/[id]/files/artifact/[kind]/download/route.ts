import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/server/auth/mock-auth-provider";
import { attachmentContentDisposition } from "@/server/files/file-name";
import { privateFileStorage } from "@/server/storage/private-file-storage";

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext<"/api/admin/products/[id]/files/artifact/[kind]/download">) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: productId, kind } = await context.params;
  const artifactKind = kind === "processed" ? "PROCESSED_3MF" : kind === "print-ready" ? "PRINT_READY" : null;
  if (!artifactKind) return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  const artifact = await prisma.productArtifact.findUnique({ where: { productId_kind: { productId, kind: artifactKind } } });
  if (!artifact) return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  try {
    const fileStats = await privateFileStorage.stat(artifact.storageKey);
    return new Response(Readable.toWeb(privateFileStorage.createReadStream(artifact.storageKey)) as ReadableStream, {
      headers: {
        "Content-Type": artifact.mediaType || "application/octet-stream",
        "Content-Length": String(fileStats.size),
        "Content-Disposition": attachmentContentDisposition(artifact.downloadName),
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Stored artifact is unavailable" }, { status: 404 });
  }
}
