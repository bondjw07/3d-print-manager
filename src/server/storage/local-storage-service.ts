import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ProductImageStorage, SavedProductImage } from "./storage-service";

const uploadsDir = path.join(process.cwd(), "public", "uploads", "products");

export class LocalProductImageStorage implements ProductImageStorage {
  async saveProductImage(file: File): Promise<SavedProductImage> {
    const contentType = file.type.toLowerCase();
    const supportedTypes = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];

    if (!supportedTypes.includes(contentType)) {
      throw new Error("Unsupported image type. Use JPG, PNG, WEBP, or SVG.");
    }

    const ext = this.extFromContentType(contentType);
    const fileName = `${randomUUID()}${ext}`;

    await mkdir(uploadsDir, { recursive: true });

    const bytes = await file.arrayBuffer();
    await writeFile(path.join(uploadsDir, fileName), Buffer.from(bytes));

    return {
      fileName,
      imagePath: `/uploads/products/${fileName}`,
    };
  }

  async deleteProductImage(imagePath: string): Promise<void> {
    if (!imagePath.startsWith("/uploads/products/")) {
      return;
    }

    const fullPath = path.join(process.cwd(), "public", imagePath);

    try {
      await unlink(fullPath);
    } catch {
      // no-op for local development
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
