import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { getSessionUser } from "@/server/auth/mock-auth-provider";
import { normalizeUploadedFileName } from "@/server/files/file-name";
import { readP2sReferenceSettings } from "@/server/files/three-mf-processor";
import {
  applicationFileStorageKey,
  privateFileStorage,
  resolvePrivateStoragePath,
} from "@/server/storage/private-file-storage";
import { getSettings } from "@/server/services/settings-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!request.body) return NextResponse.json({ error: "File body is required" }, { status: 400 });
  let originalName: string;
  try {
    originalName = normalizeUploadedFileName(new URL(request.url).searchParams.get("fileName") ?? "");
    if (!originalName.toLowerCase().endsWith(".3mf")) throw new Error("Choose a P2S .3mf reference file.");
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid file name" }, { status: 400 });
  }

  const settings = await getSettings();
  const contentLength = request.headers.get("content-length");
  if (contentLength && BigInt(contentLength) > settings.fileUploadMaxBytes) {
    return NextResponse.json({ error: "File exceeds the configured upload limit." }, { status: 413 });
  }
  const storageKey = applicationFileStorageKey("p2s-reference", originalName);
  try {
    const stored = await privateFileStorage.saveWebStream(storageKey, request.body, settings.fileUploadMaxBytes);
    let extractedSettings;
    try {
      extractedSettings = await readP2sReferenceSettings(resolvePrivateStoragePath(storageKey));
    } catch (error) {
      await privateFileStorage.delete(storageKey);
      throw error;
    }

    const previous = await prisma.applicationFile.findUnique({ where: { kind: "P2S_REFERENCE" } });
    const storedSettings = JSON.parse(JSON.stringify(extractedSettings)) as Prisma.InputJsonValue;
    try {
      const reference = await prisma.applicationFile.upsert({
        where: { kind: "P2S_REFERENCE" },
        create: {
          kind: "P2S_REFERENCE",
          originalName,
          storageKey,
          mediaType: request.headers.get("content-type")?.slice(0, 255) || "model/3mf",
          sizeBytes: stored.sizeBytes,
          sha256: stored.sha256,
          extractedSettings: storedSettings,
        },
        update: {
          originalName,
          storageKey,
          mediaType: request.headers.get("content-type")?.slice(0, 255) || "model/3mf",
          sizeBytes: stored.sizeBytes,
          sha256: stored.sha256,
          extractedSettings: storedSettings,
        },
      });
      await prisma.productMappingDraft.deleteMany();
      if (previous?.storageKey && previous.storageKey !== storageKey) {
        try { await privateFileStorage.delete(previous.storageKey); } catch (error) { console.error("Unable to remove replaced P2S reference", error); }
      }
      revalidatePath("/admin/settings");
      return NextResponse.json({ reference: { ...reference, sizeBytes: reference.sizeBytes.toString() } });
    } catch (error) {
      await privateFileStorage.delete(storageKey);
      throw error;
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save P2S reference." }, { status: 400 });
  }
}
