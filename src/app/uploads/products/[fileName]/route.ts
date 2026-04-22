import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { resolveProductImageDiskPaths, toProductImagePath } from "@/server/storage/product-image-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ fileName: string }>;
};

function contentTypeFromFileName(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return null;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { fileName } = await params;
  const imagePath = toProductImagePath(fileName);
  const contentType = contentTypeFromFileName(fileName);

  if (!imagePath || !contentType) {
    return new NextResponse("Not found", { status: 404 });
  }

  for (const filePath of resolveProductImageDiskPaths(imagePath)) {
    try {
      const bytes = await readFile(filePath);
      return new NextResponse(bytes, {
        status: 200,
        headers: {
          "Cache-Control": "public, max-age=31536000, immutable",
          "Content-Type": contentType,
        },
      });
    } catch {
      // Continue to the next candidate location.
    }
  }

  return new NextResponse("Not found", { status: 404 });
}

