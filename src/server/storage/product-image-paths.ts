import path from "node:path";

const productImageRoutePrefix = "/uploads/products/";
const productImageFileNamePattern = /^[a-z0-9-]+\.(?:jpe?g|png|webp|svg)$/i;

export const productUploadsDir = path.join(process.cwd(), "uploads", "products");
export const legacyProductUploadsDir = path.join(process.cwd(), "public", "uploads", "products");

export function toProductImagePath(fileName: string): string | null {
  if (!productImageFileNamePattern.test(fileName)) {
    return null;
  }

  return `${productImageRoutePrefix}${fileName}`;
}

export function resolveProductImageDiskPaths(imagePath: string): string[] {
  if (!imagePath.startsWith(productImageRoutePrefix)) {
    return [];
  }

  const fileName = imagePath.slice(productImageRoutePrefix.length);
  if (!productImageFileNamePattern.test(fileName)) {
    return [];
  }

  return [
    path.join(productUploadsDir, fileName),
    path.join(legacyProductUploadsDir, fileName),
  ];
}
