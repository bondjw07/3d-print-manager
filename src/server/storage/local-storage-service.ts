import { copyFile, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { ProductImageStorage, SavedProductImage } from "./storage-service";
import { productUploadsDir, resolveProductImageDiskPaths, toProductImagePath } from "./product-image-paths";

export class LocalProductImageStorage implements ProductImageStorage {
  async saveProductImage(file: File): Promise<SavedProductImage> {
    const contentType = file.type.toLowerCase();
    const supportedTypes = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];

    if (!supportedTypes.includes(contentType)) {
      throw new Error("Unsupported image type. Use JPG, PNG, WEBP, or SVG.");
    }

    const ext = this.extFromContentType(contentType);
    const fileName = `${randomUUID()}${ext}`;
    const imagePath = toProductImagePath(fileName);
    if (!imagePath) {
      throw new Error("Unable to save image.");
    }

    await mkdir(productUploadsDir, { recursive: true });

    const bytes = await file.arrayBuffer();
    const finalFilePath = path.join(productUploadsDir, fileName);
    const tempFilePath = `${finalFilePath}.tmp-${randomUUID()}`;
    await writeFile(tempFilePath, Buffer.from(bytes));
    await rename(tempFilePath, finalFilePath);

    // Keep both configured upload locations in sync so existing deployments
    // using either `/uploads` or `/public/uploads` continue to work.
    for (const mirrorPath of resolveProductImageDiskPaths(imagePath).slice(1)) {
      try {
        await mkdir(path.dirname(mirrorPath), { recursive: true });
        await copyFile(finalFilePath, mirrorPath);
      } catch {
        // Best-effort mirror; primary write already succeeded.
      }
    }

    return {
      fileName,
      imagePath,
    };
  }

  async deleteProductImage(imagePath: string): Promise<void> {
    for (const fullPath of resolveProductImageDiskPaths(imagePath)) {
      try {
        await unlink(fullPath);
      } catch {
        // no-op for local development
      }
    }
  }

  private extFromContentType(contentType: string) {
    if (contentType === "image/jpeg") return ".jpg";
    if (contentType === "image/png") return ".png";
    if (contentType === "image/webp") return ".webp";
    return ".svg";
  }
}

export const localProductImageStorage = new LocalProductImageStorage();
