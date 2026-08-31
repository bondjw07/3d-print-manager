import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/server/auth/mock-auth-provider";
import { attachmentContentDisposition } from "@/server/files/file-name";
import { privateFileStorage } from "@/server/storage/private-file-storage";

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext<"/api/admin/products/[id]/files/source/[fileId]/download">) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: productId, fileId } = await context.params;
  const sourceFile = await prisma.productSourceFile.findFirst({ where: { id: fileId, productId } });
  if (!sourceFile) return NextResponse.json({ error: "File not found" }, { status: 404 });

  try {
    const fileStats = await privateFileStorage.stat(sourceFile.storageKey);
    const stream = privateFileStorage.createReadStream(sourceFile.storageKey);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": sourceFile.mediaType || "application/octet-stream",
        "Content-Length": String(fileStats.size),
        "Content-Disposition": attachmentContentDisposition(sourceFile.originalName),
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Stored file is unavailable" }, { status: 404 });
  }
}
